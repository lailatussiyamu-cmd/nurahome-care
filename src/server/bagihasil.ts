/**
 * Mencatat bagi hasil — satu fungsi, dipanggil dari dua tempat.
 *
 * Dua hal harus terjadi sebelum perawat berhak atas honornya: kunjungannya
 * ditutup dengan laporan, dan uangnya masuk. Keduanya bisa terjadi dalam
 * urutan mana pun. Kabar pembayaran dari Midtrans pernah sampai setelah
 * perawat pulang, dan sebaliknya pasien sering membayar jauh sebelum hari
 * kunjungan.
 *
 * Karena itu fungsi ini dipanggil dari KEDUA tempat — dari penutupan
 * laporan dan dari kabar pembayaran — dan aman dipanggil berkali-kali.
 * Yang datang belakangan yang benar-benar mencatatnya; yang lain berhenti
 * di pemeriksaan pertama.
 *
 * Kalau ini dipasang hanya di salah satu tempat, honornya hilang setiap
 * kali urutannya terbalik — diam-diam, tanpa galat, dan yang dirugikan
 * adalah perawat yang sudah bekerja.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { bookings, payments, payouts, quoteItems, notifications, auditLogs } from "@/db/schema";
import { putuskanBagiHasil, type Putusan } from "@/logic/bagihasil";
import { PORSI_PLATFORM } from "@/logic/biaya";
import type { ItemPenawaran } from "@/logic/alur";
import { rp } from "@/logic/biaya";

export type HasilPencatatan =
  | { dicatat: false; alasan: string }
  | { dicatat: true; baru: boolean; putusan: Putusan };

/**
 * @param pemicu dari mana pemanggilan ini datang — hanya untuk jejak audit,
 *        supaya kalau suatu saat ada honor yang tidak tercatat, terlihat
 *        jalur mana yang seharusnya memanggilnya.
 */
export async function catatBagiHasil(
  bookingId: number,
  pemicu: "LAPORAN_DITUTUP" | "PEMBAYARAN_MASUK" | "ADMIN"
): Promise<HasilPencatatan> {
  const [pesanan] = await db.select().from(bookings).where(eq(bookings.id, Number(bookingId)));
  if (!pesanan) return { dicatat: false, alasan: "Pemesanan tidak ditemukan." };

  /**
   * Sudah ada barisnya? Berhenti di sini.
   *
   * Ini yang membuat fungsi ini aman dipanggil dua kali. Baris yang sudah
   * ada TIDAK diperbarui — angkanya sengaja beku, dan memperbaruinya di
   * sini berarti kabar pembayaran yang datang terlambat bisa mengubah
   * honor yang sudah dibayarkan.
   */
  const [ada] = await db.select().from(payouts).where(eq(payouts.bookingId, pesanan.id));
  if (ada) return { dicatat: false, alasan: "Bagi hasil kunjungan ini sudah tercatat." };

  const item = (await db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.bookingId, pesanan.id))) as unknown as ItemPenawaran[];

  /**
   * Uang yang diterima diambil dari tabel pembayaran, BUKAN dari total di
   * pemesanan. Dua sumber yang berbeda justru gunanya: kalau keduanya
   * tidak sama, ada yang salah, dan putusannya menahan honor itu untuk
   * ditinjau alih-alih menebak mana yang benar.
   */
  const lunas = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, pesanan.id), eq(payments.status, "LUNAS")));
  const dibayarIdr = lunas.length > 0 ? lunas.reduce((t, p) => t + p.amountIdr, 0) : null;

  const putusan = putuskanBagiHasil({
    statusPesanan: pesanan.status,
    statusBayar: pesanan.paymentStatus,
    sengketa: Boolean(pesanan.sengketa),
    item,
    dibayarIdr,
  });

  if (!putusan.siap) return { dicatat: false, alasan: putusan.belumSiap };

  if (!pesanan.providerId)
    return {
      dicatat: false,
      alasan: "Kunjungan ini tidak punya perawat yang tercatat, jadi honornya tidak bisa dialamatkan.",
    };

  const h = putusan.honor;

  try {
    await db.insert(payouts).values({
      bookingId: pesanan.id,
      bookingCode: pesanan.bookingCode,
      providerId: pesanan.providerId,
      providerName: pesanan.providerName ?? "-",
      visitDate: pesanan.scheduledDate,
      totalBilledIdr: putusan.totalTagihan,
      serviceIdr: h.jasa,
      providerShareIdr: h.porsiPerawat,
      platformFeeIdr: h.potonganPlatform,
      suppliesIdr: h.bahan,
      travelIdr: h.jarak,
      afterHoursIdr: h.luarJam,
      providerTakeIdr: h.diterima,
      platformRate: String(PORSI_PLATFORM),
      status: putusan.status,
      note: putusan.catatan || null,
    });
  } catch (e) {
    /**
     * Dua panggilan yang tiba bersamaan — laporan ditutup persis saat
     * kabar pembayaran masuk — bisa sama-sama lolos pemeriksaan "sudah
     * ada" di atas. Yang menahan duplikatnya adalah kunci unik di basis
     * data, bukan pemeriksaan itu; di sini kegagalannya diterima sebagai
     * hal yang wajar, bukan galat.
     */
    const pesan = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate/i.test(pesan))
      return { dicatat: false, alasan: "Bagi hasil kunjungan ini sudah tercatat." };
    throw e;
  }

  await db.insert(auditLogs).values({
    userId: null,
    userRole: "SYSTEM",
    action: "BAGI_HASIL_DICATAT",
    resourceType: "payouts",
    resourceId: pesanan.bookingCode,
    details:
      `Bagi hasil ${pesanan.bookingCode} dicatat otomatis (${pemicu}): tagihan ${rp(putusan.totalTagihan)}, ` +
      `jasa ${rp(h.jasa)} → perawat ${rp(h.porsiPerawat)} / platform ${rp(h.potonganPlatform)}, ` +
      `bahan ${rp(h.bahan)}, jarak ${rp(h.jarak)}, luar jam ${rp(h.luarJam)}. ` +
      `Diterima perawat ${rp(h.diterima)}. Status ${putusan.status}.` +
      (putusan.catatan ? ` ${putusan.catatan}` : ""),
  });

  /**
   * Perawatnya diberi tahu hanya kalau honornya memang sudah menjadi
   * haknya. Mengabari "honor Anda perlu ditinjau" tanpa ada yang bisa ia
   * lakukan hanya menimbulkan cemas; yang perlu bertindak untuk kasus itu
   * adalah admin, dan itu ditangani di layar admin.
   */
  if (putusan.status === "TERKUMPUL") {
    const pemilik = await penggunaPerawat(pesanan.providerId);
    if (pemilik)
      await db.insert(notifications).values({
        userId: pemilik,
        title: `Honor tercatat — ${pesanan.bookingCode}`,
        message: `Honor Anda ${rp(h.diterima)} untuk kunjungan ${pesanan.bookingCode} sudah tercatat dan masuk daftar pembayaran.`,
        type: "PAYMENT",
        read: false,
      });
  }

  return { dicatat: true, baru: true, putusan };
}

async function penggunaPerawat(providerId: number): Promise<number | null> {
  const { providers } = await import("@/db/schema");
  const [p] = await db.select().from(providers).where(eq(providers.id, providerId));
  return p?.userId ?? null;
}
