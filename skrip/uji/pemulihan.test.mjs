/**
 * Lupa kata sandi.
 *
 * Jalur ini adalah pintu belakang ke setiap akun, termasuk admin. Kalau
 * lemah, ia membatalkan seluruh penjagaan kata sandi yang sudah dibangun —
 * scrypt, penguncian bertingkat, batas per-IP — karena penyerang tidak akan
 * menebak sandi kalau ada jalan yang lebih mudah.
 *
 * Yang dijaga di sini terutama satu hal: KODENYA TIDAK PERNAH IKUT DI
 * JAWABAN HTTP. Kalau ikut, siapa pun yang tahu nomor telepon seseorang
 * bisa mengambil alih akunnya dalam dua permintaan.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { AKUN, ditolak, diterima, masuk, tamu } from "./bantu.mjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

/**
 * Mengambil kode dari kotak keluar — yang hanya bisa dilakukan dengan
 * membaca basis data langsung, PERSIS seperti yang diinginkan: lewat HTTP
 * kodenya tidak bisa didapat siapa pun.
 */
async function kodeTerakhir(nomorTelepon) {
  /**
   * Nomor tujuan disimpan dalam bentuk yang enak dibaca orang —
   * `0812-3456-7890`, pakai tanda hubung. Mencocokkan angkanya secara
   * berurutan tidak akan pernah kena. Ini yang membuat tiga tes di berkas
   * ini gagal: bukan aplikasinya yang rusak, melainkan tesnya yang salah
   * mencari. Jadi tanda hubungnya dibuang di KEDUA sisi, dan tes ini tidak
   * lagi ikut gagal kalau tampilan nomornya suatu saat berubah.
   */
  const { rows } = await pool.query(
    `select isi from outbox
     where jenis='KODE_PEMULIHAN'
       and regexp_replace(tujuan, '\\D', '', 'g') like $1
     order by id desc limit 1`,
    [`%${nomorTelepon.replace(/\D/g, "").slice(-8)}%`]
  );
  const isi = rows[0]?.isi ?? "";
  const m = /(\d{6})/.exec(isi);
  return m ? m[1] : null;
}

/**
 * Akun pasien baru dengan nomor acak.
 *
 * Setiap tes yang perlu meminta kode memakai akunnya SENDIRI. Sebabnya
 * ketahuan saat menulis berkas ini: batas 3 permintaan per jam per akun
 * berlaku lintas tes juga, jadi tes keempat yang memakai akun yang sama
 * gagal — bukan karena aplikasinya rusak, justru karena penjagaannya
 * bekerja. Tes yang saling menghabiskan jatah satu sama lain akan
 * berkedip, dan tes berkedip cepat berhenti dipercaya.
 */
async function akunBaru() {
  const nomor = `08${Math.floor(1000000000 + Math.random() * 8999999999)}`.slice(0, 12);
  const p = tamu();
  const r = await p.kirim("/api/auth", {
    aksi: "DAFTAR",
    nama: "Pasien Uji Pemulihan",
    telepon: nomor,
    sandi: "kataSandiPanjang9",
  });
  diterima(r, `mendaftar akun uji ${nomor}`);
  return { nomor, sandiAwal: "kataSandiPanjang9" };
}

describe("Minta kode", () => {
  test("jawabannya SAMA untuk nomor terdaftar dan tidak terdaftar", async () => {
    const a = await tamu().kirim("/api/auth", { aksi: "MINTA_KODE", pengenal: AKUN.pasien });
    const b = await tamu().kirim("/api/auth", {
      aksi: "MINTA_KODE",
      pengenal: "0899-0000-0002",
    });
    assert.equal(a.status, b.status, "status harus sama");
    assert.deepEqual(
      a.isi,
      b.isi,
      "jawabannya harus sama persis — kalau berbeda, halaman lupa sandi jadi alat memeriksa siapa pelanggan di sini"
    );
  });

  test("kode TIDAK PERNAH ikut di jawaban HTTP", async () => {
    const r = await tamu().kirim("/api/auth", { aksi: "MINTA_KODE", pengenal: AKUN.pasien });
    const teks = JSON.stringify(r.isi);
    assert.doesNotMatch(
      teks,
      /\d{6}/,
      "ada angka 6 digit di jawaban — kode tidak boleh bocor lewat HTTP"
    );
    assert.doesNotMatch(teks, /kode.*[:=]\s*["']?\d/i, "kode tidak boleh ikut dalam bentuk apa pun");
  });

  test("kode benar-benar dibuat dan masuk kotak keluar", async () => {
    /**
     * Akun sendiri, bukan AKUN.pasien. Dua tes di atas sudah memakai dua
     * dari tiga jatah permintaan per jam milik akun itu, dan berkas uji
     * lain berjalan berbarengan — jatahnya bisa habis sebelum tes ini
     * sempat meminta. Yang gagal kemudian bukan aplikasinya.
     */
    const { nomor } = await akunBaru();
    await tamu().kirim("/api/auth", { aksi: "MINTA_KODE", pengenal: nomor });
    const kode = await kodeTerakhir(nomor);
    assert.ok(kode, "kode harus tercatat di kotak keluar untuk dikirim");
    assert.equal(kode.length, 6);
  });
});

describe("Pakai kode", () => {
  test("kode salah ditolak, dan sandinya tidak berubah", async () => {
    const { nomor, sandiAwal } = await akunBaru();
    await tamu().kirim("/api/auth", { aksi: "MINTA_KODE", pengenal: nomor });
    const r = await tamu().kirim("/api/auth", {
      aksi: "PULIHKAN_SANDI",
      pengenal: nomor,
      kode: "000000",
      sandiBaru: "sandiBaruYangPanjang9",
    });
    ditolak(r, 400, "kode salah");

    const cek = await tamu().kirim("/api/auth", { aksi: "MASUK", pengenal: nomor, sandi: sandiAwal });
    diterima(cek, "sandi lama harus masih berlaku setelah kode salah");
  });

  /**
   * Enam angka hanya 1 juta kemungkinan. Tanpa batas percobaan, mesin
   * menghabiskannya dalam hitungan menit.
   */
  test("kode hangus setelah beberapa kali salah", async () => {
    const { nomor } = await akunBaru();
    await tamu().kirim("/api/auth", { aksi: "MINTA_KODE", pengenal: nomor });
    const kode = await kodeTerakhir(nomor);
    assert.ok(kode, "kode harus ada");

    for (let i = 0; i < 5; i++) {
      await tamu().kirim("/api/auth", {
        aksi: "PULIHKAN_SANDI",
        pengenal: nomor,
        kode: "111111",
        sandiBaru: "sandiBaruYangPanjang9",
      });
    }

    const r = await tamu().kirim("/api/auth", {
      aksi: "PULIHKAN_SANDI",
      pengenal: nomor,
      kode,
      sandiBaru: "sandiBaruYangPanjang9",
    });
    ditolak(r, 400, "kode yang BENAR setelah 5 kali salah harus ikut hangus");
  });

  test("kode yang benar mengganti sandi, dan hanya bisa dipakai sekali", async () => {
    const { nomor } = await akunBaru();
    await tamu().kirim("/api/auth", { aksi: "MINTA_KODE", pengenal: nomor });
    const kode = await kodeTerakhir(nomor);
    const sandiBaru = "lukaKering#2026";

    diterima(
      await tamu().kirim("/api/auth", { aksi: "PULIHKAN_SANDI", pengenal: nomor, kode, sandiBaru }),
      "memulihkan sandi dengan kode yang benar"
    );
    diterima(
      await tamu().kirim("/api/auth", { aksi: "MASUK", pengenal: nomor, sandi: sandiBaru }),
      "masuk dengan sandi baru"
    );

    /** Sekali pakai: kode yang sama tidak boleh dipakai lagi. */
    ditolak(
      await tamu().kirim("/api/auth", {
        aksi: "PULIHKAN_SANDI",
        pengenal: nomor,
        kode,
        sandiBaru: "sandiLainLagi123",
      }),
      400,
      "memakai kode yang sama dua kali"
    );
  });

  /**
   * Orang yang memakai jalur ini biasanya sedang curiga akunnya dimasuki.
   * Mengganti sandi tanpa mencabut sesi lama tidak menyelesaikan apa pun.
   */
  test("memulihkan sandi mencabut semua sesi yang sedang hidup", async () => {
    const { nomor, sandiAwal } = await akunBaru();
    const lama = await masuk(nomor, sandiAwal);
    assert.equal((await lama.ambil("/api/auth")).isi.masuk, true);

    await tamu().kirim("/api/auth", { aksi: "MINTA_KODE", pengenal: nomor });
    const kode = await kodeTerakhir(nomor);
    diterima(
      await tamu().kirim("/api/auth", {
        aksi: "PULIHKAN_SANDI",
        pengenal: nomor,
        kode,
        sandiBaru: "gantiLagi#2026x",
      }),
      "memulihkan sandi"
    );

    assert.equal(
      (await lama.ambil("/api/auth")).isi.masuk,
      false,
      "sesi lama harus dicabut setelah sandi dipulihkan — orang memakai jalur ini justru karena curiga akunnya dimasuki"
    );
  });

  test("sandi baru tetap tunduk pada aturan kekuatan sandi", async () => {
    const { nomor } = await akunBaru();
    await tamu().kirim("/api/auth", { aksi: "MINTA_KODE", pengenal: nomor });
    const kode = await kodeTerakhir(nomor);
    ditolak(
      await tamu().kirim("/api/auth", {
        aksi: "PULIHKAN_SANDI",
        pengenal: nomor,
        kode,
        sandiBaru: "12345678",
      }),
      400,
      "sandi baru yang terlalu umum"
    );
  });
});

describe("Batas permintaan kode", () => {
  test("permintaan berlebihan tidak menghasilkan kode tanpa batas", async () => {
    const { nomor } = await akunBaru();
    const { rows: sebelum } = await pool.query(
      `select count(*)::int n from password_resets where created_at > now() - interval '1 hour'`
    );
    for (let i = 0; i < 8; i++) {
      await tamu().kirim("/api/auth", { aksi: "MINTA_KODE", pengenal: nomor });
    }
    const { rows: sesudah } = await pool.query(
      `select count(*)::int n from password_resets where created_at > now() - interval '1 hour'`
    );
    const tambah = sesudah[0].n - sebelum[0].n;
    assert.ok(
      tambah <= 3,
      `delapan permintaan menghasilkan ${tambah} kode — batasnya 3 per jam, supaya ponsel orang tidak bisa dibanjiri`
    );
  });
});
