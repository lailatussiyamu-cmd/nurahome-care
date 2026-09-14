#!/usr/bin/env node
/**
 * Menjalankan aplikasi di komputer sendiri, untuk dicoba dengan tangan.
 *
 *     npm run coba
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  DITULIS DALAM NODE, BUKAN BASH — SENGAJA.                            │
 * │                                                                       │
 * │  `skrip/jalankan-uji.sh` memakai bash, psql, dan curl. Itu baik-baik  │
 * │  saja di MacBook, dan gagal di Windows tanpa satu pun pesan yang bisa │
 * │  dimengerti orang yang bukan pemrogram. Berkas ini hanya memakai      │
 * │  Node dan pustaka `pg` yang sudah ikut di proyek, jadi perintahnya    │
 * │  sama persis di Windows maupun macOS.                                 │
 * │                                                                       │
 * │  Yang dikerjakannya, berurutan:                                       │
 * │    1. memeriksa Postgres benar-benar hidup;                           │
 * │    2. membuat basis data coba-coba kalau belum ada (TERPISAH dari     │
 * │       basis data sungguhan — apa pun yang Anda rusak di sini tidak    │
 * │       menyentuh data pasien);                                         │
 * │    3. menjalankan migrasi;                                            │
 * │    4. menyalakan server dan mencetak akun yang bisa dipakai masuk.    │
 * │                                                                       │
 * │  Setiap kegagalan dijawab dengan APA YANG HARUS DILAKUKAN, bukan      │
 * │  dengan jejak galat. Orang yang menjalankan ini sedang ingin mencoba  │
 * │  aplikasinya, bukan sedang memperbaiki Node.                          │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { spawn } from "node:child_process";
import pg from "pg";

const PORT = process.env.COBA_PORT ?? "3000";
const NAMA_DB = process.env.COBA_DB ?? "nurahome_coba";
const SANDI_CONTOH = "nurahome123";

/**
 * Alamat Postgres tanpa nama basis data — dipakai untuk MEMBUAT basis
 * datanya. Bawaannya pemasangan Postgres yang paling lazim di Windows dan
 * macOS; kalau punya Anda berbeda, isi COBA_PG.
 */
const INDUK =
  process.env.COBA_PG ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

const garis = "─".repeat(64);

function pesan(judul, baris) {
  console.log(`\n${garis}\n${judul}\n${garis}`);
  for (const b of baris) console.log(b);
  console.log("");
}

function gagal(judul, baris) {
  pesan(`✖ ${judul}`, baris);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* 1. Postgres hidup?                                                  */
/* ------------------------------------------------------------------ */

const induk = new pg.Client({ connectionString: INDUK });
try {
  await induk.connect();
} catch (e) {
  const sebab = e instanceof Error ? e.message : String(e);
  gagal("Postgres belum bisa dihubungi", [
    `  Alasannya: ${sebab}`,
    "",
    "  Yang biasanya perlu dilakukan:",
    "",
    "  • Belum dipasang? Unduh dari https://www.postgresql.org/download/",
    "    Saat memasang, ia akan meminta kata sandi untuk pengguna 'postgres'.",
    "    Catat kata sandi itu — Anda perlukan di langkah berikutnya.",
    "",
    "  • Sudah dipasang tapi kata sandinya bukan 'postgres'?",
    "    Jalankan dengan alamat Anda sendiri, contoh:",
    "",
    '      COBA_PG="postgresql://postgres:SANDI_ANDA@127.0.0.1:5432/postgres" npm run coba',
    "",
    "    (di Windows PowerShell:  $env:COBA_PG=\"...\" ; npm run coba )",
    "",
    "  • Sudah dipasang tapi belum jalan? Di macOS biasanya lewat Postgres.app;",
    "    di Windows lewat Services → postgresql → Start.",
  ]);
}

/* ------------------------------------------------------------------ */
/* 2. Basis data coba-coba                                             */
/* ------------------------------------------------------------------ */

const { rows } = await induk.query("select 1 from pg_database where datname = $1", [
  NAMA_DB,
]);

if (rows.length === 0) {
  /**
   * Nama basis datanya tidak bisa dipakai sebagai parameter di CREATE
   * DATABASE, jadi dijahit ke dalam perintah. Karena itu ia diperiksa
   * dulu: hanya huruf, angka, dan garis bawah.
   */
  if (!/^[a-z_][a-z0-9_]*$/i.test(NAMA_DB))
    gagal("Nama basis data tidak boleh begitu", [
      `  "${NAMA_DB}" mengandung tanda yang tidak diizinkan.`,
      "  Pakai huruf, angka, dan garis bawah saja.",
    ]);

  await induk.query(`CREATE DATABASE ${NAMA_DB}`);
  console.log(`▸ Basis data coba-coba "${NAMA_DB}" dibuat.`);
} else {
  console.log(`▸ Basis data coba-coba "${NAMA_DB}" sudah ada, dipakai lagi.`);
}
await induk.end();

const URL_DB = INDUK.replace(/\/[^/]*$/, `/${NAMA_DB}`);

/* ------------------------------------------------------------------ */
/* 3. Migrasi                                                          */
/* ------------------------------------------------------------------ */

const lingkungan = {
  ...process.env,
  DATABASE_URL: URL_DB,
  /**
   * Kata sandi akun contoh. Di komputer sendiri ini memang sengaja mudah;
   * yang menjaga agar ia TIDAK ikut ke server sungguhan adalah seed.ts,
   * yang menolak membuat sandi contoh ketika NODE_ENV=production.
   */
  SEED_PASSWORD: process.env.SEED_PASSWORD ?? SANDI_CONTOH,
  /** Garam untuk sidik IP — di komputer sendiri isinya tidak penting. */
  IP_HASH_SALT: process.env.IP_HASH_SALT ?? "garam-coba-coba-di-komputer-sendiri",
  CRON_SECRET: process.env.CRON_SECRET ?? "rahasia-coba-coba-yang-cukup-panjang",
};

console.log("▸ Menjalankan migrasi…");
const migrasi = spawn(process.execPath, ["skrip/migrasi.mjs"], {
  env: lingkungan,
  stdio: "inherit",
});
const kodeMigrasi = await new Promise((r) => migrasi.on("close", r));
if (kodeMigrasi !== 0)
  gagal("Migrasi gagal", [
    "  Skema basis datanya belum siap, jadi aplikasinya tidak dinyalakan.",
    "  Pesan galatnya ada di atas baris ini.",
  ]);

/* ------------------------------------------------------------------ */
/* 4. Nyalakan                                                         */
/* ------------------------------------------------------------------ */

const adaMidtrans = Boolean(process.env.MIDTRANS_SERVER_KEY);
const adaAi = Boolean(process.env.AI_API_KEY);

pesan("Aplikasi sedang dinyalakan", [
  `  Buka di peramban:   http://localhost:${PORT}`,
  "",
  "  Akun untuk mencoba — kata sandi semuanya: " + (lingkungan.SEED_PASSWORD ?? SANDI_CONTOH),
  "",
  "    Pasien     0812-3456-7890      (Budi Santoso)",
  "    Perawat    0813-8899-1122      (Ns. Ratna Dewi — luka, sudah terverifikasi)",
  "    Perawat    0815-7766-3344      (Ns. Hendra Wijaya — sunat)",
  "    Perawat    0856-2211-8080      (Ns. Dwi Lestari — BELUM terverifikasi)",
  "    Admin      admin@nurahomecare.id",
  "",
  "  Yang perlu Anda tahu selama mencoba:",
  "",
  adaMidtrans
    ? "    • Midtrans TERPASANG — pembayaran memakai kunci Midtrans Anda sendiri."
    : "    • Pembayaran memakai PENYEDIA TIRUAN di komputer ini. Tidak ada satu",
  adaMidtrans ? null : "      rupiah pun berpindah; pesanan otomatis jadi LUNAS ~3 detik setelah",
  adaMidtrans ? null : "      Anda menekan bayar, supaya alurnya bisa dicoba sampai selesai.",
  "",
  adaAi
    ? "    • Asisten tanya-jawab dibantu model AI yang Anda pasang."
    : "    • Asisten tanya-jawab jalan tanpa AI (pencocokan kata). Itu memang bisa.",
  "",
  `    • Basis data "${NAMA_DB}" TERPISAH dari data sungguhan. Apa pun yang`,
  "      Anda rusak di sini aman.",
  "",
  "  Hentikan dengan Ctrl-C.",
].filter((b) => b !== null));

/**
 * Penyedia pembayaran tiruan — hanya kalau kunci Midtrans sungguhan tidak
 * dipasang.
 *
 * Tanpa ini, orang yang mencoba aplikasinya di komputer sendiri mentok di
 * halaman bayar: perawat tidak pernah berangkat, laporan tidak pernah
 * ditutup, bagi hasil tidak pernah tercatat. Artinya justru bagian yang
 * paling perlu dicoba tidak pernah bisa dicoba.
 */
let tiruan = null;
if (!adaMidtrans) {
  lingkungan.MIDTRANS_SERVER_KEY = "SB-Mid-server-KUNCICOBA0123456789";
  lingkungan.MIDTRANS_CLIENT_KEY = "SB-Mid-client-KUNCICOBA0123456789";
  lingkungan.MIDTRANS_MODE = "SANDBOX";
  lingkungan.MIDTRANS_API_BASE = "http://127.0.0.1:3211";

  tiruan = spawn(process.execPath, ["skrip/uji/midtrans-tiruan.mjs"], {
    env: {
      ...lingkungan,
      TIRUAN_PORT: "3211",
      TIRUAN_AUTO_LUNAS: "1",
      TIRUAN_APLIKASI: `http://127.0.0.1:${PORT}`,
    },
    stdio: "inherit",
  });
}

const server = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev", "-p", PORT],
  { env: lingkungan, stdio: "inherit", shell: process.platform === "win32" }
);

const berhenti = () => {
  server.kill();
  tiruan?.kill();
  process.exit(0);
};
process.on("SIGINT", berhenti);
process.on("SIGTERM", berhenti);
server.on("close", (kode) => {
  tiruan?.kill();
  process.exit(kode ?? 0);
});
