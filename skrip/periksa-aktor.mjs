#!/usr/bin/env node
/**
 * Penjaga agar lubang keamanan yang sudah ditutup tidak terbuka lagi.
 *
 * Lubang yang dimaksud: seluruh penjagaan di API dulu membaca peran pemakai
 * dari BADAN PERMINTAAN —
 *
 *     const { actorRole } = body;
 *     if (actorRole !== "ADMIN") return 403;
 *
 * Yang mengisi `actorRole` adalah browser. Satu baris di Developer Tools
 * cukup untuk menjadi admin dan membaca foto luka serta catatan klinis
 * seluruh pasien.
 *
 * Perbaikannya mudah dibatalkan tanpa sengaja: cukup satu aksi baru yang
 * ditulis dengan menyalin pola lama. Skrip ini gagal kalau itu terjadi.
 *
 * Jalankan:  node skrip/periksa-aktor.mjs
 * Sudah ikut dalam:  npm run periksa
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const AKAR = "src";

/** Nama yang tidak boleh lagi diambil dari `body`. */
const TERLARANG = [
  "actorRole",
  "actorUserId",
  "actorProviderId",
  "actorProviderName",
  "actorNama",
  "actorName",
];

/**
 * Berkas yang boleh menyebut nama-nama itu.
 *
 * route.ts memakainya sebagai nama variabel LOKAL yang diisi dari sesi
 * (`const actorRole = aktor.peran`), supaya perubahannya tidak perlu
 * menyentuh ratusan baris sekaligus. Yang dilarang adalah membacanya dari
 * `body` — dan itulah yang diperiksa terpisah di bawah.
 */
const DIKECUALIKAN = ["src/app/api/platform/route.ts", "src/server/aktor.ts"];

function semuaBerkas(dir) {
  const hasil = [];
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) hasil.push(...semuaBerkas(p));
    else if (/\.(ts|tsx)$/.test(nama)) hasil.push(p);
  }
  return hasil;
}

let gagal = 0;

for (const berkas of semuaBerkas(AKAR)) {
  const isi = readFileSync(berkas, "utf8");
  const baris = isi.split("\n");
  const dikecualikan = DIKECUALIKAN.includes(berkas.replace(/\\/g, "/"));

  baris.forEach((b, i) => {
    /**
     * Baris komentar dilewati.
     *
     * Berkas server/aktor.ts justru MENJELASKAN pola lama dengan
     * mengutipnya. Tanpa pengecualian ini, penjelasan itu sendiri yang
     * menggagalkan pemeriksaan — dan yang biasanya terjadi berikutnya
     * bukan skripnya diperbaiki, melainkan penjelasannya dihapus.
     */
    const t = b.trim();
    if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) return;

    // 1. Diambil dari badan permintaan — dilarang DI MANA PUN, termasuk
    //    di berkas yang dikecualikan.
    if (/=\s*body\b/.test(b) || /body\.\s*actor/i.test(b)) {
      for (const nama of TERLARANG) {
        if (b.includes(nama)) {
          console.error(
            `GAGAL ${berkas}:${i + 1}\n  "${nama}" dibaca dari badan permintaan.\n  ${b.trim()}\n` +
              `  Pakai aktorDariPermintaan() dari @/server/aktor.\n`
          );
          gagal++;
        }
      }
    }

    // 2. Dikirim dari layar — sia-sia dan menyesatkan: pembacanya akan
    //    mengira nilai itu menentukan sesuatu.
    if (!dikecualikan && /^\s*actor\w*\s*:/.test(b)) {
      console.error(
        `GAGAL ${berkas}:${i + 1}\n  Identitas dikirim dari layar; server sudah mengabaikannya.\n  ${b.trim()}\n`
      );
      gagal++;
    }
  });
}

/**
 * 3. Setiap penanganan aksi POST harus lewat aktorDariPermintaan().
 *
 * Diperiksa sekali untuk keseluruhan berkas: kalau pemanggilannya hilang,
 * seluruh penjagaan di bawahnya kembali membaca variabel yang tidak pernah
 * diisi — dan `undefined !== "ADMIN"` kebetulan bernilai benar, sehingga
 * penjagaannya tampak masih bekerja.
 */
const rute = readFileSync("src/app/api/platform/route.ts", "utf8");
for (const wajib of [
  "aktorDariPermintaan",
  "const belumMasuk = harusMasuk(aktor)",
  "const actorRole = aktor.peran",
]) {
  if (!rute.includes(wajib)) {
    console.error(`GAGAL src/app/api/platform/route.ts\n  Hilang: ${wajib}\n`);
    gagal++;
  }
}

if (gagal) {
  console.error(`\n${gagal} masalah. Lihat komentar di src/server/aktor.ts.`);
  process.exit(1);
}
console.log("Aktor: semua aksi mengambil identitas dari sesi. Bersih.");
