/**
 * Pemberitahuan yang dipakai lebih dari satu jalur.
 *
 * Dipisah dari api/platform supaya webhook pembayaran, tugas terjadwal, dan
 * aksi di layar memberi tahu orang yang SAMA dengan kalimat yang SAMA untuk
 * kejadian yang sama. Kalau tiap jalur menulis pemberitahuannya sendiri,
 * lama-lama satu jalur lupa memberi tahu seseorang — dan itulah persisnya
 * celah yang ditemukan saat audit 20 November 2026.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications, providers, users } from "@/db/schema";
import { kirimPesan, tujuanUntuk } from "@/server/pengirim";

export async function beritahuPengguna(
  userId: number | null | undefined,
  judul: string,
  pesan: string,
  jenis = "BOOKING"
) {
  if (!userId) return;
  await db.insert(notifications).values({ userId, title: judul, message: pesan, type: jenis, read: false });
}

export async function beritahuSemuaAdmin(
  judul: string,
  pesan: string,
  jenis = "PAYMENT",
  opsi: { whatsapp?: boolean } = {}
) {
  const paraAdmin = await db.select().from(users).where(eq(users.role, "ADMIN"));
  for (const a of paraAdmin) {
    await beritahuPengguna(a.id, judul, pesan, jenis);
    /**
     * Untuk hal yang tidak bisa menunggu admin membuka aplikasi, pesan
     * juga dicatat di kotak keluar WhatsApp. Kalau penyedianya belum
     * dipasang, ia tetap tercatat dan terlihat di kotak keluar.
     */
    if (opsi.whatsapp && a.phone)
      await kirimPesan({ saluran: "WHATSAPP", tujuan: tujuanUntuk(a.phone), jenis, isi: `${judul}\n${pesan}` });
  }
}

/** Pengguna akun dari seorang perawat (tabel providers → users). */
export async function beritahuPerawat(
  providerId: number | null | undefined,
  judul: string,
  pesan: string,
  jenis = "BOOKING"
) {
  if (providerId == null) return;
  const [p] = await db.select().from(providers).where(eq(providers.id, providerId));
  await beritahuPengguna(p?.userId, judul, pesan, jenis);
}
