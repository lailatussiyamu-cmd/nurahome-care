import type { Config } from "drizzle-kit";

/**
 * Menggantikan drizzle.config.json.
 *
 * Dua hal yang berubah, dua-duanya penting:
 *
 * 1. **Alamat basis data dibaca dari DATABASE_URL**, bukan ditulis di
 *    dalam berkas. Versi lama memuat `postgresql://postgres:postgres@
 *    127.0.0.1:5432/app_db` — kata sandi di dalam kode yang ikut
 *    ter-commit, dan alamat yang selalu salah di setiap pemasangan selain
 *    laptop yang membuatnya.
 *
 * 2. **Ada folder migrasi.** Sampai sekarang skema dipasang dengan
 *    `drizzle-kit push --force`: drizzle membandingkan skema di kode
 *    dengan basis data hidup lalu menyesuaikannya, tanpa bertanya. Untuk
 *    pengembangan itu memadai. Untuk basis data berisi rekam pasien itu
 *    berbahaya — satu kolom yang diganti namanya di kode terbaca sebagai
 *    "kolom lama dihapus, kolom baru dibuat", dan isinya ikut hilang tanpa
 *    satu pun pertanyaan.
 *
 *    Migrasi menyimpan LANGKAHNYA, bukan hasil perbandingan sesaat: bisa
 *    dibaca sebelum dijalankan, bisa ditinjau, dan sama persis di laptop
 *    maupun di server.
 */
export default {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  /**
   * Peringatan sebelum perintah yang menghapus data. Tidak menghentikan,
   * tapi setidaknya tidak diam-diam.
   */
  verbose: true,
  strict: true,
} satisfies Config;
