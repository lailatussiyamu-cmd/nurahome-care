#!/usr/bin/env node
/**
 * Menjalankan migrasi skema.
 *
 * Dipakai di produksi maupun saat menyiapkan basis data uji. Yang penting:
 * ia menjalankan LANGKAH yang sudah tersimpan di folder `drizzle/`, bukan
 * membandingkan skema dengan basis data lalu menebak apa yang harus
 * diubah — yang terakhir itulah yang dilakukan `drizzle-kit push`, dan
 * itulah yang bisa menghapus kolom berisi rekam pasien tanpa bertanya.
 *
 * Jalankan:  npm run migrasi
 */

import { readdirSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("GAGAL: DATABASE_URL belum diisi.");
  process.exit(1);
}

let berkas = [];
try {
  berkas = readdirSync("drizzle").filter((f) => f.endsWith(".sql"));
} catch {
  console.error("GAGAL: folder drizzle/ tidak ada.");
  console.error("       Buat migrasinya dulu:  npm run migrasi:buat");
  process.exit(1);
}

if (!berkas.length) {
  console.error("GAGAL: belum ada satu pun berkas migrasi di drizzle/.");
  console.error("       Buat dengan:  npm run migrasi:buat");
  process.exit(1);
}

/**
 * Alamat basis datanya dicetak dengan kata sandi disamarkan.
 *
 * Bukan hiasan: kesalahan yang paling sering terjadi saat memulihkan atau
 * memasang adalah menjalankan migrasi ke basis data yang SALAH. Melihat
 * nama basis datanya sebelum baris berikutnya berjalan sudah cukup untuk
 * menangkap sebagian besar kejadian itu.
 */
console.log(`Migrasi → ${url.replace(/:\/\/[^@]*@/, "://•••@")}`);
console.log(`${berkas.length} berkas migrasi ditemukan.`);

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log("Selesai. Skema sudah sesuai.");
} catch (e) {
  console.error("GAGAL menjalankan migrasi:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
