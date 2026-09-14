/**
 * Kabar pembayaran dari Midtrans (webhook).
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  INI SATU-SATUNYA TEMPAT DI SELURUH APLIKASI YANG BOLEH MENULIS       │
 * │  paymentStatus = "LUNAS".                                             │
 * │                                                                       │
 * │  Alamatnya BUKAN rahasia — ia tertulis di dasbor Midtrans dan bisa    │
 * │  dipanggil siapa pun di internet. Yang membedakan kabar sungguhan     │
 * │  dari kabar palsu hanya TANDA TANGAN:                                 │
 * │      SHA512(order_id + status_code + gross_amount + ServerKey)        │
 * │  ServerKey tidak pernah keluar dari server, jadi hanya Midtrans yang  │
 * │  bisa menghasilkan tanda tangan yang cocok.                           │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Endpoint ini sengaja TIDAK memakai cookie sesi. Yang memanggilnya adalah
 * server Midtrans, bukan orang yang sedang membuka aplikasi. Memaksanya
 * login akan membuat setiap kabar ditolak — dan akibatnya bukan "lebih
 * aman", melainkan setiap pembayaran yang berhasil tidak pernah tercatat.
 */

import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, payments, paymentEvents, notifications, auditLogs, users } from "@/db/schema";
import {
  bacaStatusMidtrans,
  kodeDariNomorPesanan,
  penghalangKabar,
  rupiahBulat,
  sidikKabar,
  tandaTanganCocok,
  tandaTanganMidtrans,
  type HasilBayar,
} from "@/logic/pembayaran";
import { serverKey } from "@/server/midtrans";
import { sidikIp } from "@/logic/otentikasi";
import { S } from "@/logic/alur";
import { rp } from "@/logic/biaya";
import { catatBagiHasil } from "@/server/bagihasil";

export const dynamic = "force-dynamic";

const GARAM_IP = process.env.IP_HASH_SALT || process.env.CRON_SECRET || "nurahome-garam-lokal";

function ipDari(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "0.0.0.0"
  );
}

export async function POST(req: NextRequest) {
  const ipHash = sidikIp(ipDari(req), GARAM_IP);
  let kabar: any = {};

  try {
    kabar = await req.json().catch(() => ({}));
    const orderId = String(kabar?.order_id ?? "");
    const statusCode = String(kabar?.status_code ?? "");
    const grossAmount = String(kabar?.gross_amount ?? "");
    const mentah = JSON.stringify(kabar).slice(0, 8000);

    const catat = (a: {
      outcome: string;
      note: string;
      signatureOk: boolean;
      paymentId?: number | null;
    }) =>
      db.insert(paymentEvents).values({
        orderId: orderId || null,
        paymentId: a.paymentId ?? null,
        transactionStatus: kabar?.transaction_status ?? null,
        fraudStatus: kabar?.fraud_status ?? null,
        grossAmount: grossAmount || null,
        signatureOk: a.signatureOk,
        outcome: a.outcome,
        note: a.note,
        rawJson: mentah,
        ipHash,
      });

    /* ---------------- 1. tanda tangan ---------------- */

    const kunci = serverKey();
    if (!kunci) {
      /**
       * Tanpa server key, kabar TIDAK bisa diperiksa — jadi tidak satu pun
       * kabar diterima. Bukan "diterima sementara sampai kuncinya dipasang".
       */
      await catat({ outcome: "DITOLAK_TANDA_TANGAN", note: "MIDTRANS_SERVER_KEY belum dipasang.", signatureOk: false });
      return NextResponse.json({ error: "Belum siap menerima kabar." }, { status: 503 });
    }

    const dihitung = tandaTanganMidtrans({ orderId, statusCode, grossAmount, serverKey: kunci });
    const sah = tandaTanganCocok(String(kabar?.signature_key ?? ""), dihitung);

    if (!sah) {
      await catat({
        outcome: "DITOLAK_TANDA_TANGAN",
        note: "Tanda tangan tidak cocok.",
        signatureOk: false,
      });
      /**
       * Jawabannya sengaja tidak menjelaskan apa yang salah. Yang mengirim
       * kabar tanpa tanda tangan yang sah bukan Midtrans, dan tidak perlu
       * dibantu memperbaiki tebakannya.
       */
      return NextResponse.json({ error: "Ditolak." }, { status: 401 });
    }

    /* ---------------- 2. cari catatannya ---------------- */

    const [bayar] = await db.select().from(payments).where(eq(payments.orderId, orderId));
    const { hasil, alasan } = bacaStatusMidtrans({
      transactionStatus: kabar?.transaction_status,
      fraudStatus: kabar?.fraud_status,
    });

    const tolak = penghalangKabar({
      catatan: bayar ?? null,
      nominalDikabarkan: Number(grossAmount),
      hasil,
    });

    if (tolak) {
      /**
       * Kabar tertinggal cukup dicatat lalu diabaikan.
       *
       * Ini keadaan yang NORMAL — urutan kabar dari penyedia tidak
       * dijamin. Versi pertama memperlakukannya sama dengan anomali:
       * satu kabar `pending` yang sampai beberapa detik setelah
       * `settlement` membuat pembayaran yang sudah lunas ditandai
       * PERLU_TINJAUAN dan pemesanannya ditandai BERSENGKETA. Ketahuan
       * saat mengirim kabar keluar urutan dengan sengaja ke server yang
       * sedang berjalan.
       */
      if (tolak.jenis === "TERTINGGAL") {
        await catat({
          outcome: "DIABAIKAN_TERTINGGAL",
          note: tolak.alasan,
          signatureOk: true,
          paymentId: bayar?.id,
        });
        return NextResponse.json({ diterima: true, tertinggal: tolak.alasan });
      }

      await catat({ outcome: "DITAHAN", note: tolak.alasan, signatureOk: true, paymentId: bayar?.id });

      /**
       * Kabar bertanda tangan sah yang tetap ditahan adalah keadaan yang
       * harus dilihat orang — nominalnya tidak cocok, atau nomor
       * pesanannya tidak dikenali. Ada uang sungguhan yang terlibat.
       */
      if (bayar) {
        await db
          .update(payments)
          .set({ status: "PERLU_TINJAUAN", statusReason: tolak.alasan, updatedAt: new Date() })
          .where(eq(payments.id, bayar.id));
        await tandaiSengketa(bayar.bookingId, `Pembayaran perlu ditinjau: ${tolak.alasan}`);
      }
      await beritahuAdmin("Pembayaran perlu ditinjau", `${orderId}: ${tolak.alasan}`);

      /**
       * Dijawab 200, bukan 4xx. Midtrans akan MENGULANG kiriman untuk
       * jawaban selain 200 — dan mengulang kabar yang memang sengaja
       * ditahan tidak menyelesaikan apa pun; ia hanya menghasilkan
       * belasan baris yang sama dan belasan pemberitahuan ke admin.
       * Kabarnya sudah kami terima; yang belum selesai adalah urusannya.
       */
      return NextResponse.json({ diterima: true, ditahan: tolak.alasan });
    }

    /* ---------------- 3. kiriman ganda ---------------- */

    const sidik = sidikKabar(kabar);
    if (bayar?.lastNoticeHash === sidik) {
      await catat({
        outcome: "DIABAIKAN_GANDA",
        note: "Kabar yang sama sudah diproses.",
        signatureOk: true,
        paymentId: bayar.id,
      });
      return NextResponse.json({ diterima: true, ganda: true });
    }

    /* ---------------- 4. menerapkan ---------------- */

    const sekarang = new Date();
    await db
      .update(payments)
      .set({
        status: hasil,
        statusReason: alasan || null,
        paymentType: kabar?.payment_type ?? null,
        providerTxnId: kabar?.transaction_id ?? null,
        paidAt: hasil === "LUNAS" ? sekarang : bayar!.paidAt,
        lastNoticeHash: sidik,
        updatedAt: sekarang,
      })
      .where(eq(payments.id, bayar!.id));

    const [pesanan] = await db.select().from(bookings).where(eq(bookings.id, bayar!.bookingId));

    if (hasil === "LUNAS" && pesanan) {
      /**
       * Status pemesanan hanya dimajukan kalau ia memang masih menunggu
       * pembayaran.
       *
       * Kabar bisa sampai terlambat — perawatnya mungkin sudah berangkat,
       * bahkan sudah selesai. Menyetel ulang statusnya ke DIBAYAR akan
       * memundurkan kunjungan yang sudah berjalan.
       */
      const majukan = pesanan.status === S.DISETUJUI;
      await db
        .update(bookings)
        .set({
          paymentStatus: "LUNAS",
          paymentMethod: String(kabar?.payment_type ?? "-"),
          ...(majukan ? { status: S.DIBAYAR } : {}),
        })
        .where(eq(bookings.id, pesanan.id));

      await db.insert(notifications).values({
        userId: pesanan.patientId,
        title: "Pembayaran diterima",
        message: `Pembayaran ${rp(bayar!.amountIdr)} untuk ${pesanan.bookingCode} sudah kami terima. Perawat akan berangkat sesuai jadwal.`,
        type: "PAYMENT",
        read: false,
      });

      /**
       * Bagi hasil dicatat di sini juga, bukan hanya saat laporan ditutup.
       *
       * Sejujurnya: HARI INI baris ini hampir tidak pernah benar-benar
       * mencatat apa pun. Alur statusnya membuat uang selalu masuk lebih
       * dulu — perawat baru boleh berangkat setelah pemesanan berstatus
       * DIBAYAR, dan yang menyetel status itu justru kabar ini. Jadi
       * ketika kabar sampai, kunjungannya belum ditutup, dan fungsinya
       * berhenti sendiri.
       *
       * Ia tetap dipasang karena urutan itu bisa berubah, dan kalau
       * berubah, perubahannya tidak akan terlihat seperti masalah bagi
       * hasil. Jalur "bayar di tempat setelah tindakan" adalah permintaan
       * yang wajar untuk layanan seperti ini; begitu ada, kunjungan
       * ditutup lebih dulu dan kabar pembayaran menyusul. Tanpa baris ini,
       * honor kunjungan-kunjungan itu tidak pernah tercatat — diam-diam,
       * tanpa galat, dan yang dirugikan perawat yang sudah bekerja.
       */
      await catatBagiHasil(pesanan.id, "PEMBAYARAN_MASUK");
    }

    if (hasil === "GAGAL" && pesanan && pesanan.status === S.DISETUJUI) {
      /**
       * Pemesanan TIDAK dibatalkan di sini, hanya pasiennya diberi tahu.
       *
       * Pembayaran yang gagal atau kedaluwarsa bukan berarti pasiennya
       * batal — sangat sering artinya saldonya kurang, atau kode QR-nya
       * lewat batas waktu. Yang membatalkan setelah 24 jam adalah tugas
       * terjadwal `belum-dibayar`, dengan tenggat yang sudah diketahui
       * pasien. Membatalkan di sini berarti satu kali gagal transfer
       * menghapus jadwal yang sudah disiapkan.
       */
      await db.insert(notifications).values({
        userId: pesanan.patientId,
        title: "Pembayaran belum berhasil",
        message: `${alasan} Jadwal ${pesanan.bookingCode} masih kami tahan — silakan coba bayar lagi.`,
        type: "PAYMENT",
        read: false,
      });
    }

    if (hasil === "PERLU_TINJAUAN" || hasil === "DIKEMBALIKAN") {
      await beritahuAdmin(
        hasil === "DIKEMBALIKAN" ? "Dana dikembalikan" : "Pembayaran perlu ditinjau",
        `${orderId} — ${alasan || hasil}`
      );
      if (pesanan) await tandaiSengketa(pesanan.id, `Pembayaran: ${alasan || hasil}`);
    }

    await catat({ outcome: "DITERIMA", note: hasil, signatureOk: true, paymentId: bayar!.id });

    await db.insert(auditLogs).values({
      userId: null,
      userRole: "SISTEM",
      action: `PEMBAYARAN_${hasil}`,
      resourceType: "payments",
      resourceId: orderId,
      details: `Kabar Midtrans: ${kabar?.transaction_status}${
        kabar?.fraud_status ? `/${kabar.fraud_status}` : ""
      }, ${rp(Number(grossAmount))}.${alasan ? ` ${alasan}` : ""}`,
    });

    return NextResponse.json({ diterima: true, status: hasil });
  } catch (e) {
    console.error("POST /api/pembayaran/kabar error:", e);
    /**
     * 500 supaya Midtrans mengulang kirimannya. Kegagalan tak terduga di
     * sini adalah satu-satunya keadaan yang memang pantas diulang —
     * kabarnya belum sempat diproses sama sekali.
     */
    return NextResponse.json({ error: "Gagal memproses kabar." }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */

async function beritahuAdmin(judul: string, pesan: string) {
  const paraAdmin = await db.select().from(users).where(eq(users.role, "ADMIN"));
  for (const a of paraAdmin) {
    await db.insert(notifications).values({
      userId: a.id,
      title: judul,
      message: pesan,
      type: "PAYMENT",
      read: false,
    });
  }
}

/**
 * Menandai pemesanan bersengketa.
 *
 * Akibat yang paling penting: tugas terjadwal tidak akan menghapus foto
 * lukanya, dan tidak akan mengubah statusnya. Selama ada persoalan uang
 * yang belum selesai, buktinya harus utuh.
 */
async function tandaiSengketa(bookingId: number, alasan: string) {
  await db
    .update(bookings)
    .set({ sengketa: true, catatanSistem: `Sengketa otomatis — ${alasan}` })
    .where(eq(bookings.id, bookingId));
}
