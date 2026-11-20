/**
 * Menerapkan satu pembayaran yang sudah dipastikan LUNAS ke pemesanannya.
 *
 * Dipakai bersama oleh kabar Midtrans (webhook) dan tugas `cocokkan-
 * pembayaran`. Dua jalur menuju satu akibat harus punya penjagaan yang
 * sama; kalau salah satunya lebih longgar, itulah yang akan terpakai.
 *
 * Tiga keadaan yang dulu lolos diam-diam (audit 20 November 2026):
 *
 *   1. Uang masuk untuk pemesanan yang SUDAH DIBATALKAN — pasien membatalkan
 *      atau tugas `belum-dibayar` membatalkan, sementara halaman bayar masih
 *      terbuka di ponselnya (tagihan berlaku 24 jam). Pasien lalu menerima
 *      "Perawat akan berangkat sesuai jadwal" untuk kunjungan yang sudah
 *      batal, dan tidak seorang pun diminta mengembalikan uangnya.
 *   2. Uang masuk DUA KALI untuk satu kunjungan, lewat dua nomor pesanan
 *      (percobaan pertama dikira kedaluwarsa, ternyata sempat dibayar).
 *      Keduanya tercatat lunas tanpa ada yang tahu.
 *   3. Pembatalan dan kabar lunas tiba bersamaan. Keduanya membaca
 *      DISETUJUI, keduanya menulis — hasil akhirnya bergantung pada siapa
 *      yang terakhir menulis. Sekarang pemindahan statusnya bersyarat
 *      ("hanya kalau masih DISETUJUI"), jadi tepat satu yang menang dan
 *      yang kalah tahu ia kalah.
 */

import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { bookings, payments } from "@/db/schema";
import { S } from "@/logic/alur";
import { rp } from "@/logic/biaya";
import { catatBagiHasil } from "@/server/bagihasil";
import { beritahuPengguna, beritahuSemuaAdmin } from "@/server/pemberitahuan";

export type HasilPelunasan = "DIBAYAR" | "SUDAH_BERJALAN" | "BATAL" | "GANDA" | "TIDAK_ADA";

export async function terapkanLunas(a: {
  bayar: { id: number; bookingId: number; orderId: string; amountIdr: number };
  metode: string;
}): Promise<HasilPelunasan> {
  const { bayar } = a;

  /* ---- 2. ganda: sudah ada pembayaran LUNAS lain untuk kunjungan ini ---- */
  const lainLunas = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bayar.bookingId), eq(payments.status, "LUNAS"), ne(payments.id, bayar.id)));

  const [awal] = await db.select().from(bookings).where(eq(bookings.id, bayar.bookingId));
  if (!awal) return "TIDAK_ADA";

  if (lainLunas.length) {
    const alasan = `Pembayaran ganda: ${awal.bookingCode} sudah lunas lewat ${lainLunas[0].orderId}. ${rp(bayar.amountIdr)} ini perlu dikembalikan.`;
    await db
      .update(payments)
      .set({ status: "PERLU_TINJAUAN", statusReason: alasan, updatedAt: new Date() })
      .where(eq(payments.id, bayar.id));
    await beritahuSemuaAdmin(
      `Pembayaran ganda — kembalikan ${rp(bayar.amountIdr)} (${awal.bookingCode})`,
      `${awal.patientName} membayar dua kali untuk ${awal.bookingCode} (${lainLunas[0].orderId} dan ${bayar.orderId}). Kembalikan yang kedua lewat dasbor Midtrans.`
    );
    await beritahuPengguna(
      awal.patientId,
      `Pembayaran kedua untuk ${awal.bookingCode}`,
      `Kami menerima pembayaran ${rp(bayar.amountIdr)} lagi untuk kunjungan yang sudah lunas. Kelebihannya akan dikembalikan; kunjungan Anda tetap berjalan.`,
      "PAYMENT"
    );
    return "GANDA";
  }

  /* ---- normal: hanya kalau MASIH menunggu pembayaran ---- */
  const [dimajukan] = await db
    .update(bookings)
    .set({ status: S.DIBAYAR, paymentStatus: "LUNAS", paymentMethod: a.metode })
    .where(and(eq(bookings.id, bayar.bookingId), eq(bookings.status, S.DISETUJUI)))
    .returning();

  if (dimajukan) {
    await beritahuPengguna(
      dimajukan.patientId,
      "Pembayaran diterima",
      `Pembayaran ${rp(bayar.amountIdr)} untuk ${dimajukan.bookingCode} sudah kami terima. Perawat akan berangkat sesuai jadwal.`,
      "PAYMENT"
    );
    await catatBagiHasil(dimajukan.id, "PEMBAYARAN_MASUK");
    return "DIBAYAR";
  }

  const [kini] = await db.select().from(bookings).where(eq(bookings.id, bayar.bookingId));
  if (!kini) return "TIDAK_ADA";

  /* ---- 1. uang masuk setelah dibatalkan ---- */
  if (kini.status === S.DIBATALKAN) {
    await db
      .update(bookings)
      .set({
        paymentStatus: "LUNAS",
        paymentMethod: a.metode,
        // Sengketa membekukan buktinya sampai uangnya selesai dikembalikan.
        sengketa: true,
        catatanSistem: `Uang ${rp(bayar.amountIdr)} masuk setelah pemesanan dibatalkan — perlu dikembalikan.`,
      })
      .where(eq(bookings.id, kini.id));
    await beritahuSemuaAdmin(
      `Uang perlu dikembalikan — ${kini.bookingCode}`,
      `${rp(bayar.amountIdr)} masuk (${bayar.orderId}) untuk ${kini.bookingCode} yang sudah dibatalkan. Kembalikan lewat dasbor Midtrans.`
    );
    await beritahuPengguna(
      kini.patientId,
      `Pembayaran untuk ${kini.bookingCode} akan dikembalikan`,
      `Pembayaran ${rp(bayar.amountIdr)} kami terima setelah pemesanan ini dibatalkan. Uangnya akan dikembalikan; tidak ada kunjungan yang dijadwalkan.`,
      "PAYMENT"
    );
    return "BATAL";
  }

  /**
   * Kabar terlambat untuk kunjungan yang sudah berjalan (perawat sudah
   * berangkat, bahkan selesai). Statusnya tidak dimundurkan; hanya
   * pembayarannya dicatat.
   */
  await db
    .update(bookings)
    .set({ paymentStatus: "LUNAS", paymentMethod: a.metode })
    .where(eq(bookings.id, kini.id));
  await beritahuPengguna(
    kini.patientId,
    "Pembayaran diterima",
    `Pembayaran ${rp(bayar.amountIdr)} untuk ${kini.bookingCode} sudah kami terima.`,
    "PAYMENT"
  );
  await catatBagiHasil(kini.id, "PEMBAYARAN_MASUK");
  return "SUDAH_BERJALAN";
}
