import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Sambungan basis data.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  SAMBUNGANNYA DIBUAT SAAT PERTAMA DIPAKAI, BUKAN SAAT BERKAS DIMUAT.  │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Versi sebelumnya membaca `DATABASE_URL` dan melempar galat di badan
 * modul — begitu berkas ini dimuat. Akibatnya `next build` GAGAL kalau
 * variabel itu belum ada:
 *
 *     Error: Failed to collect page data for /api/platform
 *
 * Pesan itu tidak menyebut basis data sama sekali, jadi sebabnya sulit
 * ditebak. Dan keadaannya lazim: banyak layanan hosting tidak memberikan
 * variabel basis data pada tahap build, hanya pada tahap jalan. Artinya
 * aplikasi ini gagal dipasang bukan karena kodenya salah, melainkan karena
 * ia menuntut sesuatu terlalu cepat.
 *
 * Sekarang: build berhasil tanpa basis data; yang menuntut `DATABASE_URL`
 * adalah kueri pertama, saat aplikasinya benar-benar berjalan — dan
 * galatnya menyebut apa yang kurang.
 */

const globalForDb = globalThis as typeof globalThis & {
  __nurahomePool?: Pool;
};

function ambilPool(): Pool {
  if (globalForDb.__nurahomePool) return globalForDb.__nurahomePool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL belum diisi. Pasang variabel lingkungannya sebelum aplikasi dijalankan — lihat .env.example."
    );
  }

  /**
   * Satu pool dipakai ulang lintas pemuatan ulang modul.
   *
   * Di pengembangan, tanpa ini setiap penyimpanan berkas membuat pool baru
   * dan sambungan lama menumpuk sampai Postgres menolak sambungan
   * berikutnya. Di produksi prosesnya panjang umur, dan membuat pool baru
   * per permintaan adalah cara tercepat menghabiskan batas sambungan.
   */
  globalForDb.__nurahomePool = new Pool({ connectionString: databaseUrl });
  return globalForDb.__nurahomePool;
}

/**
 * Dibungkus Proxy supaya pembuatan sambungannya tertunda sampai ada yang
 * benar-benar menyentuh isinya — termasuk saat Next memuat modul ini pada
 * tahap build hanya untuk mendaftar rutenya.
 */
export const pool = new Proxy({} as Pool, {
  get(_sasaran, sifat) {
    const nyata = ambilPool() as unknown as Record<string | symbol, unknown>;
    const nilai = nyata[sifat];
    return typeof nilai === "function" ? (nilai as (...a: unknown[]) => unknown).bind(nyata) : nilai;
  },
});

let dbNyata: ReturnType<typeof drizzle> | null = null;

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_sasaran, sifat) {
    if (!dbNyata) dbNyata = drizzle(ambilPool());
    const nyata = dbNyata as unknown as Record<string | symbol, unknown>;
    const nilai = nyata[sifat];
    return typeof nilai === "function" ? (nilai as (...a: unknown[]) => unknown).bind(nyata) : nilai;
  },
});
