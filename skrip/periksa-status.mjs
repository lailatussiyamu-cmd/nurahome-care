#!/usr/bin/env node
/**
 * Penjaga agar nilai status berbahasa Inggris tidak hidup lagi.
 *
 * Aplikasi ini pernah memakai status berbahasa Inggris — COMPLETED,
 * CANCELLED, VERIFIED, PENDING, PAID — lalu semuanya diganti ke bahasa
 * Indonesia karena nilai-nilai ini muncul di jejak audit dan laporan yang
 * dibaca orang, bukan hanya di kode.
 *
 * Yang tidak ikut diganti adalah perbandingannya di layar. Akibatnya tidak
 * pernah berupa galat, dan itulah yang membuatnya bertahan berbulan-bulan:
 *
 *   - `b.status === "COMPLETED"` di portal perawat tidak pernah cocok, jadi
 *     kartu honornya selalu berbunyi "Belum ada kunjungan yang selesai" —
 *     berapa pun kunjungan yang sudah dikerjakan;
 *   - `verifiedStatus === "VERIFIED"` tidak pernah cocok, jadi perawat yang
 *     sudah diverifikasi melihat lencana kuning "Menunggu verifikasi" tepat
 *     di sebelah panel yang berbunyi "Anda boleh menerima kunjungan";
 *   - `["COMPLETED", "CANCELLED"]` di portal pasien tidak membuang apa pun,
 *     jadi kartu "kunjungan berjalan" bisa menunjuk kunjungan minggu lalu.
 *
 * Tidak satu pun berbunyi. Semuanya hanya salah, diam-diam. Skrip ini gagal
 * kalau salah satunya kembali.
 *
 * Jalankan:  node skrip/periksa-status.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const AKAR = "src";

/**
 * Nilai yang sudah tidak dipakai lagi, beserta penggantinya — supaya pesan
 * gagalnya langsung memberi tahu apa yang harus ditulis.
 */
const GANTI = {
  COMPLETED: 'S.SELESAI ("SELESAI")',
  CANCELLED: 'S.DIBATALKAN ("DIBATALKAN")',
  CONFIRMED: 'S.DISETUJUI ("DISETUJUI")',
  IN_PROGRESS: 'S.DIKERJAKAN ("DIKERJAKAN")',
  PROVIDER_ON_THE_WAY: 'S.PERAWAT_BERANGKAT ("PERAWAT_BERANGKAT")',
  VERIFIED: '"TERVERIFIKASI"',
  SUSPENDED: '"DIBEKUKAN"',
  REJECTED: '"PERLU_PERBAIKAN"',
  EXPIRED: '"KEDALUWARSA"',
  PAID: '"LUNAS" (atau "BELUM")',
};

/**
 * Berkas yang boleh menyebutnya.
 *
 * seed.ts memuat data contoh lama, dan komentar mana pun boleh
 * menyebutkannya — justru penjelasan kenapa nilai itu ditinggalkan yang
 * paling berguna disimpan.
 */
const DIKECUALIKAN = new Set(["src/db/seed.ts"]);

function berkas(dir) {
  const keluar = [];
  for (const nama of readdirSync(dir)) {
    const jalur = join(dir, nama);
    if (statSync(jalur).isDirectory()) keluar.push(...berkas(jalur));
    else if (/\.(ts|tsx)$/.test(nama)) keluar.push(jalur);
  }
  return keluar;
}

/**
 * Komentar dibuang sebelum diperiksa.
 *
 * Kalau tidak, penjelasan tentang kenapa nilai lama ditinggalkan justru
 * yang membuat pemeriksaan ini gagal — dan orang akan menghapus
 * penjelasannya, bukan memperbaiki kodenya.
 */
function tanpaKomentar(isi) {
  return isi.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const temuan = [];
for (const jalur of berkas(AKAR)) {
  if (DIKECUALIKAN.has(jalur.replace(/\\/g, "/"))) continue;
  const baris = tanpaKomentar(readFileSync(jalur, "utf8")).split("\n");
  baris.forEach((isi, i) => {
    for (const [lama, baru] of Object.entries(GANTI)) {
      /** Hanya yang ditulis sebagai teks — nama variabel tidak diganggu. */
      if (new RegExp(`["']${lama}["']`).test(isi))
        temuan.push({ jalur, nomor: i + 1, isi: isi.trim(), lama, baru });
    }
  });
}

if (temuan.length) {
  console.error("\n✖ Nilai status berbahasa Inggris ditemukan.\n");
  console.error(
    "  Nilai-nilai ini tidak pernah cocok dengan yang tersimpan di basis data,"
  );
  console.error(
    "  dan salahnya tidak berbunyi: tidak ada galat, hanya layar yang keliru.\n"
  );
  for (const t of temuan) {
    console.error(`  ${t.jalur}:${t.nomor}`);
    console.error(`    ${t.isi}`);
    console.error(`    "${t.lama}" sudah tidak dipakai — pakai ${t.baru}\n`);
  }
  process.exit(1);
}

console.log("✓ Tidak ada nilai status berbahasa Inggris yang tertinggal.");
