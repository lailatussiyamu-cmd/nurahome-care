/**
 * Titik masuk tugas terjadwal.
 *
 * Dipanggil oleh penjadwal di luar aplikasi (Vercel Cron, GitHub Actions,
 * atau crontab biasa + curl). Aplikasinya sendiri tidak menyimpan penjadwal
 * di dalam proses: proses Next.js bisa mati, di-deploy ulang, atau
 * diperbanyak jadi beberapa salinan — penjadwal di dalamnya akan ikut mati
 * diam-diam, atau justru berjalan berkali-kali sekaligus. Penjadwal di luar
 * tidak punya masalah itu.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ENDPOINT INI MENGHAPUS DAN MENGUBAH DATA PASIEN.                     │
 * │  Dijaga oleh CRON_SECRET. Tanpa variabel itu terpasang, endpoint      │
 * │  MENOLAK semua permintaan — bukan berjalan tanpa penjagaan. Sistem    │
 * │  yang "aman selama variabelnya diisi" cepat atau lambat berjalan      │
 * │  tanpa isinya.                                                        │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Cara memanggil:
 *
 *   # lihat apa yang AKAN dikerjakan, tanpa mengubah apa pun
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://.../api/cron?tugas=hapus-foto-kedaluwarsa&kering=1"
 *
 *   # jalankan sungguhan
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://.../api/cron?tugas=hapus-foto-kedaluwarsa"
 *
 *   # jalankan semua yang jatuh tempo
 *   curl -H "Authorization: Bearer $CRON_SECRET" "https://.../api/cron"
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  bookings,
  taskPhotos,
  notifications,
  auditLogs,
  providers,
  users,
  testimoni,
  payments,
} from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { S, namaStatus } from "@/logic/alur";
import {
  TENGGAT,
  BATAS_PER_JALAN,
  TUGAS,
  tugasSah,
  hasilKosong,
  jamBerlalu,
  bolehDidorong,
  bolehHapusFoto,
  type HasilTugas,
  type NamaTugas,
} from "@/logic/tugas";
import { bacaStatusMidtrans, rupiahBulat } from "@/logic/pembayaran";
import { midtransSiap, tanyaStatus } from "@/server/midtrans";
import { terapkanLunas } from "@/server/pelunasan";
import { setelahDibatalkan } from "@/server/pembatalan";
import { beritahuSemuaAdmin } from "@/server/pemberitahuan";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* Penjagaan                                                           */
/* ------------------------------------------------------------------ */

function terotorisasi(req: NextRequest): { boleh: boolean; alasan: string } {
  const rahasia = process.env.CRON_SECRET;

  // Sengaja menolak, bukan mengizinkan, ketika rahasianya belum dipasang.
  if (!rahasia || rahasia.length < 16)
    return {
      boleh: false,
      alasan:
        "CRON_SECRET belum dipasang di server (minimal 16 karakter). Endpoint tugas terjadwal dimatikan sampai ada.",
    };

  const kepala = req.headers.get("authorization") ?? "";
  const dikirim = kepala.startsWith("Bearer ") ? kepala.slice(7) : "";

  // Pembandingan panjang tetap, supaya lamanya jawaban tidak membocorkan
  // seberapa banyak karakter awal yang sudah ditebak benar.
  if (dikirim.length !== rahasia.length)
    return { boleh: false, alasan: "Token tidak cocok." };
  let beda = 0;
  for (let i = 0; i < rahasia.length; i++)
    beda |= dikirim.charCodeAt(i) ^ rahasia.charCodeAt(i);
  if (beda !== 0) return { boleh: false, alasan: "Token tidak cocok." };

  return { boleh: true, alasan: "" };
}

/* ------------------------------------------------------------------ */
/* Tugas 1 — menghapus foto yang lewat masa simpan                     */
/* ------------------------------------------------------------------ */

async function hapusFotoKedaluwarsa(kering: boolean, sekarang: Date): Promise<HasilTugas> {
  const h = hasilKosong("hapus-foto-kedaluwarsa", kering);

  // Hanya foto yang gambarnya masih ada. Yang sudah dihapus barisnya tetap
  // tinggal sebagai catatan bahwa dulu ada foto — lihat komentar di schema.
  const foto = await db.select().from(taskPhotos).where(isNull(taskPhotos.imageDeletedAt));
  const semuaPesanan = await db.select().from(bookings);
  const petaPesanan = new Map(semuaPesanan.map((b) => [b.id, b]));

  /**
   * Kunjungan TERAKHIR setiap pasien, dihitung sekali di muka.
   *
   * Permenkes 24/2022 Pasal 39 ayat (1) menghitung masa simpan dari
   * kunjungan terakhir PASIEN, bukan dari kunjungan yang bersangkutan.
   * Pasien yang datang lagi setelah bertahun-tahun membuat seluruh rekam
   * lamanya ikut diperpanjang.
   */
  const kunjunganTerakhir = new Map<number, string>();
  for (const b of semuaPesanan) {
    const tgl = String(b.scheduledDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) continue;
    const ada = kunjunganTerakhir.get(b.patientId);
    if (!ada || tgl > ada) kunjunganTerakhir.set(b.patientId, tgl);
  }

  const layak: typeof foto = [];
  const ditahan = new Map<string, number>();

  for (const f of foto) {
    h.diperiksa++;
    const pesanan = petaPesanan.get(f.bookingId);
    const cek = bolehHapusFoto(
      pesanan ?? {},
      sekarang,
      pesanan ? (kunjunganTerakhir.get(pesanan.patientId) ?? null) : null
    );
    if (cek.boleh) layak.push(f);
    else if (cek.alasan !== "Belum lewat masa simpan.")
      ditahan.set(cek.alasan, (ditahan.get(cek.alasan) ?? 0) + 1);
  }

  for (const [alasan, jml] of ditahan)
    h.catatan.push(`${jml} foto ditahan — ${alasan}`);

  const dikerjakan = layak.slice(0, BATAS_PER_JALAN);
  if (layak.length > dikerjakan.length)
    h.catatan.push(
      `${layak.length - dikerjakan.length} foto sisa menunggu jalan berikutnya (batas ${BATAS_PER_JALAN} per jalan).`
    );

  if (!kering && dikerjakan.length) {
    await db
      .update(taskPhotos)
      .set({
        // Gambarnya diganti penanda, bukan dikosongkan — supaya layar yang
        // menampilkannya tahu bedanya "belum ada foto" dan "fotonya sudah
        // dihapus karena masa simpannya habis".
        imageUrl: "TERHAPUS:MASA_SIMPAN",
        caption: `Gambar dihapus otomatis setelah masa simpan ${TENGGAT.simpanFotoTahun} tahun.`,
        imageDeletedAt: sekarang,
      })
      .where(inArray(taskPhotos.id, dikerjakan.map((f) => f.id)));
  }

  h.dikenai = dikerjakan.length;
  if (dikerjakan.length) {
    const kode = [...new Set(dikerjakan.map((f) => petaPesanan.get(f.bookingId)?.bookingCode ?? "?"))];
    h.catatan.push(
      `${dikerjakan.length} gambar ${kering ? "AKAN dihapus" : "dihapus"} dari kunjungan: ${kode.join(", ")}.`
    );
  } else {
    h.catatan.push("Tidak ada foto yang lewat masa simpan.");
  }
  return h;
}

/* ------------------------------------------------------------------ */
/* Tugas 2 — penawaran yang tidak dijawab                              */
/* ------------------------------------------------------------------ */

async function penawaranHangus(kering: boolean, sekarang: Date): Promise<HasilTugas> {
  const h = hasilKosong("penawaran-hangus", kering);

  const calon = await db.select().from(bookings).where(eq(bookings.status, S.DITAWARKAN));
  h.diperiksa = calon.length;

  const lewat = calon
    .filter((b) => !b.sengketa)
    .filter((b) => jamBerlalu(b.quotedAt, sekarang) > TENGGAT.penawaranJam)
    .slice(0, BATAS_PER_JALAN);

  for (const b of lewat) {
    if (!kering) {
      // Perawat yang penawarannya hangus TIDAK dimasukkan ke daftar ditolak.
      // Pasien tidak menolaknya — ia hanya tidak sempat menjawab. Menghukum
      // perawat atas diamnya orang lain tidak adil, dan membuat permintaan
      // di daerah yang perawatnya sedikit jadi mustahil ditangani.
      await db
        .update(bookings)
        .set({
          status: S.DITOLAK_PASIEN,
          providerId: null,
          providerName: null,
          quotedByProviderId: null,
          quotedByProviderName: null,
          rejectionReason: `Penawaran hangus otomatis: tidak dijawab dalam ${TENGGAT.penawaranJam} jam.`,
          catatanSistem: `Penawaran hangus ${sekarang.toISOString()}`,
        })
        .where(eq(bookings.id, b.id));

      await db.insert(notifications).values({
        userId: b.patientId,
        title: `Penawaran ${b.bookingCode} sudah lewat batas`,
        message: `Rincian biaya dari perawat berlaku ${TENGGAT.penawaranJam} jam dan belum Anda jawab. Permintaan Anda kami teruskan ke perawat lain — tidak ada yang ditagihkan.`,
        type: "BOOKING",
        read: false,
      });
    }
    h.catatan.push(`${b.bookingCode} — penawaran ${Math.round(jamBerlalu(b.quotedAt, sekarang))} jam tanpa jawaban.`);
  }

  h.dikenai = lewat.length;
  if (!lewat.length) h.catatan.push("Tidak ada penawaran yang lewat batas.");
  return h;
}

/* ------------------------------------------------------------------ */
/* Tugas 3 — permintaan yang tidak diambil siapa pun                   */
/* ------------------------------------------------------------------ */

async function permintaanMenggantung(kering: boolean, sekarang: Date): Promise<HasilTugas> {
  const h = hasilKosong("permintaan-menggantung", kering);

  const calon = await db
    .select()
    .from(bookings)
    .where(inArray(bookings.status, [S.MENUNGGU_TINJAUAN, S.DITOLAK_PASIEN]));
  h.diperiksa = calon.length;

  const semuaLama = calon.filter(
    (b) => jamBerlalu(b.createdAt, sekarang) > TENGGAT.tanpaPenanganJam
  );
  const lama = semuaLama
    .filter((b) => bolehDidorong(b.terakhirDidorong, sekarang))
    .slice(0, BATAS_PER_JALAN);

  const diamDulu = semuaLama.length - lama.length;
  if (diamDulu > 0)
    h.catatan.push(
      `${diamDulu} permintaan sudah diingatkan dalam ${TENGGAT.jedaDorongJam} jam terakhir — tidak diulang.`
    );

  const idAdmin = lama.length
    ? (await db.select().from(users).where(eq(users.role, "ADMIN"))).map((u) => u.id)
    : [];

  // Tugas ini SENGAJA tidak mengubah status apa pun. Permintaan yang tidak
  // tertangani bukan masalah yang bisa diselesaikan basis data — yang perlu
  // terjadi adalah ada orang yang menelepon pasiennya. Jadi yang dikerjakan
  // hanya memberi tahu admin.
  for (const b of lama) {
    if (!kering) {
      // Dua pemberitahuan: ke pasien supaya ia tidak menunggu dalam diam,
      // dan ke admin supaya ada orang yang benar-benar menindaklanjuti.
      await db.insert(notifications).values({
        userId: b.patientId,
        title: `Permintaan ${b.bookingCode} masih dicarikan perawat`,
        message:
          "Maaf, permintaan Anda belum ada perawat yang mengambil. Kami sedang mencarikan. Kalau mendesak, hubungi kami langsung.",
        type: "BOOKING",
        read: false,
      });
      for (const a of idAdmin) {
        await db.insert(notifications).values({
          userId: a,
          title: `Perlu ditindaklanjuti: ${b.bookingCode}`,
          message: `Permintaan ${b.serviceName} sudah ${Math.round(
            jamBerlalu(b.createdAt, sekarang)
          )} jam tanpa perawat. Hubungi pasien atau tugaskan manual.`,
          type: "BOOKING",
          read: false,
        });
      }
      await db
        .update(bookings)
        .set({ terakhirDidorong: sekarang })
        .where(eq(bookings.id, b.id));
    }
    h.catatan.push(
      `${b.bookingCode} — ${Math.round(jamBerlalu(b.createdAt, sekarang))} jam tanpa penangan (${namaStatus(b.status)}).`
    );
  }

  h.dikenai = lama.length;
  // Kalimat penutup harus cocok dengan keadaannya. Sebelumnya ia selalu
  // berbunyi "semua sudah ada yang menangani" — termasuk ketika sebenarnya
  // ada yang menggantung, hanya saja sedang dalam masa jeda pengingat.
  if (!lama.length && !diamDulu)
    h.catatan.push("Semua permintaan sudah ada yang menangani.");
  return h;
}

/* ------------------------------------------------------------------ */
/* Tugas 4 — disetujui tapi tidak dibayar                              */
/* ------------------------------------------------------------------ */

async function belumDibayar(kering: boolean, sekarang: Date): Promise<HasilTugas> {
  const h = hasilKosong("belum-dibayar", kering);

  const calon = await db.select().from(bookings).where(eq(bookings.status, S.DISETUJUI));
  h.diperiksa = calon.length;

  const lewat = calon
    .filter((b) => !b.sengketa)
    .filter((b) => jamBerlalu(b.approvedAt, sekarang) > TENGGAT.belumDibayarJam)
    .slice(0, BATAS_PER_JALAN);

  for (const b of lewat) {
    if (!kering) {
      /**
       * Bersyarat: hanya kalau MASIH belum dibayar. Kabar lunas bisa tiba
       * di detik yang sama; tanpa syarat ini, pembatalan ini menimpa
       * pemesanan yang baru saja dibayar.
       */
      const [batal] = await db
        .update(bookings)
        .set({
          status: S.DIBATALKAN,
          catatanSistem: `Dibatalkan otomatis: tidak dibayar dalam ${TENGGAT.belumDibayarJam} jam.`,
        })
        .where(and(eq(bookings.id, b.id), eq(bookings.status, S.DISETUJUI)))
        .returning();
      if (!batal) continue;
      await setelahDibatalkan(batal, "otomatis karena belum dibayar");

      await db.insert(notifications).values({
        userId: b.patientId,
        title: `${b.bookingCode} dibatalkan — belum dibayar`,
        message: `Pemesanan Anda dibatalkan karena tidak dibayar dalam ${TENGGAT.belumDibayarJam} jam, supaya jadwal perawat bisa dipakai pasien lain. Persetujuan tindakan yang sudah Anda tanda tangani tetap tersimpan. Anda bisa memesan lagi kapan saja.`,
        type: "BOOKING",
        read: false,
      });
    }
    h.catatan.push(
      `${b.bookingCode} — disetujui ${Math.round(jamBerlalu(b.approvedAt, sekarang))} jam lalu, belum dibayar.`
    );
  }

  h.dikenai = lewat.length;
  if (!lewat.length) h.catatan.push("Tidak ada pemesanan yang menggantung tanpa bayar.");
  return h;
}

/* ------------------------------------------------------------------ */
/* Tugas 5 — kunjungan yang laporannya belum ditutup                   */
/* ------------------------------------------------------------------ */

async function kunjunganBelumDitutup(kering: boolean, sekarang: Date): Promise<HasilTugas> {
  const h = hasilKosong("kunjungan-belum-ditutup", kering);

  const calon = await db
    .select()
    .from(bookings)
    .where(inArray(bookings.status, [S.PERAWAT_TIBA, S.DIKERJAKAN]));
  h.diperiksa = calon.length;

  const semuaLama = calon.filter(
    (b) => jamBerlalu(b.reviewStartedAt ?? b.createdAt, sekarang) > TENGGAT.belumDitutupJam
  );
  const lama = semuaLama
    .filter((b) => bolehDidorong(b.terakhirDidorong, sekarang))
    .slice(0, BATAS_PER_JALAN);

  const diamDulu = semuaLama.length - lama.length;
  if (diamDulu > 0)
    h.catatan.push(
      `${diamDulu} kunjungan sudah diingatkan dalam ${TENGGAT.jedaDorongJam} jam terakhir — tidak diulang.`
    );

  // Statusnya tidak diubah. Kunjungan yang laporannya belum ditandatangani
  // bukan berarti tidak dikerjakan — bisa jadi perawatnya kehabisan baterai
  // atau sinyal. Menutupnya otomatis berarti membuat laporan atas nama
  // orang yang tidak menulisnya. Yang boleh dilakukan sistem hanya
  // mengingatkan.
  for (const b of lama) {
    if (!kering && b.providerId != null) {
      const [perawat] = await db.select().from(providers).where(eq(providers.id, b.providerId));
      if (perawat?.userId) {
        await db.insert(notifications).values({
          userId: perawat.userId,
          title: `Laporan ${b.bookingCode} belum ditandatangani`,
          message: `Kunjungan ini masih berstatus "${namaStatus(b.status)}". Mohon lengkapi foto dan laporan tindakannya.`,
          type: "CLINICAL",
          read: false,
        });
      }
      await db
        .update(bookings)
        .set({ terakhirDidorong: sekarang })
        .where(eq(bookings.id, b.id));
    }
    h.catatan.push(`${b.bookingCode} — ${namaStatus(b.status)}, belum ditutup.`);
  }

  h.dikenai = lama.length;
  if (!lama.length && !diamDulu)
    h.catatan.push("Tidak ada kunjungan yang menggantung.");
  return h;
}

/* ------------------------------------------------------------------ */
/* Tugas 6 — pengingat sehari sebelum kunjungan                        */
/* ------------------------------------------------------------------ */

async function pengingatKunjungan(kering: boolean, sekarang: Date): Promise<HasilTugas> {
  const h = hasilKosong("pengingat-kunjungan", kering);

  const besok = new Date(sekarang);
  besok.setDate(besok.getDate() + 1);
  const tanggalBesok = besok.toISOString().slice(0, 10);

  const calon = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.scheduledDate, tanggalBesok),
        inArray(bookings.status, [S.DIBAYAR, S.DISETUJUI])
      )
    );
  h.diperiksa = calon.length;

  const kirim = calon.slice(0, BATAS_PER_JALAN);
  for (const b of kirim) {
    if (!kering) {
      await db.insert(notifications).values({
        userId: b.patientId,
        title: `Besok: kunjungan ${b.bookingCode}`,
        message: `${b.providerName ?? "Perawat"} dijadwalkan datang besok pukul ${b.scheduledTimeSlot}. Siapkan tempat yang terang di dekat pasien, dan jangan buka balutan sebelum perawat tiba.`,
        type: "BOOKING",
        read: false,
      });
      if (b.providerId != null) {
        const [perawat] = await db.select().from(providers).where(eq(providers.id, b.providerId));
        if (perawat?.userId) {
          await db.insert(notifications).values({
            userId: perawat.userId,
            title: `Besok: ${b.bookingCode} di ${b.addressText.slice(0, 40)}`,
            message: `Kunjungan besok pukul ${b.scheduledTimeSlot}. Periksa kelengkapan bahan sebelum berangkat.`,
            type: "BOOKING",
            read: false,
          });
        }
      }
    }
    h.catatan.push(`${b.bookingCode} — pengingat untuk ${tanggalBesok} ${b.scheduledTimeSlot}.`);
  }

  h.dikenai = kirim.length;
  if (!kirim.length) h.catatan.push(`Tidak ada kunjungan terjadwal ${tanggalBesok}.`);
  return h;
}

/* ------------------------------------------------------------------ */
/* Tugas 7 — masukan pasien yang belum disortir ke perawat             */
/* ------------------------------------------------------------------ */

async function testimoniBelumDisortir(kering: boolean, sekarang: Date): Promise<HasilTugas> {
  const h = hasilKosong("testimoni-belum-disortir", kering);

  const semua = await db.select().from(testimoni);
  const menunggu = semua.filter((t) => t.statusKePerawat !== "DITERUSKAN");
  h.diperiksa = menunggu.length;

  const lama = menunggu
    .filter((t) => jamBerlalu(t.createdAt, sekarang) > TENGGAT.sortirTestimoniJam)
    .slice(0, BATAS_PER_JALAN);

  // SENGAJA tidak meneruskan otomatis. Meneruskan kritik yang belum
  // diverifikasi bisa merugikan perawat yang ternyata tidak bersalah, dan
  // penyortiran memang wewenang admin. Yang dikerjakan tugas ini hanya
  // memastikan tidak ada yang terlupakan diam-diam.
  const idAdmin = lama.length
    ? (await db.select().from(users).where(eq(users.role, "ADMIN"))).map((u) => u.id)
    : [];

  for (const t of lama) {
    if (!kering) {
      for (const a of idAdmin) {
        await db.insert(notifications).values({
          userId: a,
          title: `Belum disortir: masukan ${t.bintang}★ untuk ${t.providerName ?? "perawat"}`,
          message: `Sudah ${Math.round(
            jamBerlalu(t.createdAt, sekarang) / 24
          )} hari belum diteruskan. Pasien menunggu, dan perawatnya belum tahu ada masukan ini.`,
          type: "CLINICAL",
          read: false,
        });
      }
    }
    h.catatan.push(
      `#${t.id} (${t.bintang}★) — ${Math.round(
        jamBerlalu(t.createdAt, sekarang) / 24
      )} hari, status ${t.statusKePerawat}.`
    );
  }

  h.dikenai = lama.length;
  if (!lama.length) h.catatan.push("Tidak ada masukan yang tertahan lama.");
  return h;
}

/* ------------------------------------------------------------------ */
/* Mencocokkan pembayaran yang kabarnya tidak pernah sampai            */
/* ------------------------------------------------------------------ */

/**
 * Bertanya langsung ke Midtrans tentang pembayaran yang masih MENUNGGU.
 *
 * Kenapa perlu, padahal sudah ada webhook: kabar dari penyedia bisa tidak
 * pernah sampai. Jaringan putus saat kabarnya dikirim, server sedang
 * di-deploy, alamat webhook salah ketik di dasbor. Tanpa tugas ini, satu
 * kabar yang hilang berarti pasien SUDAH membayar tetapi kunjungannya
 * dibatalkan otomatis setelah 24 jam karena tercatat belum dibayar.
 * Uangnya masuk, jadwalnya hilang.
 *
 * Jawaban dari sini boleh dipercaya tanpa memeriksa tanda tangan: yang
 * bertanya adalah server, ke alamat Midtrans, dengan server key-nya
 * sendiri. Berbeda dengan webhook, yang alamatnya bisa dipanggil siapa pun.
 */
async function cocokkanPembayaran(kering: boolean, sekarang: Date): Promise<HasilTugas> {
  const h = hasilKosong("cocokkan-pembayaran", kering);

  const semua = await db.select().from(payments).where(eq(payments.status, "MENUNGGU"));
  const perlu = semua
    .filter((p) => jamBerlalu(p.createdAt, sekarang) >= TENGGAT.cocokkanBayarJam)
    .filter((p) => !p.expiresAt || new Date(p.expiresAt) > new Date(sekarang.getTime() - 86_400_000))
    .slice(0, BATAS_PER_JALAN);

  h.diperiksa = perlu.length;
  if (!perlu.length) {
    h.catatan.push("Tidak ada pembayaran yang perlu dicocokkan.");
    return h;
  }

  if (!midtransSiap().siap) {
    h.catatan.push(`Dilewati: ${midtransSiap().alasan}`);
    return h;
  }

  for (const p of perlu) {
    const jawab = await tanyaStatus(p.orderId);
    if (!jawab.ok) {
      h.catatan.push(`${p.orderId} — tidak bisa ditanyakan: ${jawab.galat}`);
      continue;
    }

    const { hasil, alasan } = bacaStatusMidtrans({
      transactionStatus: jawab.kabar.transaction_status,
      fraudStatus: jawab.kabar.fraud_status,
    });
    if (hasil === "MENUNGGU") continue;

    /**
     * Nominal tetap dicocokkan, sama seperti di webhook. Jalur yang
     * berbeda tidak boleh punya penjagaan yang berbeda — kalau salah
     * satunya lebih longgar, itulah yang akan dipakai.
     */
    const nominal = rupiahBulat(Number(jawab.kabar.gross_amount));
    if (hasil === "LUNAS" && nominal !== rupiahBulat(p.amountIdr)) {
      h.catatan.push(
        `${p.orderId} — DITAHAN: nominal ${nominal} tidak cocok dengan ${p.amountIdr}.`
      );
      if (!kering) {
        await db
          .update(payments)
          .set({ status: "PERLU_TINJAUAN", statusReason: "Nominal tidak cocok saat pencocokan.", updatedAt: sekarang })
          .where(eq(payments.id, p.id));
        await db
          .update(bookings)
          .set({ sengketa: true, catatanSistem: "Sengketa otomatis — nominal pembayaran tidak cocok." })
          .where(eq(bookings.id, p.bookingId));
      }
      h.dikenai += 1;
      continue;
    }

    h.catatan.push(
      `${p.orderId} — kabarnya tidak pernah sampai; Midtrans menjawab ${hasil}.${alasan ? ` ${alasan}` : ""}`
    );
    h.dikenai += 1;
    if (kering) continue;

    await db
      .update(payments)
      .set({
        status: hasil,
        statusReason: alasan || "Diketahui lewat pencocokan, bukan lewat kabar.",
        paymentType: jawab.kabar.payment_type ?? null,
        providerTxnId: jawab.kabar.transaction_id ?? null,
        paidAt: hasil === "LUNAS" ? sekarang : null,
        updatedAt: sekarang,
      })
      .where(eq(payments.id, p.id));

    if (hasil === "LUNAS") {
      /** Penjagaan yang sama dengan webhook: batal, ganda, terlambat. */
      await terapkanLunas({ bayar: p, metode: String(jawab.kabar.payment_type ?? "-") });
    }
  }

  return h;
}

/* ------------------------------------------------------------------ */
/* Keselamatan perawat — terlalu lama di rumah pasien tanpa kabar      */
/* ------------------------------------------------------------------ */

/**
 * Perawat bekerja sendirian di rumah orang yang belum pernah ia temui.
 * Tombol "Minta bantuan" hanya menolong perawat yang masih bisa
 * menekannya. Tugas ini untuk yang tidak bisa.
 *
 * Patokannya foto KEDATANGAN — satu-satunya waktu tiba yang tercatat dan
 * tidak bisa ditulis sembarangan. Yang diberi tahu ADMIN, bukan perawatnya:
 * yang dibutuhkan di sini adalah orang lain yang menelepon.
 */
async function perawatBelumKabar(kering: boolean, sekarang: Date): Promise<HasilTugas> {
  const h = hasilKosong("perawat-belum-kabar", kering);

  const calon = await db
    .select()
    .from(bookings)
    .where(inArray(bookings.status, [S.PERAWAT_TIBA, S.DIKERJAKAN]));
  h.diperiksa = calon.length;

  for (const b of calon.slice(0, BATAS_PER_JALAN)) {
    const [tiba] = await db
      .select()
      .from(taskPhotos)
      .where(and(eq(taskPhotos.bookingId, b.id), eq(taskPhotos.photoType, "ARRIVAL_CONFIRMATION")));
    if (!tiba) continue;
    const jam = jamBerlalu(tiba.timestamp, sekarang);
    if (jam < TENGGAT.perawatDiRumahJam) continue;

    const judul = `Perawat belum kabar — ${b.bookingCode}`;
    // Diulang paling sering sekali per jam, bukan tiap 30 menit.
    const sudah = await db.select().from(notifications).where(eq(notifications.title, judul));
    if (sudah.some((n) => jamBerlalu(n.createdAt, sekarang) < 1)) continue;

    h.dikenai += 1;
    h.catatan.push(`${b.bookingCode} — ${b.providerName ?? "perawat"} tiba ${Math.round(jam)} jam lalu, belum menutup kunjungan.`);
    if (kering) continue;

    const [perawat] = b.providerId != null ? await db.select().from(providers).where(eq(providers.id, b.providerId)) : [];
    const [akun] = perawat?.userId ? await db.select().from(users).where(eq(users.id, perawat.userId)) : [];
    await beritahuSemuaAdmin(
      judul,
      `${b.providerName ?? "Perawat"} tiba di ${b.addressText} ${Math.round(jam)} jam lalu dan belum menutup kunjungan. Telepon perawatnya${akun?.phone ? ` (${akun.phone})` : ""} sekarang; bila tidak bisa dihubungi, hubungi keluarga pasien.`,
      "KESELAMATAN",
      { whatsapp: true }
    );
  }

  if (!h.dikenai) h.catatan.push("Tidak ada perawat yang terlalu lama tanpa kabar.");
  return h;
}

/* ------------------------------------------------------------------ */
/* Pengatur                                                            */
/* ------------------------------------------------------------------ */

const PELAKSANA: Record<NamaTugas, (kering: boolean, sekarang: Date) => Promise<HasilTugas>> = {
  /**
   * Urutannya penting: pencocokan pembayaran berjalan SEBELUM
   * "belum-dibayar". Kalau terbalik, kunjungan yang uangnya sudah masuk
   * tapi kabarnya hilang akan dibatalkan lebih dulu, lalu dicocokkan
   * setelahnya — dan yang dicocokkan sudah telanjur batal.
   */
  "cocokkan-pembayaran": cocokkanPembayaran,
  "testimoni-belum-disortir": testimoniBelumDisortir,
  "hapus-foto-kedaluwarsa": hapusFotoKedaluwarsa,
  "penawaran-hangus": penawaranHangus,
  "permintaan-menggantung": permintaanMenggantung,
  "belum-dibayar": belumDibayar,
  "kunjungan-belum-ditutup": kunjunganBelumDitutup,
  "perawat-belum-kabar": perawatBelumKabar,
  "pengingat-kunjungan": pengingatKunjungan,
};

export async function GET(req: NextRequest) {
  const izin = terotorisasi(req);
  if (!izin.boleh) {
    // 401, dan alasannya tidak dirinci ke pemanggil yang tidak berhak.
    console.warn("Tugas terjadwal ditolak:", izin.alasan);
    return NextResponse.json({ error: "Tidak berwenang" }, { status: 401 });
  }

  const url = new URL(req.url);
  const kering = url.searchParams.get("kering") === "1";
  const minta = url.searchParams.get("tugas");
  const sekarang = new Date();

  const daftar: NamaTugas[] = minta
    ? tugasSah(minta)
      ? [minta]
      : []
    : TUGAS.map((t) => t.nama);

  if (minta && !daftar.length)
    return NextResponse.json(
      { error: `Tugas "${minta}" tidak dikenal.`, tersedia: TUGAS.map((t) => t.nama) },
      { status: 400 }
    );

  const hasil: HasilTugas[] = [];
  for (const nama of daftar) {
    try {
      hasil.push(await PELAKSANA[nama](kering, sekarang));
    } catch (e) {
      // Satu tugas gagal tidak boleh menghentikan sisanya — kalau iya,
      // satu kesalahan kecil membuat penghapusan foto ikut berhenti
      // berbulan-bulan tanpa ada yang sadar.
      console.error(`Tugas ${nama} gagal:`, e);
      hasil.push({
        nama,
        ujiKering: kering,
        diperiksa: 0,
        dikenai: 0,
        catatan: [],
        galat: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Jejak audit ditulis walau uji kering, supaya terlihat siapa memeriksa
  // apa dan kapan. Yang membedakan hanya kata "UJI KERING" di catatannya.
  const totalKena = hasil.reduce((t, x) => t + x.dikenai, 0);
  const gagal = hasil.filter((x) => x.galat);
  if (totalKena > 0 || gagal.length) {
    await db.insert(auditLogs).values({
      userId: null,
      userRole: "SISTEM",
      action: kering ? "TUGAS_TERJADWAL_UJI_KERING" : "TUGAS_TERJADWAL",
      resourceType: "cron",
      resourceId: daftar.join(","),
      details: hasil
        .map((x) => `${x.nama}: ${x.dikenai}/${x.diperiksa}${x.galat ? ` GAGAL(${x.galat})` : ""}`)
        .join(" | "),
    });
  }

  return NextResponse.json(
    {
      waktu: sekarang.toISOString(),
      ujiKering: kering,
      totalDikenai: totalKena,
      hasil,
    },
    { status: gagal.length ? 500 : 200 }
  );
}

/** POST diperlakukan sama — sebagian penjadwal hanya bisa mengirim POST. */
export async function POST(req: NextRequest) {
  return GET(req);
}
