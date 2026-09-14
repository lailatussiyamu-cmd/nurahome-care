/**
 * Lupa kata sandi.
 *
 * Sebelum berkas ini ada, satu-satunya jalan adalah admin membantu satu per
 * satu — dan itu berhenti bekerja begitu pasiennya lebih dari segelintir.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  JALUR INI ADALAH PINTU BELAKANG KE SETIAP AKUN, TERMASUK ADMIN.      │
 * │                                                                       │
 * │  Kalau lemah, ia membatalkan seluruh penjagaan kata sandi yang sudah  │
 * │  dibangun: scrypt, penguncian bertingkat, batas per-IP. Penyerang     │
 * │  tidak akan menebak sandi kalau ada jalan yang lebih mudah.           │
 * │                                                                       │
 * │  Empat aturan yang membentuk berkas ini:                              │
 * │                                                                       │
 * │  1. Kodenya dikirim LEWAT JALUR LAIN (WhatsApp/SMS/surel), tidak      │
 * │     pernah dikembalikan di jawaban HTTP. Kalau dikembalikan, siapa    │
 * │     pun yang tahu nomor telepon seseorang bisa mengambil alih         │
 * │     akunnya dalam dua permintaan.                                     │
 * │  2. Jawabannya SAMA, baik nomornya terdaftar maupun tidak.            │
 * │  3. Kodenya sekali pakai dan berumur pendek.                          │
 * │  4. Setelah sandi berganti, SEMUA sesi dicabut — orang yang memakai   │
 * │     jalur ini biasanya sedang curiga akunnya dimasuki.                │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/* ------------------------------------------------------------------ */
/* Bentuk kode                                                         */
/* ------------------------------------------------------------------ */

/**
 * Enam angka, bukan tautan panjang.
 *
 * Yang menerima adalah orang yang sedang membuka aplikasi di ponselnya dan
 * berpindah ke WhatsApp untuk melihat kodenya. Enam angka bisa dibaca
 * sekali lihat dan diketik tanpa salah. Tautan panjang di WhatsApp sering
 * terpotong, dan menekan tautan memindahkan orangnya ke peramban lain —
 * di mana ia tidak sedang masuk.
 *
 * Enam angka = 1 juta kemungkinan. Itu terlalu sedikit untuk ditebak
 * SANTAI, jadi jumlah percobaannya dibatasi ketat di bawah. Tanpa batas
 * itu, enam angka bisa dihabiskan mesin dalam hitungan menit.
 */
export const PANJANG_KODE = 6;

export function buatKode(): string {
  return String(randomInt(0, 1_000_000)).padStart(PANJANG_KODE, "0");
}

/**
 * Yang disimpan hanya sidik jarinya.
 *
 * Alasannya sama dengan token sesi: kalau isi tabel ini bocor, yang bocor
 * adalah daftar sidik jari yang tidak bisa dipakai mengambil alih akun.
 *
 * Kodenya digabung dengan `userId` sebelum disidik. Tanpa itu, dua orang
 * yang kebetulan mendapat kode sama menghasilkan sidik jari yang sama —
 * dan kode milik orang lain bisa dipakai di akun yang salah.
 */
export function sidikKode(userId: number, kode: string): string {
  return createHash("sha256").update(`${userId}:${String(kode).trim()}`).digest("hex");
}

export function kodeCocok(disimpan: string | null | undefined, userId: number, kode: string): boolean {
  if (!disimpan) return false;
  const a = Buffer.from(disimpan, "utf8");
  const b = Buffer.from(sidikKode(userId, kode), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Umur dan batas                                                      */
/* ------------------------------------------------------------------ */

/**
 * 15 menit.
 *
 * Cukup untuk berpindah ke WhatsApp, mencari pesannya, dan kembali —
 * termasuk kalau sinyalnya buruk. Tidak cukup lama untuk kode yang
 * tertinggal di ponsel yang dipinjam menjadi berguna keesokan harinya.
 */
export const UMUR_KODE_MENIT = 15;

/** Salah memasukkan kode sebanyak ini, kodenya hangus — bukan hanya ditolak. */
export const BATAS_SALAH = 5;

/**
 * Berapa banyak permintaan kode boleh dibuat untuk satu akun per jam.
 *
 * Dua sebabnya. Pertama, tanpa batas ini seseorang bisa membanjiri ponsel
 * orang lain dengan pesan — gangguan yang nyata dan mahal bagi yang
 * menerima. Kedua, setiap permintaan baru membuat kode baru, jadi tanpa
 * batas, penyerang bisa memperbanyak peluangnya menebak.
 */
export const BATAS_MINTA_PER_JAM = 3;

export function kedaluwarsaKode(sekarang = new Date()): Date {
  return new Date(sekarang.getTime() + UMUR_KODE_MENIT * 60_000);
}

export type BarisPemulihan = {
  expiresAt?: Date | string | null;
  usedAt?: Date | string | null;
  attempts?: number | null;
};

export type AlasanTolakKode =
  | "TIDAK_ADA"
  | "SUDAH_DIPAKAI"
  | "KEDALUWARSA"
  | "TERLALU_BANYAK_SALAH";

export const PESAN_TOLAK_KODE: Record<AlasanTolakKode, string> = {
  TIDAK_ADA: "Kode tidak dikenali. Minta kode baru.",
  SUDAH_DIPAKAI: "Kode ini sudah dipakai. Minta kode baru.",
  KEDALUWARSA: `Kode sudah lewat ${UMUR_KODE_MENIT} menit. Minta kode baru.`,
  TERLALU_BANYAK_SALAH: "Terlalu banyak percobaan. Minta kode baru.",
};

export function periksaBarisKode(
  baris: BarisPemulihan | null | undefined,
  sekarang = new Date()
): { boleh: boolean; alasan: AlasanTolakKode | "" } {
  if (!baris) return { boleh: false, alasan: "TIDAK_ADA" };
  if (baris.usedAt) return { boleh: false, alasan: "SUDAH_DIPAKAI" };
  if ((baris.attempts ?? 0) >= BATAS_SALAH)
    return { boleh: false, alasan: "TERLALU_BANYAK_SALAH" };
  const habis = baris.expiresAt ? new Date(baris.expiresAt) : null;
  if (!habis || habis <= sekarang) return { boleh: false, alasan: "KEDALUWARSA" };
  return { boleh: true, alasan: "" };
}

/* ------------------------------------------------------------------ */
/* Jawaban yang tidak membocorkan apa pun                              */
/* ------------------------------------------------------------------ */

/**
 * Kalimat yang sama, apa pun kenyataannya.
 *
 * Dikirim baik ketika nomornya terdaftar maupun tidak, dan baik ketika
 * batas permintaannya sudah habis maupun belum. Kalau dibedakan, halaman
 * "lupa sandi" berubah menjadi alat memeriksa siapa saja yang memakai
 * layanan perawatan luka — persis lubang yang sudah ditutup di halaman
 * masuk dan halaman pendaftaran.
 *
 * Kalimatnya sengaja tidak berjanji "kode sudah dikirim", melainkan
 * "kalau nomornya terdaftar". Itu jujur, dan tetap tidak membocorkan.
 */
export const JAWABAN_MINTA_KODE =
  "Kalau nomor atau surel itu terdaftar, kami kirimkan kode ke sana. Kodenya berlaku 15 menit.";
