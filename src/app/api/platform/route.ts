import { NextRequest, NextResponse } from "next/server";
import { bolehBatal } from "@/logic/sesi";
import {
  S,
  bolehPindah,
  namaStatus,
  totalPenawaran,
  honorDariItem,
  penghalangKirimPenawaran,
  penawaranSebagaiTeks,
  type ItemPenawaran,
} from "@/logic/alur";
import { teksPersetujuanFoto, teksPersetujuanTindakan, VERSI_CONSENT } from "@/logic/consent";
import {
  namaTayang,
  wilayahDariAlamat,
  penghalangKirim,
  penghalangTayang,
  penghalangEdit,
  penghalangTahan,
  bolehDitahan,
  type IzinTayang,
} from "@/logic/testimoni";
import { rp } from "@/logic/biaya";
import { BATAS_FOTO_PERMINTAAN, penghalangFoto } from "@/logic/gambar";
import { db } from "@/db";
import {
  services,
  providers,
  payouts,
  bookings,
  woundAssessments,
  circumcisionAssessments,
  clinicalNotes,
  woundTimelineEntries,
  dependents,
  addresses,
  reviews,
  notifications,
  messages,
  auditLogs,
  taskPhotos,
  users,
  quoteItems,
  consents,
  visitReports,
  testimoni,
  providerDocuments,
  verificationReviews,
  woundexChecks,
} from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import {
  bacaSinyal,
  nilaiWoundex,
  selisihHari,
  NAMA_TINGKAT,
  VERSI_ATURAN_WOUNDEX,
  type TitikLuas,
} from "@/logic/woundex";
import {
  aktorDariPermintaan,
  perawatDariAktor,
  harusAdmin,
  harusMasuk,
  harusPerawat,
  pesananDipegangPerawat,
  pesananMilikPasien,
  cabutSemuaSesi,
  type Aktor,
} from "@/server/aktor";
import { susunTampilan } from "@/server/tampilan";
import {
  NAMA_VERIFIKASI,
  bolehMenerimaKunjungan,
  penghalangAjuVerifikasi,
  penghalangPutusVerifikasi,
  type StatusVerifikasi,
} from "@/logic/verifikasi";
import { desc, eq } from "drizzle-orm";
import { catatBagiHasil } from "@/server/bagihasil";
import { penghalangPembayaranHonor, type StatusBagiHasil } from "@/logic/bagihasil";

/**
 * Data untuk layar.
 *
 * Dulu fungsi ini mengembalikan SELURUH isi basis data ke browser mana pun,
 * tanpa satu pun pemeriksaan, dan penyaringan perannya dikerjakan di
 * page.tsx setelah semuanya terkirim. Sekarang jawabannya disusun menurut
 * siapa yang bertanya — lihat server/tampilan.ts untuk aturannya.
 */
export async function GET() {
  try {
    await ensureSeeded();
    const aktor = await aktorDariPermintaan();

    /**
     * `no-store`, karena jawaban ini membawa foto luka.
     *
     * Diperiksa pada aplikasi yang berjalan: sebelumnya TIDAK ADA satu pun
     * kepala cache di sini. Tanpa arahan yang tegas, peramban boleh
     * menyimpan jawabannya di cache disk menurut perkiraannya sendiri —
     * dan yang tersimpan itu foto luka, alamat rumah, serta catatan
     * klinis. Akibatnya nyata pada dua keadaan yang lazim: ponsel keluarga
     * yang dipakai bergantian, dan ponsel perawat yang suatu saat dijual
     * atau diservis.
     */
    const res = NextResponse.json(await susunTampilan(aktor));
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.headers.set("Pragma", "no-cache");
    return res;
  } catch (error) {
    console.error("GET /api/platform error:", error);
    return NextResponse.json(
      { error: "Gagal memuat data." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    /**
     * Siapa yang mengirim permintaan ini — dari COOKIE SESI, bukan dari
     * badan permintaan.
     *
     * Sebelum baris ini ada, setiap penjagaan di bawah berbunyi seperti
     * `if (actorRole !== "ADMIN")` dengan `actorRole` yang dikirim browser.
     * Artinya penjagaan itu bertanya kepada penyerang apakah ia penyerang,
     * dan jawabannya selalu dipercaya.
     *
     * Nama-nama lama (actorRole, actorUserId, actorProviderId) sekarang
     * DIABAIKAN sepenuhnya. Ada skrip pemeriksa yang menggagalkan build
     * kalau nama itu terbaca lagi dari `body`.
     */
    const aktor: Aktor = await aktorDariPermintaan();
    const actorRole = aktor.peran;
    const actorUserId = aktor.userId;
    const actorProviderId = aktor.providerId;
    const actorNama = aktor.nama;
    const actorProviderName = aktor.nama;

    /** Tidak ada satu pun aksi di berkas ini yang boleh dilakukan tamu. */
    const belumMasuk = harusMasuk(aktor);
    if (belumMasuk) return NextResponse.json({ error: belumMasuk }, { status: 401 });

    // 1. CREATE NEW BOOKING (with Wound or Circumcision Pre-Assessment)
    /**
     * Pasien mengirim PERMINTAAN, bukan pesanan yang sudah berharga.
     *
     * Sebelumnya aksi ini langsung menunjuk perawat, menetapkan harga, dan
     * menandai `paymentStatus: "PAID"` — pembayaran yang tidak pernah
     * terjadi, dicatat sebagai sudah terjadi. Untuk perawatan luka harga
     * juga belum bisa dipastikan: bahan yang dibutuhkan baru diketahui
     * setelah ada yang melihat lukanya.
     *
     * Sekarang yang tersimpan hanya keluhan, alamat, jadwal yang diinginkan,
     * dan foto luka. Harga menyusul lewat penawaran perawat.
     */
    if (action === "CREATE_BOOKING") {
      const { dependentName, serviceId, serviceName, serviceCategory, addressId, addressText, scheduledDate, scheduledTimeSlot, triageRedFlag, triageNotes, woundAssessment, circumcisionAssessment, fotoLuka, persetujuanFoto } = body;

      // Tanda bahaya tidak boleh berubah jadi kunjungan rumah, sekuat apa
      // pun permintaannya. Wizard sudah menahannya di layar; di sini
      // ditahan lagi, karena layar bisa dilewati dan API tidak bisa.
      if (triageRedFlag) {
        return NextResponse.json(
          {
            error:
              "Ada tanda bahaya pada keterangan Anda. Kunjungan rumah tidak bisa dipesan — hubungi 119 atau IGD terdekat.",
          },
          { status: 409 }
        );
      }

      /**
       * Kode pemesanan: acak, TAPI dengan percobaan ulang bila bentrok.
       *
       * Versi sebelumnya `NHC-<tahun>-<4 angka acak>` — hanya 9.000
       * kemungkinan, dan kolomnya unik. Dengan 70 pemesanan saja peluang
       * bentroknya sudah ±24% (paradoks ulang tahun), dan yang terjadi saat
       * bentrok bukan kode lain: pemesanannya GAGAL, dan pasien menerima
       * "Failed to process platform action" — kalimat yang tidak
       * memberitahu apa pun dan tidak bisa ditindaklanjuti siapa pun.
       *
       * Ketahuan karena satu tes berkedip merah, bukan karena membaca kode.
       * Di lapangan ia akan muncul sebagai keluhan "kadang tidak bisa
       * memesan" yang sangat sulit ditelusuri.
       *
       * Sekarang 5 angka (90.000 kemungkinan) dan sampai 5 kali percobaan.
       * Peluang lima-lima-nya bentrok dapat diabaikan sampai puluhan ribu
       * pemesanan; kalau itu pun habis, pesannya jujur dan bisa dicoba lagi.
       */
      const tahun = new Date().getFullYear();
      let dibuat: typeof bookings.$inferSelect | undefined;
      let galatKode: unknown = null;

      for (let percobaan = 0; percobaan < 5 && !dibuat; percobaan++) {
        const bookingCode = `NHC-${tahun}-${Math.floor(10000 + Math.random() * 90000)}`;
        try {
          [dibuat] = await db
            .insert(bookings)
            .values({
              bookingCode,
              /**
               * Pasien pemilik pemesanan diambil dari SESI.
               *
               * Sebelumnya keduanya dikirim browser. Artinya siapa pun bisa
               * membuat permintaan atas nama orang lain — dan yang lebih buruk,
               * memasukkan foto luka serta keluhan ke dalam berkas orang itu.
               */
              patientId: aktor.userId!,
              patientName: aktor.nama ?? "Pasien",
              dependentName: dependentName || null,
              serviceId: Number(serviceId) || 1,
              serviceName: serviceName || "Kunjungan perawatan di rumah",
              serviceCategory: serviceCategory || "WOUND_CARE",
              // Belum ada perawat. Penugasan terjadi saat ada yang meninjau.
              providerId: null,
              providerName: null,
              addressId: addressId != null ? Number(addressId) : null,
              addressText,
              scheduledDate,
              scheduledTimeSlot,
              status: S.MENUNGGU_TINJAUAN,
              // Semua angka nol sampai perawat menawarkan. Nol di sini berarti
              // "belum dihitung", dan layar memang menampilkannya begitu —
              // bukan menampilkan tarif tebakan sebagai kepastian.
              basePriceIdr: 0,
              distanceFeeIdr: 0,
              suppliesFeeIdr: 0,
              emergencyFeeIdr: 0,
              totalPriceIdr: 0,
              paymentMethod: "-",
              paymentStatus: "BELUM",
              triageRedFlag: false,
              triageNotes: triageNotes || null,
            })
            .returning();
        } catch (e) {
          /**
           * Hanya bentrok kode yang boleh dicoba ulang. Galat lain
           * (basis data mati, kolom hilang) dilempar apa adanya — mengulang
           * lima kali untuk galat yang bukan bentrok hanya memperlambat
           * kegagalan dan mengaburkan sebabnya.
           */
          const pesan = e instanceof Error ? e.message : String(e);
          if (!/booking_code|unique|duplicate/i.test(pesan)) throw e;
          galatKode = e;
        }
      }

      if (!dibuat) {
        console.error("Gagal membuat kode pemesanan unik:", galatKode);
        return NextResponse.json(
          { error: "Gagal membuat nomor pemesanan. Coba kirim ulang permintaannya." },
          { status: 503 }
        );
      }

      /**
       * Batas ukuran diperiksa DI SINI, bukan hanya di browser.
       *
       * Pengecilan di browser adalah kemudahan; siapa pun bisa memanggil
       * API ini langsung tanpa membuka layar. Sebelum penjagaan ini ada,
       * satu kiriman berisi 4 foto kamera penuh — 21,3 MB — diterima
       * dengan HTTP 200 tanpa keluhan, lalu mengendap di basis data
       * selamanya. Diukur pada aplikasi yang berjalan, 9 September 2026.
       */
      const halanganFoto = penghalangFoto(fotoLuka);
      if (halanganFoto) return NextResponse.json({ error: halanganFoto }, { status: 413 });

      // Foto luka dari pasien. Disimpan hanya kalau ia menyetujui secara
      // tegas — UU 27/2022 Pasal 20 ayat (2) huruf a.
      const daftarFoto: string[] = Array.isArray(fotoLuka) ? fotoLuka : [];
      if (daftarFoto.length && persetujuanFoto) {
        await db.insert(taskPhotos).values(
          daftarFoto.slice(0, BATAS_FOTO_PERMINTAAN).map((url: string) => ({
            bookingId: dibuat.id,
            providerId: null,
            providerName: null,
            uploadedByRole: "PASIEN",
            photoType: "INTAKE_LUKA",
            imageUrl: url,
            caption: "Foto dikirim pasien saat mengajukan permintaan",
            verifiedByProvider: false,
          }))
        );
      }

      if (serviceCategory === "WOUND_CARE" && woundAssessment) {
        await db.insert(woundAssessments).values({
          bookingId: dibuat.id,
          patientId: aktor.userId!,
          woundLocation: woundAssessment.woundLocation || "Belum disebutkan",
          woundDuration: woundAssessment.woundDuration || "Belum disebutkan",
          causeOfWound: woundAssessment.causeOfWound || "Belum disebutkan",
          lengthCm: Number(woundAssessment.lengthCm) || 0,
          widthCm: Number(woundAssessment.widthCm) || 0,
          depthCm: Number(woundAssessment.depthCm) || 0,
          tissueType: woundAssessment.tissueType || "Belum dinilai",
          exudateAmount: woundAssessment.exudateAmount || "Belum dinilai",
          exudateType: woundAssessment.exudateType || "Belum dinilai",
          odor: woundAssessment.odor || "Tidak disebutkan",
          periwoundCondition: woundAssessment.periwoundCondition || "Belum dinilai",
          painScore: Number(woundAssessment.painScore) || 0,
          infectionSigns: Boolean(woundAssessment.infectionSigns),
          fever: Boolean(woundAssessment.fever),
          bleeding: woundAssessment.bleeding || "Tidak disebutkan",
        });
      }

      if (serviceCategory === "CIRCUMCISION" && circumcisionAssessment) {
        await db.insert(circumcisionAssessments).values({
          bookingId: dibuat.id,
          patientId: aktor.userId!,
          patientAgeYears: Number(circumcisionAssessment.patientAgeYears) || 0,
          weightKg: Number(circumcisionAssessment.weightKg) || 0,
          methodPreferred: circumcisionAssessment.methodPreferred || "Belum dipilih",
          bleedingDisorders: circumcisionAssessment.bleedingDisorders || "Tidak ada",
          allergies: circumcisionAssessment.allergies || "Tidak ada",
          anatomicalNotes: circumcisionAssessment.anatomicalNotes || "-",
          guardianName: circumcisionAssessment.guardianName || aktor.nama || "-",
          guardianPhone: circumcisionAssessment.guardianPhone || "-",
          // Persetujuan tindakan BELUM diberikan di tahap ini — pasien baru
          // menyetujuinya setelah membaca penawaran dan risikonya. Menandai
          // true di sini sama saja mencatat persetujuan yang tidak ada.
          consentGiven: false,
        });
      }

      await db.insert(notifications).values({
        userId: aktor.userId!,
        title: `Permintaan terkirim — ${dibuat.bookingCode}`,
        message:
          "Perawat akan menilai keterangan dan foto Anda, lalu mengirim rincian biaya. Belum ada yang ditagihkan.",
        type: "BOOKING",
        read: false,
      });

      await db.insert(auditLogs).values({
        userId: aktor.userId!,
        userRole: "PATIENT",
        action: "PERMINTAAN_DIBUAT",
        resourceType: "bookings",
        resourceId: dibuat.bookingCode,
        details: `Permintaan kunjungan dibuat untuk ${serviceName}; ${daftarFoto.length} foto dilampirkan.`,
      });

      return NextResponse.json({ success: true, booking: dibuat });
    }

    /* ============================================================
       ALUR PENAWARAN
       Semua perpindahan status lewat bolehPindah() di logic/alur.ts.
       Tidak ada satu pun aksi di bawah yang mengubah status tanpa
       menanyakannya lebih dulu — kalau ada, urutan alurnya bisa
       dilangkahi lewat satu permintaan HTTP.
       ============================================================ */

    /** Perawat mengambil permintaan untuk ditinjau. */
    if (action === "MULAI_TINJAUAN") {
      const { bookingId } = body;

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!pesanan)
        return NextResponse.json({ error: "Permintaan tidak ditemukan" }, { status: 404 });

      const izin = bolehPindah(pesanan.status, S.DITINJAU, actorRole ?? "PROVIDER");
      if (!izin.boleh) return NextResponse.json({ error: izin.alasan }, { status: 409 });

      /**
       * Perawat yang izinnya belum diverifikasi tidak boleh mengambil
       * kunjungan.
       *
       * Penjagaannya ada di sini — bukan hanya di layar — karena inilah
       * satu-satunya titik di mana seorang perawat mengikatkan dirinya pada
       * seorang pasien. Semua yang menyusul (penawaran, persetujuan
       * tindakan, catatan klinis dengan nomor STR-nya) bertumpu pada
       * langkah ini.
       *
       * Pemeriksaannya memakai fungsi yang sama dengan layar
       * (logic/verifikasi.ts), jadi keduanya tidak bisa lama-lama berbeda.
       */
      const sayaPerawat = await perawatDariAktor(aktor);
      const bolehKerja = bolehMenerimaKunjungan(sayaPerawat);
      if (aktor.peran !== "ADMIN" && !bolehKerja.boleh)
        return NextResponse.json({ error: bolehKerja.alasan }, { status: 403 });

      // Perawat yang penawarannya sudah pernah ditolak pada permintaan ini
      // tidak boleh mengambilnya lagi — kalau boleh, "diteruskan ke perawat
      // lain" hanya jadi kalimat tanpa akibat.
      const pernahDitolak = String(pesanan.rejectedProviderIds ?? "")
        .split(",")
        .filter(Boolean);
      if (pernahDitolak.includes(String(actorProviderId))) {
        return NextResponse.json(
          { error: "Penawaran Anda pada permintaan ini sudah ditolak pasien; permintaan diteruskan ke perawat lain." },
          { status: 403 }
        );
      }

      const [hasil] = await db
        .update(bookings)
        .set({
          status: S.DITINJAU,
          reviewStartedAt: new Date(),
          providerId: Number(actorProviderId) || null,
          providerName: actorProviderName || null,
        })
        .where(eq(bookings.id, Number(bookingId)))
        .returning();

      await db.insert(auditLogs).values({
        userId: null,
        userRole: "PROVIDER",
        action: "TINJAUAN_DIMULAI",
        resourceType: "bookings",
        resourceId: pesanan.bookingCode,
        details: `${actorProviderName ?? "Perawat"} mulai meninjau permintaan ${pesanan.bookingCode}.`,
      });

      return NextResponse.json({ success: true, booking: hasil });
    }

    /** Perawat mengirim rincian bahan, tarif, dan jadwal. */
    if (action === "KIRIM_PENAWARAN") {
      const { bookingId, temuan, item, scheduledDate, scheduledTimeSlot } = body;

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!pesanan)
        return NextResponse.json({ error: "Permintaan tidak ditemukan" }, { status: 404 });

      if (
        actorRole !== "ADMIN" &&
        Number(actorProviderId) !== pesanan.providerId
      ) {
        return NextResponse.json(
          { error: "Hanya perawat yang sedang meninjau permintaan ini yang boleh menawarkan." },
          { status: 403 }
        );
      }

      const izin = bolehPindah(pesanan.status, S.DITAWARKAN, actorRole ?? "PROVIDER");
      if (!izin.boleh) return NextResponse.json({ error: izin.alasan }, { status: 409 });

      const daftar: ItemPenawaran[] = Array.isArray(item) ? item : [];
      // Aturan yang sama dipakai di layar dan di sini. Layar bisa dilewati.
      const halangan = penghalangKirimPenawaran(
        daftar,
        String(temuan ?? ""),
        String(scheduledDate ?? ""),
        String(scheduledTimeSlot ?? "")
      );
      if (halangan) return NextResponse.json({ error: halangan }, { status: 400 });

      const total = totalPenawaran(daftar);
      const honor = honorDariItem(daftar);
      const putaran = (pesanan.quoteRound ?? 0) + 1;

      // Penawaran lama untuk pemesanan ini dibuang supaya yang tersimpan
      // selalu penawaran yang sedang berlaku; putarannya tetap tercatat
      // di kolom quoteRound dan di jejak audit.
      await db.delete(quoteItems).where(eq(quoteItems.bookingId, Number(bookingId)));
      await db.insert(quoteItems).values(
        daftar.map((i) => ({
          bookingId: Number(bookingId),
          kind: i.kind,
          label: i.label,
          qty: Number(i.qty) || 1,
          unitPriceIdr: Number(i.unitPriceIdr) || 0,
          fromCatalog: Boolean(i.fromCatalog),
          originalUnitPriceIdr:
            i.originalUnitPriceIdr != null ? Number(i.originalUnitPriceIdr) : null,
          reason: i.reason || null,
          quoteRound: putaran,
        }))
      );

      const [hasil] = await db
        .update(bookings)
        .set({
          status: S.DITAWARKAN,
          quotedAt: new Date(),
          quotedByProviderId: Number(actorProviderId) || null,
          quotedByProviderName: actorProviderName || null,
          reviewFindings: String(temuan ?? ""),
          quoteRound: putaran,
          scheduledDate: String(scheduledDate),
          scheduledTimeSlot: String(scheduledTimeSlot),
          basePriceIdr: honor.jasa,
          suppliesFeeIdr: honor.bahan,
          distanceFeeIdr: honor.jarak,
          emergencyFeeIdr: honor.luarJam,
          totalPriceIdr: total,
        })
        .where(eq(bookings.id, Number(bookingId)))
        .returning();

      await db.insert(notifications).values({
        userId: pesanan.patientId,
        title: `Rincian biaya siap — ${pesanan.bookingCode}`,
        message: `${actorProviderName ?? "Perawat"} mengirim rincian ${rp(total)}. Belum ada yang ditagihkan sampai Anda menyetujuinya.`,
        type: "BOOKING",
        read: false,
      });

      await db.insert(auditLogs).values({
        userId: null,
        userRole: "PROVIDER",
        action: "PENAWARAN_DIKIRIM",
        resourceType: "bookings",
        resourceId: pesanan.bookingCode,
        details: `Penawaran putaran ${putaran} sebesar ${rp(total)} oleh ${actorProviderName ?? "perawat"}.`,
      });

      return NextResponse.json({ success: true, booking: hasil, total });
    }

    /** Pasien menyetujui atau menolak penawaran. */
    if (action === "PUTUSKAN_PENAWARAN") {
      const { bookingId, setuju, alasanTolak, namaTandaTangan, hubungan, persetujuanFoto } = body;

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!pesanan)
        return NextResponse.json({ error: "Permintaan tidak ditemukan" }, { status: 404 });

      if (actorRole !== "ADMIN" && Number(actorUserId) !== pesanan.patientId) {
        return NextResponse.json({ error: "Pemesanan ini bukan milik Anda" }, { status: 403 });
      }

      const tujuan = setuju ? S.DISETUJUI : S.DITOLAK_PASIEN;
      const izin = bolehPindah(pesanan.status, tujuan, actorRole ?? "PATIENT");
      if (!izin.boleh) return NextResponse.json({ error: izin.alasan }, { status: 409 });

      if (!setuju) {
        // Perawat yang ditolak dicatat supaya permintaan tidak kembali
        // ke tangan yang sama.
        const daftarTolak = new Set(
          String(pesanan.rejectedProviderIds ?? "").split(",").filter(Boolean)
        );
        if (pesanan.quotedByProviderId != null)
          daftarTolak.add(String(pesanan.quotedByProviderId));

        const [hasil] = await db
          .update(bookings)
          .set({
            status: S.DITOLAK_PASIEN,
            rejectionReason: alasanTolak || null,
            rejectedProviderIds: [...daftarTolak].join(","),
            providerId: null,
            providerName: null,
            quotedByProviderId: null,
            quotedByProviderName: null,
          })
          .where(eq(bookings.id, Number(bookingId)))
          .returning();

        await db.insert(auditLogs).values({
          userId: Number(actorUserId) || null,
          userRole: "PATIENT",
          action: "PENAWARAN_DITOLAK",
          resourceType: "bookings",
          resourceId: pesanan.bookingCode,
          details: `Penawaran ditolak pasien${alasanTolak ? ` — ${alasanTolak}` : ""}. Permintaan diteruskan ke perawat lain.`,
        });

        return NextResponse.json({ success: true, booking: hasil });
      }

      // --- persetujuan ---
      if (!namaTandaTangan || String(namaTandaTangan).trim().length < 3) {
        return NextResponse.json(
          { error: "Nama penanda tangan wajib diisi." },
          { status: 400 }
        );
      }

      const itemTersimpan = await db
        .select()
        .from(quoteItems)
        .where(eq(quoteItems.bookingId, Number(bookingId)));
      if (!itemTersimpan.length) {
        return NextResponse.json(
          { error: "Penawaran untuk pemesanan ini tidak ditemukan." },
          { status: 409 }
        );
      }

      const [perawat] = pesanan.quotedByProviderId
        ? await db.select().from(providers).where(eq(providers.id, pesanan.quotedByProviderId))
        : [];

      // Teks persetujuan disusun DI SINI, dari data yang tersimpan — bukan
      // dikirim dari browser. Kalau browser yang mengirimkannya, yang
      // tercatat adalah kalimat apa pun yang dikirim, bukan kalimat yang
      // benar-benar berlaku.
      const daftarItem: ItemPenawaran[] = itemTersimpan.map((i) => ({
        kind: i.kind as ItemPenawaran["kind"],
        label: i.label,
        qty: i.qty,
        unitPriceIdr: i.unitPriceIdr,
        fromCatalog: i.fromCatalog,
        originalUnitPriceIdr: i.originalUnitPriceIdr,
        reason: i.reason,
      }));
      const total = totalPenawaran(daftarItem);

      const teks = teksPersetujuanTindakan({
        namaPasien: pesanan.dependentName || pesanan.patientName,
        namaLayanan: pesanan.serviceName,
        kategori: pesanan.serviceCategory,
        namaPerawat: pesanan.quotedByProviderName ?? "-",
        nomorSTR: perawat?.licenseNumber ?? "-",
        temuanPerawat: pesanan.reviewFindings ?? "-",
        item: daftarItem,
        total,
        tanggalKunjungan: pesanan.scheduledDate,
        jamKunjungan: pesanan.scheduledTimeSlot,
        alamat: pesanan.addressText,
      });

      await db.insert(consents).values({
        bookingId: Number(bookingId),
        version: VERSI_CONSENT,
        textSnapshot: teks,
        quoteSnapshot: penawaranSebagaiTeks(daftarItem),
        signedByName: String(namaTandaTangan).trim(),
        signerRelation: String(hubungan || "DIRI_SENDIRI"),
        photoConsent: Boolean(persetujuanFoto),
        /**
         * Teksnya disusun DI SERVER dari data yang tersimpan, bukan
         * dikirim browser — aturan yang sama dengan persetujuan tindakan.
         * Kalau browser boleh mengirim teksnya, ia bisa mengirim teks yang
         * berbeda dari yang ditampilkan.
         */
        photoConsentText: persetujuanFoto
          ? teksPersetujuanFoto(pesanan.dependentName || pesanan.patientName)
          : null,
      });

      if (pesanan.serviceCategory === "CIRCUMCISION") {
        await db
          .update(circumcisionAssessments)
          .set({ consentGiven: true })
          .where(eq(circumcisionAssessments.bookingId, Number(bookingId)));
      }

      const [hasil] = await db
        .update(bookings)
        .set({
          status: S.DISETUJUI,
          approvedAt: new Date(),
          approvedByName: String(namaTandaTangan).trim(),
          totalPriceIdr: total,
        })
        .where(eq(bookings.id, Number(bookingId)))
        .returning();

      await db.insert(auditLogs).values({
        userId: Number(actorUserId) || null,
        userRole: "PATIENT",
        action: "PERSETUJUAN_DITANDATANGANI",
        resourceType: "consents",
        resourceId: pesanan.bookingCode,
        details: `Persetujuan tindakan versi ${VERSI_CONSENT} ditandatangani ${namaTandaTangan} (${hubungan || "DIRI_SENDIRI"}); total disetujui ${rp(total)}.`,
      });

      return NextResponse.json({ success: true, booking: hasil });
    }

    /** Pembayaran. Perawat baru boleh berangkat setelah ini. */
    /**
     * Aksi "BAYAR" DIHAPUS — jangan dihidupkan lagi.
     *
     * Isinya dulu:
     *
     *     .set({ status: S.DIBAYAR, paymentStatus: "LUNAS", ... })
     *
     * Yang memanggilnya adalah browser pasien. Artinya yang menyatakan
     * bahwa uang sudah berpindah adalah pihak yang seharusnya membayar —
     * dan ia bisa memanggil aksi ini langsung, tanpa membuka halaman
     * pembayaran mana pun.
     *
     * Akibatnya bukan sekadar salah catat. Status LUNAS itulah yang
     * membuat perawat berangkat, membeli bahan habis pakai dengan uangnya
     * sendiri, dan mengerjakan tindakan. Yang menanggung perawat.
     *
     * Sekarang: POST /api/pembayaran hanya MEMBUKA halaman pembayaran
     * (nominalnya dihitung server dari penawaran yang disetujui), dan
     * satu-satunya yang boleh menulis LUNAS adalah kabar bertanda tangan
     * sah dari Midtrans di /api/pembayaran/kabar.
     */
    if (action === "BAYAR") {
      return NextResponse.json(
        {
          error:
            "Pembayaran tidak lagi ditandai dari aplikasi. Buka halaman pembayaran lewat /api/pembayaran.",
        },
        { status: 410 }
      );
    }

    /** Laporan tindakan singkat; menutup kunjungan. */
    if (action === "SIMPAN_LAPORAN") {
      const { bookingId, whatWasDone, woundCondition, homeInstructions, warningSigns, nextVisitSuggestion, suppliesUsed } = body;

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!pesanan)
        return NextResponse.json({ error: "Pemesanan tidak ditemukan" }, { status: 404 });

      if (actorRole !== "ADMIN" && Number(actorProviderId) !== pesanan.providerId)
        return NextResponse.json(
          { error: "Hanya perawat yang menangani kunjungan ini yang boleh menutupnya." },
          { status: 403 }
        );

      const izin = bolehPindah(pesanan.status, S.SELESAI, actorRole ?? "PROVIDER");
      if (!izin.boleh) return NextResponse.json({ error: izin.alasan }, { status: 409 });

      if (!String(whatWasDone ?? "").trim() || !String(homeInstructions ?? "").trim())
        return NextResponse.json(
          { error: "Isi tindakan dan instruksi perawatan di rumah tidak boleh kosong." },
          { status: 400 }
        );

      // Foto sebelum dan sesudah wajib untuk perawatan luka. Inilah bukti
      // pekerjaan yang melindungi kedua pihak; tanpa itu laporan hanyalah
      // pernyataan sepihak.
      const foto = await db
        .select()
        .from(taskPhotos)
        .where(eq(taskPhotos.bookingId, Number(bookingId)));
      const ada = (jenis: string) => foto.some((f) => f.photoType === jenis);
      if (pesanan.serviceCategory === "WOUND_CARE" && (!ada("WOUND_BEFORE") || !ada("WOUND_AFTER")))
        return NextResponse.json(
          { error: "Foto luka sebelum dan sesudah tindakan wajib diunggah sebelum kunjungan ditutup." },
          { status: 409 }
        );

      const [perawat] = actorProviderId
        ? await db.select().from(providers).where(eq(providers.id, Number(actorProviderId)))
        : [];

      const [laporan] = await db
        .insert(visitReports)
        .values({
          bookingId: Number(bookingId),
          providerId: Number(actorProviderId) || 0,
          providerName: actorProviderName || perawat?.fullName || "-",
          providerLicense: perawat?.licenseNumber ?? "-",
          arrivedAt: null,
          finishedAt: new Date(),
          whatWasDone: String(whatWasDone).trim(),
          woundCondition: woundCondition || null,
          homeInstructions: String(homeInstructions).trim(),
          warningSigns: warningSigns || null,
          nextVisitSuggestion: nextVisitSuggestion || null,
          suppliesUsed: suppliesUsed || null,
        })
        .returning();

      const [hasil] = await db
        .update(bookings)
        .set({ status: S.SELESAI })
        .where(eq(bookings.id, Number(bookingId)))
        .returning();

      await db.insert(notifications).values({
        userId: pesanan.patientId,
        title: `Kunjungan selesai — ${pesanan.bookingCode}`,
        message: "Laporan tindakan sudah bisa Anda baca di aplikasi.",
        type: "BOOKING",
        read: false,
      });

      await db.insert(auditLogs).values({
        userId: null,
        userRole: "PROVIDER",
        action: "LAPORAN_DITANDATANGANI",
        resourceType: "visit_reports",
        resourceId: pesanan.bookingCode,
        details: `Laporan kunjungan ${pesanan.bookingCode} ditandatangani ${actorProviderName ?? "perawat"} (STR ${perawat?.licenseNumber ?? "-"}).`,
      });

      /**
       * Bagi hasil dicatat di sini, bukan oleh admin nanti.
       *
       * Fungsinya berhenti sendiri kalau pembayarannya belum masuk — dan
       * kalau begitu, yang mencatatnya adalah kabar pembayaran nanti.
       * Keduanya memanggil fungsi yang sama justru karena urutan kedua
       * kejadian ini tidak bisa dipastikan.
       */
      await catatBagiHasil(Number(bookingId), "LAPORAN_DITUTUP");

      return NextResponse.json({ success: true, booking: hasil, laporan });
    }

    // 2. UPDATE BOOKING STATUS (Provider or Admin)
    if (action === "UPDATE_BOOKING_STATUS") {
      const { bookingId, status } = body;

      // Sebelumnya aksi ini tidak memeriksa siapa pun: satu permintaan HTTP
      // cukup untuk menandai kunjungan siapa saja jadi selesai. Sekarang
      // hanya perawat yang ditugaskan (atau admin) yang boleh mengubahnya.
      const [sebelum] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!sebelum) {
        return NextResponse.json({ error: "Pemesanan tidak ditemukan" }, { status: 404 });
      }
      const bolehUbah =
        actorRole === "ADMIN" ||
        (actorProviderId != null && Number(actorProviderId) === sebelum.providerId);
      if (!bolehUbah) {
        return NextResponse.json(
          { error: "Hanya perawat yang ditugaskan pada kunjungan ini yang boleh mengubah statusnya" },
          { status: 403 }
        );
      }

      // Selain "milik siapa", urutannya juga diperiksa. Sebelumnya status
      // apa pun bisa ditulis ke status apa pun: satu permintaan cukup untuk
      // melompat dari "menunggu ditinjau" langsung ke "selesai", melewati
      // penawaran, persetujuan, dan pembayaran sekaligus.
      const izin = bolehPindah(sebelum.status, String(status), actorRole ?? "PROVIDER");
      if (!izin.boleh) {
        return NextResponse.json({ error: izin.alasan }, { status: 409 });
      }

      const [updated] = await db
        .update(bookings)
        .set({ status })
        .where(eq(bookings.id, Number(bookingId)))
        .returning();

      await db.insert(notifications).values({
        userId: sebelum.patientId,
        title: `${updated.bookingCode} — ${namaStatus(status)}`,
        message: `Status kunjungan Anda berubah menjadi "${namaStatus(status)}".`,
        type: "BOOKING",
        read: false,
      });

      await db.insert(auditLogs).values({
        userId: null,
        userRole: String(actorRole ?? "PROVIDER"),
        action: "STATUS_DIUBAH",
        resourceType: "bookings",
        resourceId: sebelum.bookingCode,
        details: `${namaStatus(sebelum.status)} → ${namaStatus(String(status))}.`,
      });

      return NextResponse.json({ success: true, booking: updated });
    }

    // 2b. PEMBATALAN OLEH PASIEN
    // Wizard menjanjikan "batal gratis sampai 2 jam sebelum jadwal" sejak awal,
    // tapi tidak pernah ada aksinya — di aplikasi maupun di sini. Janji yang
    // tidak bisa ditepati lebih buruk daripada tidak berjanji.
    if (action === "CANCEL_BOOKING") {
      const { bookingId, reason } = body;

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!pesanan) {
        return NextResponse.json({ error: "Pemesanan tidak ditemukan" }, { status: 404 });
      }

      const miliknya =
        actorRole === "ADMIN" ||
        (actorUserId != null && Number(actorUserId) === pesanan.patientId);
      if (!miliknya) {
        return NextResponse.json(
          { error: "Pemesanan ini bukan milik Anda" },
          { status: 403 }
        );
      }

      const cek = bolehBatal(pesanan);
      if (!cek.boleh) {
        return NextResponse.json({ error: cek.alasan }, { status: 409 });
      }

      const [dibatalkan] = await db
        .update(bookings)
        .set({ status: S.DIBATALKAN, triageNotes: reason ? `Dibatalkan pasien: ${reason}` : pesanan.triageNotes })
        .where(eq(bookings.id, Number(bookingId)))
        .returning();

      await db.insert(auditLogs).values({
        userId: Number(actorUserId) || null,
        userRole: String(actorRole ?? "PATIENT"),
        action: "CANCEL_BOOKING",
        resourceType: "booking",
        resourceId: String(bookingId),
        details: `Pemesanan ${pesanan.bookingCode} dibatalkan${reason ? ` — ${reason}` : ""}.`,
      });

      return NextResponse.json({ success: true, booking: dibatalkan });
    }

    /**
     * Catatan klinis SOAP lengkap (perawat).
     *
     * Empat aksi di bagian ini adalah kode paling tua di berkas ini, dan
     * paling longgar. Sebelum diperbaiki:
     *
     *   - `providerId: 1` dan `patientId: 1` ditulis mati. Setiap catatan
     *     klinis siapa pun tercatat atas nama perawat nomor satu, di berkas
     *     pasien nomor satu.
     *   - nama perawat diambil dari badan permintaan, dengan nilai cadangan
     *     "Ns. Ratna Dewi, CWCS" — jadi catatan yang ditulis Ns. Hendra
     *     ditandatangani nama Ns. Ratna.
     *   - tidak ada satu pun pemeriksaan kepemilikan: perawat mana pun bisa
     *     menulis catatan klinis pada kunjungan perawat lain.
     *   - status pemesanan diubah menjadi "COMPLETED" — nilai yang TIDAK ADA
     *     dalam mesin status di logic/alur.ts. Pemesanan itu lalu tersangkut
     *     di keadaan yang tidak dikenali layar mana pun.
     *
     * Untuk dokumen klinis, salah nama penandatangan bukan salah tampil.
     */
    if (action === "SUBMIT_CLINICAL_NOTE") {
      const { bookingId, assessmentSummary, woundDimensions, exudateLevel, proceduresPerformed, suppliesUsed, painScorePost, homecareInstructions, nextFollowUpDate, lengthCm, widthCm } = body;

      const halangan = harusPerawat(aktor);
      if (halangan) return NextResponse.json({ error: halangan }, { status: 403 });

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!pesanan)
        return NextResponse.json({ error: "Pemesanan tidak ditemukan." }, { status: 404 });

      if (aktor.peran !== "ADMIN" && !pesananDipegangPerawat(aktor, pesanan))
        return NextResponse.json(
          { error: "Ini bukan kunjungan Anda." },
          { status: 403 }
        );

      if (!String(assessmentSummary ?? "").trim())
        return NextResponse.json({ error: "Ringkasan pengkajian belum diisi." }, { status: 400 });

      /**
       * Skala nyeri WAJIB diisi, dan tidak punya nilai bawaan.
       *
       * Sampai hari ini baris penyimpanannya berbunyi
       * `Number(painScorePost) || 2`. Artinya: perawat yang tidak mengisi
       * skala nyeri — atau yang mengisi 0, yang justru berarti "tidak
       * nyeri" — membuat rekam medis pasien memuat angka 2. Angka yang
       * tidak pernah ditanyakan kepada siapa pun, tidak pernah dijawab
       * siapa pun, dan tidak bisa dibedakan dari angka yang benar-benar
       * diukur. `|| 2` ditulis untuk menghindari galat basis data; yang
       * dihasilkannya adalah keterangan palsu yang rapi.
       *
       * 0 adalah jawaban yang sah. Yang tidak sah adalah kosong.
       */
      const nyeri = Number(painScorePost);
      if (painScorePost === undefined || painScorePost === null || painScorePost === "" || !Number.isFinite(nyeri))
        return NextResponse.json(
          { error: "Skala nyeri belum diisi. Tulis 0 kalau pasien tidak mengeluh nyeri — jangan dikosongkan." },
          { status: 400 }
        );
      if (nyeri < 0 || nyeri > 10)
        return NextResponse.json({ error: "Skala nyeri harus antara 0 dan 10." }, { status: 400 });

      const perawat = await perawatDariAktor(aktor);
      const namaPerawat = perawat?.fullName ?? pesanan.providerName ?? "Perawat";

      const [note] = await db
        .insert(clinicalNotes)
        .values({
          bookingId: pesanan.id,
          providerId: perawat?.id ?? pesanan.providerId ?? 0,
          providerName: namaPerawat,
          patientId: pesanan.patientId,
          assessmentSummary,
          woundDimensions,
          exudateLevel,
          proceduresPerformed,
          suppliesUsed,
          painScorePost: nyeri,
          homecareInstructions,
          nextFollowUpDate: nextFollowUpDate || null,
          /**
           * Jujur, bukan selalu true. Penanda ini ikut ke jejak audit dan
           * ke laporan; menandai SEMUA catatan sebagai "dibantu alat"
           * membuat penandanya tidak berarti apa-apa.
           */
          aiAssistedDraft: Boolean(body?.dibantuAlat),
          verifiedByProvider: true,
        })
        .returning();

      const l = Number(lengthCm) || 0;
      const w = Number(widthCm) || 0;
      if (l > 0 && w > 0) {
        await db.insert(woundTimelineEntries).values({
          patientId: pesanan.patientId,
          bookingId: pesanan.id,
          visitDayLabel: `Kunjungan — ${new Date().toISOString().slice(0, 10)}`,
          dateRecorded: new Date().toISOString().slice(0, 10),
          lengthCm: l,
          widthCm: w,
          areaSqCm: Number((l * w).toFixed(2)),
          painScore: nyeri,
          exudateStatus: exudateLevel || "-",
          dressingType: suppliesUsed || "-",
          providerName: namaPerawat,
          notes: assessmentSummary,
        });
      }

      /**
       * Status pemesanan TIDAK disentuh di sini.
       *
       * Yang menutup kunjungan adalah SIMPAN_LAPORAN, lewat mesin status.
       * Dua jalan menuju satu perubahan status adalah cara paling pasti
       * membuat keduanya lama-lama tidak sama.
       */

      await db.insert(auditLogs).values({
        userId: aktor.userId,
        userRole: aktor.peran,
        action: "CLINICAL_DOCUMENTATION_FINALIZED",
        resourceType: "clinical_notes",
        resourceId: String(pesanan.id),
        details: `${namaPerawat} menandatangani catatan klinis untuk ${pesanan.bookingCode}.`,
      });

      return NextResponse.json({ success: true, clinicalNote: note });
    }

    /**
     * Woundex: pengkajian peringatan dini luka kaki diabetik.
     *
     * Keputusannya (MERAH / KUNING / HIJAU) dihitung DI SINI, di server,
     * dari aturan di logic/woundex.ts — bukan dikirim dari layar. Layar
     * hanya mengirim apa yang diukur perawat. Sama alasannya dengan tanda
     * bahaya di asisten: keputusan yang bisa berujung ke IGD tidak boleh
     * bisa diubah dari browser.
     *
     * Hanya untuk perawatan luka, hanya oleh perawat yang memegang
     * kunjungannya, dan hanya saat ia memang sedang di rumah pasien.
     */
    if (action === "SIMPAN_WOUNDEX") {
      const halangan = harusPerawat(aktor);
      if (halangan) return NextResponse.json({ error: halangan }, { status: 403 });

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(body?.bookingId)));
      if (!pesanan)
        return NextResponse.json({ error: "Pemesanan tidak ditemukan." }, { status: 404 });
      if (!pesananDipegangPerawat(aktor, pesanan))
        return NextResponse.json({ error: "Ini bukan kunjungan Anda." }, { status: 403 });
      if (pesanan.serviceCategory !== "WOUND_CARE")
        return NextResponse.json({ error: "Woundex hanya untuk perawatan luka." }, { status: 400 });
      if (![S.PERAWAT_TIBA, S.DIKERJAKAN].includes(pesanan.status as any))
        return NextResponse.json(
          { error: "Pengkajian Woundex diisi saat Anda sudah tiba di rumah pasien." },
          { status: 409 }
        );

      const terbaca = bacaSinyal(body?.sinyal);
      if ("galat" in terbaca) return NextResponse.json({ error: terbaca.galat }, { status: 400 });
      const s = terbaca.sinyal;

      /**
       * Riwayat luas pasien ini, dari SEMUA kunjungannya — termasuk yang
       * dipegang perawat lain. Tren penyembuhan adalah milik pasien, bukan
       * milik satu kunjungan. Yang dibaca hanya tanggal dan luasnya, dan
       * yang dikirim ke layar hanya titik-titik itu (lewat kolom hasil).
       */
      const [lama, garis] = await Promise.all([
        db.select().from(woundexChecks).where(eq(woundexChecks.patientId, pesanan.patientId)),
        db.select().from(woundTimelineEntries).where(eq(woundTimelineEntries.patientId, pesanan.patientId)),
      ]);
      const sekarang = new Date();
      const mentah: { tgl: Date; luas: number }[] = [
        ...lama.map((w) => ({ tgl: new Date(w.createdAt), luas: w.panjangCm * w.lebarCm })),
        ...garis
          .filter((g) => !lama.some((w) => w.bookingId === g.bookingId))
          .map((g) => ({ tgl: new Date(`${g.dateRecorded}T00:00:00Z`), luas: Number(g.areaSqCm) })),
      ]
        .filter((t) => t.luas > 0 && !Number.isNaN(t.tgl.getTime()) && t.tgl <= sekarang)
        .sort((a, b) => a.tgl.getTime() - b.tgl.getTime());

      const awal = mentah[0]?.tgl ?? sekarang;
      const hariIni = selisihHari(awal, sekarang);
      /** Satu titik per hari; pengukuran hari ini menggantikan yang lain di hari yang sama. */
      const perHari = new Map<number, number>();
      for (const t of mentah) perHari.set(selisihHari(awal, t.tgl), t.luas);
      perHari.delete(hariIni);
      const riwayat: TitikLuas[] = [...perHari.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([hari, luas]) => ({ hari, luas }));

      const hasil = nilaiWoundex(s, riwayat, hariIni);
      const perawat = await perawatDariAktor(aktor);
      const namaPerawat = perawat?.fullName ?? pesanan.providerName ?? "Perawat";

      const [baris] = await db
        .insert(woundexChecks)
        .values({
          bookingId: pesanan.id,
          patientId: pesanan.patientId,
          providerId: perawat?.id ?? pesanan.providerId ?? 0,
          providerName: namaPerawat,
          ...s,
          nadi: Math.round(s.nadi),
          napas: Math.round(s.napas),
          gulaDarah: s.gulaDarah === null ? null : Math.round(s.gulaDarah),
          tingkat: hasil.tingkat,
          derajatIwgdf: hasil.derajatIwgdf,
          sinbad: hasil.sinbad,
          reduksiMinggu4: hasil.proyeksi?.reduksiMinggu4 ?? null,
          hariKe: hariIni,
          hasil: JSON.stringify(hasil),
          versiAturan: VERSI_ATURAN_WOUNDEX,
        })
        .returning();

      await db.insert(auditLogs).values({
        userId: aktor.userId,
        userRole: aktor.peran,
        action: "WOUNDEX_DINILAI",
        resourceType: "woundex_checks",
        resourceId: String(pesanan.id),
        details: `${namaPerawat} mengkaji ${pesanan.bookingCode} dengan Woundex: ${hasil.tingkat} (IWGDF ${hasil.derajatIwgdf}, SINBAD ${hasil.sinbad}/6).`,
      });

      /**
       * MERAH sampai ke admin saat itu juga. Perawat di lapangan sedang
       * menangani pasiennya; koordinator yang mengatur rujukan dan
       * kunjungan berikutnya perlu tahu tanpa menunggu laporan ditutup.
       */
      if (hasil.tingkat === "MERAH") {
        const idAdmin = (await db.select().from(users).where(eq(users.role, "ADMIN"))).map((u) => u.id);
        for (const a of idAdmin) {
          await db.insert(notifications).values({
            userId: a,
            title: `WOUNDEX MERAH — ${pesanan.bookingCode}`,
            message: `${NAMA_TINGKAT.MERAH}. ${hasil.tindakan.utama} Dikaji oleh ${namaPerawat}.`,
            type: "TRIAGE",
          });
        }
      }

      return NextResponse.json({ success: true, woundex: baris, hasil });
    }

    /** Pesan antara pasien dan perawat pada satu kunjungan. */
    if (action === "SEND_MESSAGE") {
      const { bookingId, content } = body;

      const isi = String(content ?? "").trim();
      if (!isi) return NextResponse.json({ error: "Pesan kosong." }, { status: 400 });
      if (isi.length > 2000)
        return NextResponse.json({ error: "Pesan terlalu panjang." }, { status: 400 });

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!pesanan)
        return NextResponse.json({ error: "Pemesanan tidak ditemukan." }, { status: 404 });

      /**
       * Nama dan peran pengirim TIDAK lagi dikirim browser.
       *
       * Sebelumnya keduanya bebas diisi. Pasien bisa menulis pesan yang
       * tampil sebagai "Ns. Ratna Dewi (PROVIDER)" — dan pesan dari perawat
       * di aplikasi kesehatan adalah nasihat yang orang ikuti.
       */
      const boleh =
        aktor.peran === "ADMIN" ||
        pesananMilikPasien(aktor, pesanan) ||
        pesananDipegangPerawat(aktor, pesanan);
      if (!boleh)
        return NextResponse.json({ error: "Ini bukan kunjungan Anda." }, { status: 403 });

      const [msg] = await db
        .insert(messages)
        .values({
          bookingId: pesanan.id,
          senderName: aktor.nama ?? "-",
          senderRole: aktor.peran,
          content: isi,
        })
        .returning();

      return NextResponse.json({ success: true, message: msg });
    }

    /**
     * Ulasan lama.
     *
     * Jalur testimoni yang sebenarnya sekarang KIRIM_TESTIMONI, yang punya
     * penyortiran admin, izin tayang, dan penanganan keluhan keselamatan.
     * Aksi ini dipertahankan hanya karena data lama memakainya, dan dijaga
     * dengan aturan yang sama supaya tidak menjadi pintu belakang menuju
     * penilaian tanpa penyortiran.
     */
    if (action === "SUBMIT_REVIEW") {
      const { bookingId, overallRating, comment } = body;

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!pesanan)
        return NextResponse.json({ error: "Pemesanan tidak ditemukan." }, { status: 404 });
      if (!pesananMilikPasien(aktor, pesanan) && aktor.peran !== "ADMIN")
        return NextResponse.json({ error: "Ini bukan kunjungan Anda." }, { status: 403 });

      const [rev] = await db
        .insert(reviews)
        .values({
          bookingId: pesanan.id,
          patientName: pesanan.patientName,
          providerId: pesanan.providerId ?? 0,
          providerName: pesanan.providerName ?? "-",
          serviceName: pesanan.serviceName,
          overallRating: Math.min(5, Math.max(1, Number(overallRating) || 5)),
          comment,
        })
        .returning();

      return NextResponse.json({ success: true, review: rev });
    }

    /** Anggota keluarga yang dirawat atas nama pasien ini. */
    if (action === "ADD_DEPENDENT") {
      const { fullName, relationship, dateOfBirth, gender, weightKg, medicalNotes } = body;

      if (aktor.peran !== "PATIENT")
        return NextResponse.json(
          { error: "Hanya pasien yang bisa menambah anggota keluarga." },
          { status: 403 }
        );
      if (!String(fullName ?? "").trim())
        return NextResponse.json({ error: "Nama belum diisi." }, { status: 400 });

      const [dep] = await db
        .insert(dependents)
        .values({
          /** Dulu `patientId: 1` — setiap anggota keluarga masuk ke berkas pasien nomor satu. */
          patientId: aktor.userId!,
          fullName,
          relationship,
          dateOfBirth,
          gender,
          weightKg: Number(weightKg) || null,
          medicalNotes,
        })
        .returning();

      return NextResponse.json({ success: true, dependent: dep });
    }

    if (action === "UPLOAD_TASK_PHOTO") {
      const { bookingId, photoType, imageUrl, caption } = body;

      /** Batas yang sama berlaku untuk foto dari perawat, bukan hanya dari pasien. */
      const halanganFotoTugas = penghalangFoto(imageUrl == null ? null : [imageUrl], 1);
      if (halanganFotoTugas)
        return NextResponse.json({ error: halanganFotoTugas }, { status: 413 });

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!pesanan)
        return NextResponse.json({ error: "Pemesanan tidak ditemukan" }, { status: 404 });

      const olehPasien = actorRole === "PATIENT";

      if (olehPasien) {
        if (Number(actorUserId) !== pesanan.patientId)
          return NextResponse.json({ error: "Pemesanan ini bukan milik Anda" }, { status: 403 });
        // Pasien hanya boleh menambah foto keluhan, bukan foto bukti kerja.
        if (photoType !== "INTAKE_LUKA")
          return NextResponse.json(
            { error: "Pasien hanya dapat mengunggah foto keluhan." },
            { status: 403 }
          );
      } else if (
        actorRole !== "ADMIN" &&
        Number(actorProviderId) !== pesanan.providerId
      ) {
        return NextResponse.json(
          { error: "Hanya perawat yang menangani kunjungan ini yang boleh mengunggah foto bukti." },
          { status: 403 }
        );
      }

      if (!imageUrl)
        return NextResponse.json({ error: "Tidak ada berkas gambar." }, { status: 400 });

      const [photo] = await db
        .insert(taskPhotos)
        .values({
          bookingId: Number(bookingId),
          providerId: olehPasien ? null : Number(actorProviderId) || null,
          providerName: olehPasien ? null : actorProviderName || null,
          uploadedByRole: olehPasien ? "PASIEN" : "PERAWAT",
          photoType: photoType || "WOUND_BEFORE",
          imageUrl,
          caption: caption || null,
          verifiedByProvider: !olehPasien,
        })
        .returning();

      // Foto kedatangan sekaligus menandai perawat sudah tiba — tapi lewat
      // aturan perpindahan yang sama, bukan menulis status begitu saja.
      if (photoType === "ARRIVAL_CONFIRMATION") {
        const izin = bolehPindah(pesanan.status, S.PERAWAT_TIBA, "PROVIDER");
        if (izin.boleh) {
          await db
            .update(bookings)
            .set({ status: S.PERAWAT_TIBA })
            .where(eq(bookings.id, Number(bookingId)));

          await db.insert(notifications).values({
            userId: pesanan.patientId,
            title: `Perawat sudah tiba — ${pesanan.bookingCode}`,
            message: `${actorProviderName ?? "Perawat"} sudah sampai di alamat Anda dan mengirim foto konfirmasi.`,
            type: "BOOKING",
            read: false,
          });
        }
      }

      await db.insert(auditLogs).values({
        userId: olehPasien ? Number(actorUserId) || null : null,
        userRole: olehPasien ? "PATIENT" : String(actorRole ?? "PROVIDER"),
        action: "FOTO_DIUNGGAH",
        resourceType: "task_photos",
        resourceId: pesanan.bookingCode,
        details: `Jenis foto: ${photoType}${caption ? ` — ${caption}` : ""}.`,
      });

      return NextResponse.json({ success: true, photo });
    }

    /* ============================================================
       TESTIMONI
       ============================================================ */

    /** Pasien mengirim testimoni. Sekali per kunjungan. */
    if (action === "KIRIM_TESTIMONI") {
      const { bookingId, bintang, nilaiKetepatanWaktu, nilaiKeterampilan, nilaiKebersihan, isi, izinTayang, keluhan, bahayaKlinis } = body;

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!pesanan)
        return NextResponse.json({ error: "Kunjungan tidak ditemukan" }, { status: 404 });

      if (actorRole !== "ADMIN" && Number(actorUserId) !== pesanan.patientId)
        return NextResponse.json({ error: "Kunjungan ini bukan milik Anda" }, { status: 403 });

      if (pesanan.status !== S.SELESAI)
        return NextResponse.json(
          { error: "Testimoni bisa diisi setelah kunjungan selesai." },
          { status: 409 }
        );

      const sudahAda = await db
        .select()
        .from(testimoni)
        .where(eq(testimoni.bookingId, Number(bookingId)));
      if (sudahAda.length)
        return NextResponse.json(
          { error: "Testimoni untuk kunjungan ini sudah pernah dikirim." },
          { status: 409 }
        );

      const izin = (String(izinTayang) as IzinTayang) || "BOLEH_SAMARAN";
      const halangan = penghalangKirim({
        bintang: Number(bintang) || 0,
        isi: String(isi ?? ""),
        izin,
      });
      if (halangan) return NextResponse.json({ error: halangan }, { status: 400 });

      const wilayah = wilayahDariAlamat(pesanan.addressText);
      const teks = String(isi).trim();

      const [dibuat] = await db
        .insert(testimoni)
        .values({
          bookingId: pesanan.id,
          patientId: pesanan.patientId,
          patientName: pesanan.patientName,
          providerId: pesanan.providerId,
          providerName: pesanan.providerName,
          serviceName: pesanan.serviceName,
          wilayah,
          bintang: Math.min(5, Math.max(1, Number(bintang))),
          nilaiKetepatanWaktu: nilaiKetepatanWaktu ? Number(nilaiKetepatanWaktu) : null,
          nilaiKeterampilan: nilaiKeterampilan ? Number(nilaiKeterampilan) : null,
          nilaiKebersihan: nilaiKebersihan ? Number(nilaiKebersihan) : null,
          // Keduanya diisi teks yang sama saat masuk. `isiAsli` tidak akan
          // pernah disentuh lagi setelah baris ini.
          isiAsli: teks,
          isiTayang: teks,
          izinTayang: izin,
          namaTayang: namaTayang(pesanan.patientName, izin, wilayah),
          statusTinjauan: "BARU",
          keluhan: Boolean(keluhan),
          // Bahaya klinis hanya berlaku kalau ini memang ditandai keluhan —
          // supaya centang yang tertinggal dari langkah sebelumnya tidak
          // diam-diam melewati penyortiran.
          bahayaKlinis: Boolean(keluhan) && Boolean(bahayaKlinis),
          /* Penyortiran admin berlaku untuk semua masukan, KECUALI keluhan
             yang menyangkut keselamatan — itu langsung sampai ke perawat.
             Tuduhan atas praktik seseorang harus sampai ke orangnya. */
          statusKePerawat:
            Boolean(keluhan) && Boolean(bahayaKlinis) ? "DITERUSKAN" : "BARU",
          diteruskanPada:
            Boolean(keluhan) && Boolean(bahayaKlinis) ? new Date() : null,
        })
        .returning();

      // Perawatnya diberi tahu seketika, bukan menunggu ia membuka aplikasi.
      if (dibuat.bahayaKlinis && pesanan.providerId != null) {
        const [perawat] = await db
          .select()
          .from(providers)
          .where(eq(providers.id, pesanan.providerId));
        if (perawat?.userId) {
          await db.insert(notifications).values({
            userId: perawat.userId,
            title: `Keluhan keselamatan — ${pesanan.bookingCode}`,
            message:
              "Pasien menyampaikan keluhan yang menyangkut keselamatan atau kondisi kesehatannya pada kunjungan Anda. Mohon dibaca; admin juga sudah diberi tahu.",
            type: "CLINICAL",
            read: false,
          });
        }
      }

      // Testimoni yang ditandai keluhan langsung menyalakan penanda sengketa
      // pada kunjungannya. Sejak itu tugas terjadwal tidak akan menghapus
      // foto atau mengubah status kunjungan itu — buktinya dibekukan sampai
      // keluhannya selesai.
      if (keluhan) {
        await db
          .update(bookings)
          .set({
            sengketa: true,
            catatanSistem: `Sengketa dinyalakan otomatis oleh keluhan pasien pada testimoni #${dibuat.id}.`,
          })
          .where(eq(bookings.id, pesanan.id));
      }

      const idAdmin = (await db.select().from(users).where(eq(users.role, "ADMIN"))).map(
        (u) => u.id
      );
      for (const a of idAdmin) {
        await db.insert(notifications).values({
          userId: a,
          title: dibuat.bahayaKlinis
            ? `KELUHAN KESELAMATAN — ${pesanan.bookingCode} (${bintang}★)`
            : keluhan
            ? `KELUHAN — ${pesanan.bookingCode} (${bintang}★)`
            : `Testimoni baru — ${pesanan.bookingCode} (${bintang}★)`,
          message: dibuat.bahayaKlinis
            ? "Menyangkut keselamatan — sudah langsung diteruskan ke perawatnya, tidak bisa ditahan. Kunjungannya ditandai bersengketa."
            : keluhan
            ? "Pasien menandai ini sebagai keluhan. Kunjungannya sudah ditandai bersengketa; bukti fotonya dibekukan. Perawat BELUM melihatnya — sortir dulu."
            : "Testimoni baru menunggu disortir. Perawat belum melihatnya.",
          type: keluhan ? "CLINICAL" : "BOOKING",
          read: false,
        });
      }

      await db.insert(auditLogs).values({
        userId: Number(actorUserId) || null,
        userRole: "PATIENT",
        action: keluhan ? "KELUHAN_DIKIRIM" : "TESTIMONI_DIKIRIM",
        resourceType: "testimoni",
        resourceId: pesanan.bookingCode,
        details: `${bintang}★, izin tayang: ${izin}${keluhan ? ", DITANDAI KELUHAN" : ""}.`,
      });

      return NextResponse.json({ success: true, testimoni: dibuat });
    }

    /**
     * Admin meninjau: merapikan versi tayang, menayangkan, atau meneruskan
     * catatan ke perawat.
     *
     * Perhatikan apa yang TIDAK ada di sini: tidak ada satu pun jalan untuk
     * mengubah `bintang`, `isiAsli`, atau `izinTayang`. Bukan disembunyikan
     * tombolnya — memang tidak ada kodenya. Bintang milik pasien, tulisan
     * asli milik pasien, dan izin tayang keputusan pasien.
     */
    if (action === "TINJAU_TESTIMONI") {
      const { testimoniId, isiTayang, alasanEdit, tayangkan, catatanUntukPerawat, teruskanKePerawat, alasanTahan } = body;

      if (actorRole !== "ADMIN")
        return NextResponse.json(
          { error: "Hanya admin yang boleh meninjau testimoni." },
          { status: 403 }
        );

      const [t] = await db
        .select()
        .from(testimoni)
        .where(eq(testimoni.id, Number(testimoniId)));
      if (!t)
        return NextResponse.json({ error: "Testimoni tidak ditemukan" }, { status: 404 });

      const teksBaru = isiTayang != null ? String(isiTayang) : t.isiTayang;
      const berubah = teksBaru.trim() !== t.isiTayang.trim();

      if (berubah) {
        const halangan = penghalangEdit({
          isiTayang: teksBaru,
          isiAsli: t.isiAsli,
          alasan: String(alasanEdit ?? ""),
        });
        if (halangan) return NextResponse.json({ error: halangan }, { status: 400 });
      }

      let status = t.statusTinjauan === "BARU" ? "DITINJAU" : t.statusTinjauan;
      if (tayangkan === true) {
        const halangan = penghalangTayang({ ...t, isiTayang: teksBaru });
        if (halangan) return NextResponse.json({ error: halangan }, { status: 409 });
        status = "TAYANG";
      } else if (tayangkan === false) {
        status = "TIDAK_TAYANG";
      }

      /* --- penyortiran ke perawat ---
         Terpisah dari keputusan tayang publik. Yang dikendalikan admin di
         sini adalah KAPAN perawat membacanya dan pengantar apa yang
         menyertainya — bukan apakah ia boleh tahu. */
      let keP = t.statusKePerawat;
      let alasanTahanBaru = t.alasanTahan;
      let diteruskanPadaBaru = t.diteruskanPada;

      if (teruskanKePerawat === true) {
        keP = "DITERUSKAN";
        alasanTahanBaru = null;
        diteruskanPadaBaru = t.diteruskanPada ?? new Date();
      } else if (teruskanKePerawat === false) {
        // Keluhan keselamatan tidak bisa ditahan, sekuat apa pun
        // permintaannya. Diperiksa lagi di sini karena layar bisa dilewati.
        const halangan = penghalangTahan({
          bahayaKlinis: t.bahayaKlinis,
          alasan: String(alasanTahan ?? ""),
        });
        if (halangan) return NextResponse.json({ error: halangan }, { status: 409 });
        keP = "DITAHAN";
        alasanTahanBaru = String(alasanTahan ?? "");
      }

      const [hasil] = await db
        .update(testimoni)
        .set({
          isiTayang: teksBaru,
          diedit: t.diedit || berubah,
          dieditOleh: berubah ? String(actorNama ?? "Admin") : t.dieditOleh,
          dieditPada: berubah ? new Date() : t.dieditPada,
          alasanEdit: berubah ? String(alasanEdit ?? "") : t.alasanEdit,
          statusTinjauan: status,
          statusKePerawat: keP,
          alasanTahan: alasanTahanBaru,
          diteruskanPada: diteruskanPadaBaru,
          catatanUntukPerawat:
            catatanUntukPerawat != null
              ? String(catatanUntukPerawat)
              : t.catatanUntukPerawat,
        })
        .where(eq(testimoni.id, Number(testimoniId)))
        .returning();

      // Pemberitahuan ke perawat dikirim TEPAT saat masukannya diteruskan —
      // bukan setiap kali admin menyimpan. Sebelumnya catatan admin dikirim
      // seketika walau testimoninya belum disortir, jadi perawat menerima
      // komentar tentang sesuatu yang belum boleh ia baca.
      const baruDiteruskan =
        keP === "DITERUSKAN" && t.statusKePerawat !== "DITERUSKAN";
      if (baruDiteruskan && t.providerId) {
        const [perawat] = await db
          .select()
          .from(providers)
          .where(eq(providers.id, t.providerId));
        if (perawat?.userId) {
          await db.insert(notifications).values({
            userId: perawat.userId,
            title: `Masukan pasien — ${t.serviceName} (${t.bintang}★)`,
            message: String(catatanUntukPerawat ?? t.catatanUntukPerawat ?? "").trim()
              ? `Pengantar admin: ${String(catatanUntukPerawat ?? t.catatanUntukPerawat).trim()}`
              : "Ada masukan pasien yang diteruskan ke Anda. Tulisan aslinya bisa dibaca di portal.",
            type: "CLINICAL",
            read: false,
          });
        }
      }

      await db.insert(auditLogs).values({
        userId: null,
        userRole: "ADMIN",
        action: berubah ? "TESTIMONI_DIRAPIKAN" : "TESTIMONI_DITINJAU",
        resourceType: "testimoni",
        resourceId: String(t.id),
        details: [
          berubah
            ? `Versi tayang dirapikan oleh ${actorNama ?? "admin"} — alasan: ${alasanEdit}. Teks asli tetap tersimpan.`
            : `Status tayang: ${status}.`,
          teruskanKePerawat === true
            ? "Diteruskan ke perawat."
            : teruskanKePerawat === false
            ? `Ditahan dari perawat — ${alasanTahan}.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      });

      return NextResponse.json({ success: true, testimoni: hasil });
    }

    /** Perawat menjawab testimoni tentang dirinya. */
    if (action === "BALAS_TESTIMONI") {
      const { testimoniId, balasan } = body;

      const [t] = await db
        .select()
        .from(testimoni)
        .where(eq(testimoni.id, Number(testimoniId)));
      if (!t)
        return NextResponse.json({ error: "Testimoni tidak ditemukan" }, { status: 404 });

      if (actorRole !== "ADMIN" && Number(actorProviderId) !== t.providerId)
        return NextResponse.json(
          { error: "Testimoni ini bukan tentang kunjungan Anda." },
          { status: 403 }
        );

      // Tidak bisa membalas masukan yang belum diteruskan admin — kalau bisa,
      // perawat sudah membacanya lewat jalan lain dan penyortirannya tidak
      // berarti apa-apa.
      if (actorRole !== "ADMIN" && t.statusKePerawat !== "DITERUSKAN")
        return NextResponse.json(
          { error: "Masukan ini belum diteruskan admin kepada Anda." },
          { status: 409 }
        );

      if (!String(balasan ?? "").trim())
        return NextResponse.json({ error: "Balasan kosong." }, { status: 400 });

      const [hasil] = await db
        .update(testimoni)
        .set({ balasanPerawat: String(balasan).trim(), balasanPada: new Date() })
        .where(eq(testimoni.id, Number(testimoniId)))
        .returning();

      await db.insert(auditLogs).values({
        userId: null,
        userRole: "PROVIDER",
        action: "TESTIMONI_DIBALAS",
        resourceType: "testimoni",
        resourceId: String(t.id),
        details: `Dibalas perawat.`,
      });

      return NextResponse.json({ success: true, testimoni: hasil });
    }

    /**
     * Menyalakan atau mematikan penanda sengketa pada sebuah kunjungan.
     *
     * Selama menyala, tugas terjadwal tidak menghapus foto dan tidak
     * mengubah status kunjungan itu — buktinya dibekukan sampai perkaranya
     * selesai. Hanya admin yang boleh mematikannya; pasien bisa
     * menyalakannya lewat keluhan, tapi tidak bisa mematikannya sendiri.
     */
    if (action === "TANDAI_SENGKETA") {
      const { bookingId, sengketa: nyala, alasan } = body;

      if (actorRole !== "ADMIN")
        return NextResponse.json(
          { error: "Hanya admin yang boleh mengubah penanda sengketa." },
          { status: 403 }
        );

      const [pesanan] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, Number(bookingId)));
      if (!pesanan)
        return NextResponse.json({ error: "Kunjungan tidak ditemukan" }, { status: 404 });

      if (!String(alasan ?? "").trim())
        return NextResponse.json(
          { error: "Tulis alasannya — tercatat di jejak audit." },
          { status: 400 }
        );

      const [hasil] = await db
        .update(bookings)
        .set({
          sengketa: Boolean(nyala),
          catatanSistem: `${nyala ? "Sengketa dinyalakan" : "Sengketa dicabut"} oleh ${
            actorNama ?? "admin"
          }: ${alasan}`,
        })
        .where(eq(bookings.id, Number(bookingId)))
        .returning();

      await db.insert(auditLogs).values({
        userId: null,
        userRole: "ADMIN",
        action: nyala ? "SENGKETA_DINYALAKAN" : "SENGKETA_DICABUT",
        resourceType: "bookings",
        resourceId: pesanan.bookingCode,
        details: `${alasan} (oleh ${actorNama ?? "admin"}).`,
      });

      return NextResponse.json({ success: true, booking: hasil });
    }

    /* ================================================================ */
    /*  BAGI HASIL                                                      */
    /* ================================================================ */

    /**
     * Admin menandai honor sudah ditransfer.
     *
     * Angkanya TIDAK bisa diubah di sini. Yang dicatat hanya bahwa uang
     * sebesar yang sudah tercatat itu benar-benar pindah, kapan, dan
     * dengan referensi apa. Kalau angkanya sendiri salah, yang harus
     * diperbaiki adalah rincian penawarannya — bukan diam-diam ditimpa di
     * tahap pembayaran, di mana tidak ada lagi yang bisa memeriksanya.
     */
    if (action === "TANDAI_HONOR_DIBAYARKAN") {
      const { payoutId, bukti } = body;

      if (actorRole !== "ADMIN")
        return NextResponse.json(
          { error: "Hanya admin yang boleh menandai honor sudah dibayarkan." },
          { status: 403 }
        );

      const [baris] = await db.select().from(payouts).where(eq(payouts.id, Number(payoutId)));
      if (!baris)
        return NextResponse.json({ error: "Baris bagi hasil tidak ditemukan." }, { status: 404 });

      const halangan = penghalangPembayaranHonor({
        status: baris.status as StatusBagiHasil,
        bukti: String(bukti ?? ""),
      });
      if (halangan) return NextResponse.json({ error: halangan }, { status: 409 });

      const [hasil] = await db
        .update(payouts)
        .set({
          status: "DIBAYARKAN",
          paidAt: new Date(),
          paidByUserId: aktor.userId ?? null,
          paymentReference: String(bukti).trim(),
          updatedAt: new Date(),
        })
        .where(eq(payouts.id, baris.id))
        .returning();

      await db.insert(auditLogs).values({
        userId: aktor.userId ?? null,
        userRole: "ADMIN",
        action: "HONOR_DIBAYARKAN",
        resourceType: "payouts",
        resourceId: baris.bookingCode,
        details: `Honor ${rp(baris.providerTakeIdr)} untuk ${baris.providerName} (${baris.bookingCode}) ditandai dibayarkan oleh ${actorNama ?? "admin"}. Bukti: ${String(bukti).trim()}.`,
      });

      const [perawatBaris] = await db
        .select()
        .from(providers)
        .where(eq(providers.id, baris.providerId));
      if (perawatBaris?.userId)
        await db.insert(notifications).values({
          userId: perawatBaris.userId,
          title: `Honor dibayarkan — ${baris.bookingCode}`,
          message: `Honor Anda ${rp(baris.providerTakeIdr)} untuk kunjungan ${baris.bookingCode} sudah ditransfer. Referensi: ${String(bukti).trim()}.`,
          type: "PAYMENT",
          read: false,
        });

      return NextResponse.json({ success: true, payout: hasil });
    }

    /**
     * Jaring pengaman: mencatat bagi hasil yang belum sempat tercatat.
     *
     * Perlu ada karena kunjungan yang sudah selesai SEBELUM pencatatan
     * otomatis dipasang tidak punya barisnya, dan karena kegagalan basis
     * data sesaat bisa membuat satu kunjungan terlewat. Tanpa jalan ini,
     * satu-satunya perbaikan adalah menyunting basis data langsung.
     *
     * Ini tidak pernah MENGUBAH baris yang sudah ada — hanya membuat yang
     * belum ada.
     */
    if (action === "CATAT_BAGI_HASIL_TERTINGGAL") {
      if (actorRole !== "ADMIN")
        return NextResponse.json(
          { error: "Hanya admin yang boleh menjalankan pencatatan susulan." },
          { status: 403 }
        );

      const selesai = await db.select().from(bookings).where(eq(bookings.status, S.SELESAI));
      const sudahAda = await db.select().from(payouts);
      const punya = new Set(sudahAda.map((p) => p.bookingId));

      let dicatat = 0;
      const dilewati: string[] = [];
      for (const b of selesai) {
        if (punya.has(b.id)) continue;
        const hasil = await catatBagiHasil(b.id, "ADMIN");
        if (hasil.dicatat) dicatat++;
        else dilewati.push(`${b.bookingCode}: ${hasil.alasan}`);
      }

      return NextResponse.json({ success: true, dicatat, dilewati });
    }

    /* ================================================================ */
    /*  VERIFIKASI PERAWAT                                              */
    /* ================================================================ */

    /**
     * Perawat mengajukan berkas izinnya.
     *
     * Yang diajukan tidak langsung membuatnya boleh bekerja — statusnya
     * menjadi MENUNGGU_TINJAUAN, dan yang meluluskan tetap orang.
     */
    if (action === "AJUKAN_VERIFIKASI") {
      const { strNumber, sipNumber, sipBerlakuSampai, sipDiterbitkanOleh, berkas } = body;

      const halangan = harusPerawat(aktor);
      if (halangan) return NextResponse.json({ error: halangan }, { status: 403 });
      if (aktor.providerId == null)
        return NextResponse.json({ error: "Akun ini bukan akun perawat." }, { status: 403 });

      const daftar: { jenis: string; fileUrl: string }[] = Array.isArray(berkas) ? berkas : [];
      const tolak = penghalangAjuVerifikasi({
        strNumber,
        sipNumber,
        sipBerlakuSampai,
        berkas: daftar,
      });
      if (tolak) return NextResponse.json({ error: tolak }, { status: 400 });

      /**
       * Dokumen lama ditandai DIGANTI, bukan dihapus.
       *
       * Kalau suatu hari dipersoalkan "apakah izinnya berlaku pada tanggal
       * kunjungan itu", yang menjawab adalah riwayat ini. Menghapus SIP
       * lama saat SIP baru diunggah menghapus jawabannya.
       */
      const lama = await db
        .select()
        .from(providerDocuments)
        .where(eq(providerDocuments.providerId, aktor.providerId));
      for (const d of lama) {
        if (!d.supersededAt && daftar.some((b) => b.jenis === d.jenis))
          await db
            .update(providerDocuments)
            .set({ supersededAt: new Date() })
            .where(eq(providerDocuments.id, d.id));
      }

      if (daftar.length)
        await db.insert(providerDocuments).values(
          daftar.slice(0, 8).map((b) => ({
            providerId: aktor.providerId!,
            jenis: String(b.jenis),
            fileUrl: String(b.fileUrl),
            nomor: b.jenis === "STR" ? String(strNumber) : b.jenis === "SIP" ? String(sipNumber) : null,
            berlakuSampai: b.jenis === "SIP" ? String(sipBerlakuSampai) : null,
          }))
        );

      const [hasil] = await db
        .update(providers)
        .set({
          licenseNumber: String(strNumber).replace(/\s/g, ""),
          sipNumber: String(sipNumber).trim(),
          sipBerlakuSampai: String(sipBerlakuSampai),
          sipDiterbitkanOleh: sipDiterbitkanOleh ? String(sipDiterbitkanOleh) : null,
          verifiedStatus: "MENUNGGU_TINJAUAN",
          verificationSubmittedAt: new Date(),
          /** Keputusan lama dikosongkan — berkasnya sudah berganti. */
          verifiedAt: null,
          verifiedByName: null,
          verifiedSumber: null,
        })
        .where(eq(providers.id, aktor.providerId))
        .returning();

      /** Semua admin diberi tahu — tabel notifications hanya bisa ditujukan ke satu userId. */
      const paraAdmin = await db.select().from(users).where(eq(users.role, "ADMIN"));
      for (const ad of paraAdmin) {
        await db.insert(notifications).values({
          userId: ad.id,
          title: "Ada pengajuan verifikasi",
          message: `${hasil.fullName} mengajukan STR dan SIP untuk ditinjau.`,
          type: "VERIFIKASI",
          read: false,
        });
      }

      await db.insert(auditLogs).values({
        userId: aktor.userId,
        userRole: aktor.peran,
        action: "VERIFIKASI_DIAJUKAN",
        resourceType: "providers",
        resourceId: String(aktor.providerId),
        details: `${hasil.fullName} mengajukan berkas izin (${daftar.map((b) => b.jenis).join(", ")}).`,
      });

      return NextResponse.json({ success: true, provider: hasil });
    }

    /**
     * Admin memutuskan.
     *
     * Meluluskan WAJIB menyebutkan di mana nomornya dicocokkan. Tanpa kolom
     * itu, "terverifikasi" hanya berarti seseorang menekan tombol hijau —
     * persis keadaan yang sedang diperbaiki, hanya dengan tombol.
     */
    if (action === "PUTUS_VERIFIKASI") {
      const { providerId, keputusan, alasan, diperiksaDi } = body;

      const halangan = harusAdmin(aktor);
      if (halangan) return NextResponse.json({ error: halangan }, { status: 403 });

      const tolak = penghalangPutusVerifikasi({ keputusan, alasan, diperiksaDi });
      if (tolak) return NextResponse.json({ error: tolak }, { status: 400 });

      const [perawat] = await db
        .select()
        .from(providers)
        .where(eq(providers.id, Number(providerId)));
      if (!perawat)
        return NextResponse.json({ error: "Perawat tidak ditemukan." }, { status: 404 });

      const lulus = keputusan === "TERVERIFIKASI";
      const [hasil] = await db
        .update(providers)
        .set({
          verifiedStatus: String(keputusan),
          verifiedAt: lulus ? new Date() : null,
          verifiedByName: lulus ? actorNama : null,
          verifiedSumber: lulus ? String(diperiksaDi).trim() : null,
          verificationNote: alasan ? String(alasan).trim() : null,
          /** Yang tidak lulus tidak boleh tampil sebagai "sedang tersedia". */
          isAvailableNow: lulus ? perawat.isAvailableNow : false,
        })
        .where(eq(providers.id, perawat.id))
        .returning();

      await db.insert(verificationReviews).values({
        providerId: perawat.id,
        keputusan: String(keputusan),
        alasan: alasan ? String(alasan).trim() : null,
        diperiksaDi: lulus ? String(diperiksaDi).trim() : null,
        adminUserId: aktor.userId,
        adminName: actorNama,
      });

      await db.insert(notifications).values({
        userId: perawat.userId,
        title: lulus ? "Izin praktik Anda sudah diverifikasi" : "Verifikasi belum lolos",
        message: lulus
          ? "Anda sudah bisa menerima permintaan kunjungan."
          : `${NAMA_VERIFIKASI[keputusan as StatusVerifikasi] ?? keputusan}: ${alasan}`,
        type: "VERIFIKASI",
        read: false,
      });

      /**
       * Perawat yang dibekukan dikeluarkan dari semua perangkatnya seketika.
       *
       * Pembekuan yang hanya mengubah satu kolom sementara sesinya tetap
       * hidup berarti orang itu masih membuka aplikasinya sampai sesinya
       * habis sendiri — dengan foto luka pasien di layarnya.
       */
      if (keputusan === "DIBEKUKAN") await cabutSemuaSesi(perawat.userId, "DIBEKUKAN");

      await db.insert(auditLogs).values({
        userId: aktor.userId,
        userRole: "ADMIN",
        action: `VERIFIKASI_${keputusan}`,
        resourceType: "providers",
        resourceId: String(perawat.id),
        details: lulus
          ? `${perawat.fullName} diluluskan oleh ${actorNama}; dicocokkan di: ${diperiksaDi}.`
          : `${perawat.fullName} — ${keputusan} oleh ${actorNama}: ${alasan}`,
      });

      return NextResponse.json({ success: true, provider: hasil });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/platform error:", error);
    return NextResponse.json(
      { error: "Failed to process platform action" },
      { status: 500 }
    );
  }
}
