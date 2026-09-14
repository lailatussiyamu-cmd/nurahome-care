#!/usr/bin/env node
/**
 * Menolak `drizzle-kit push` kalau basis datanya terlihat seperti produksi.
 *
 * `push` membandingkan skema di kode dengan basis data hidup lalu
 * menyesuaikannya tanpa bertanya. Satu kolom yang diganti namanya di kode
 * terbaca sebagai "kolom lama dihapus, kolom baru dibuat" — dan isinya
 * ikut hilang. Di basis data berisi foto luka dan catatan klinis, itu
 * kehilangan yang tidak bisa dibatalkan.
 *
 * Untuk pengembangan `push` masih boleh; yang dijaga hanya supaya ia tidak
 * pernah tanpa sengaja menunjuk ke basis data sungguhan.
 */
const url = process.env.DATABASE_URL ?? "";

if (!url) {
  console.error("GAGAL: DATABASE_URL belum diisi.");
  process.exit(1);
}

const lokal = /@(localhost|127\.0\.0\.1|::1|host\.docker\.internal)[:/]/.test(url);
const namaUji = /\/(nurahome_uji|nurahome_latihan|app_db|test|dev)(\?|$)/.test(url);

if (process.env.NODE_ENV === "production" || (!lokal && !namaUji)) {
  console.error("DITOLAK: `drizzle-kit push` tidak boleh dijalankan ke basis data ini.");
  console.error(`         ${url.replace(/:\/\/[^@]*@/, "://•••@")}`);
  console.error("");
  console.error("         push menyesuaikan skema tanpa bertanya, dan bisa menghapus");
  console.error("         kolom beserta isinya. Untuk basis data sungguhan pakai:");
  console.error("           npm run migrasi:buat   (sekali, saat skema berubah)");
  console.error("           npm run migrasi        (di server)");
  console.error("");
  console.error("         Kalau Anda benar-benar yakin: IZINKAN_PUSH=1 npm run db:push");
  if (process.env.IZINKAN_PUSH !== "1") process.exit(1);
  console.error("         IZINKAN_PUSH=1 terpasang — dilanjutkan.");
}
