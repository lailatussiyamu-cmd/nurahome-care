/**
 * Akibat sebuah pembatalan — siapa pun yang membatalkan.
 *
 * Sebelum audit 20 November 2026, membatalkan pemesanan hanya mengubah satu
 * kolom status. Dua orang tidak pernah tahu:
 *
 *   - PERAWAT yang sudah memegang kunjungan itu. Ia bisa saja berangkat,
 *     membeli bahan dengan uangnya sendiri, dan mengetuk pintu rumah yang
 *     tidak lagi menunggunya.
 *   - ADMIN, untuk pemesanan yang SUDAH DIBAYAR. Uang pasien tertahan di
 *     rekening tanpa ada yang diminta mengembalikannya — dan pasien tidak
 *     diberi tahu apa yang terjadi dengan uangnya.
 *
 * Dipanggil dari pembatalan pasien, pembatalan oleh admin, dan tugas
 * terjadwal yang membatalkan otomatis. Satu fungsi, supaya tidak ada jalur
 * pembatalan yang diam-diam lupa memberi tahu seseorang.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { rp } from "@/logic/biaya";
import { beritahuPengguna, beritahuPerawat, beritahuSemuaAdmin } from "@/server/pemberitahuan";

type Pesanan = typeof bookings.$inferSelect;

export async function setelahDibatalkan(pesanan: Pesanan, oleh: string) {
  if (pesanan.providerId != null)
    await beritahuPerawat(
      pesanan.providerId,
      `Kunjungan ${pesanan.bookingCode} dibatalkan`,
      `Kunjungan ${pesanan.bookingCode} (${pesanan.scheduledDate}, ${pesanan.scheduledTimeSlot}) dibatalkan ${oleh}. Jangan berangkat ke alamat ini.`
    );

  if (pesanan.paymentStatus === "LUNAS") {
    const catatan = `Perlu pengembalian dana ${rp(pesanan.totalPriceIdr)}: dibatalkan ${oleh} setelah lunas.`;
    await db.update(bookings).set({ catatanSistem: catatan }).where(eq(bookings.id, pesanan.id));

    await beritahuSemuaAdmin(
      `Uang perlu dikembalikan — ${pesanan.bookingCode}`,
      `${pesanan.patientName} sudah membayar ${rp(pesanan.totalPriceIdr)} untuk ${pesanan.bookingCode}, lalu kunjungannya dibatalkan ${oleh}. Kembalikan lewat dasbor Midtrans.`
    );
    await beritahuPengguna(
      pesanan.patientId,
      `Pembatalan ${pesanan.bookingCode} diterima`,
      `Pembayaran Anda ${rp(pesanan.totalPriceIdr)} akan dikembalikan. Admin kami akan menghubungi Anda bila ada yang perlu dipastikan.`,
      "PAYMENT"
    );
  }
}
