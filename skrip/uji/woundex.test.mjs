/**
 * Woundex — peringatan dini luka kaki diabetik.
 *
 * Yang dijaga berkas ini:
 *
 *   1. Keputusan dihitung server. Layar yang mengirim "tingkat: HIJAU"
 *      untuk luka yang jelas berbahaya tetap menghasilkan MERAH.
 *   2. Hanya perawat yang memegang kunjungannya, dan hanya saat ia sudah
 *      tiba di rumah pasien.
 *   3. Angka klinis wajib tidak punya nilai bawaan. Kosong ditolak; gula
 *      darah yang tidak diukur tersimpan sebagai null, bukan 0.
 *   4. MERAH langsung sampai ke admin.
 *   5. Pasien tidak menerima baris Woundex.
 *
 * Angka-angka di bawah sengaja ditulis mati. Tes yang menghitung ulang
 * dengan rumus yang sama seperti aplikasi akan tetap lulus ketika
 * rumusnya salah.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AKUN, diterima, ditolak, kabar, kirimKabar, masuk, siapkanPemesanan } from "./bantu.mjs";

/** Membawa satu pemesanan sampai perawat tiba di rumah pasien. */
async function perawatSudahTiba() {
  const { id, kode, pasien, perawat } = await siapkanPemesanan();
  await pasien.kirim("/api/pembayaran", { bookingId: id });
  diterima(await kirimKabar(kabar(`${kode}-1`)), "kabar pembayaran lunas");
  for (const status of ["PERAWAT_BERANGKAT", "PERAWAT_TIBA"])
    diterima(await perawat.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status }), `status ${status}`);
  return { id, kode, pasien, perawat };
}

/** Infeksi berat: 5 tanda lokal, suhu 38,6, nadi 104, napas 22. IWGDF derajat 4. */
const BERAT = {
  panjangCm: "2,8",
  lebarCm: "2,4",
  kedalaman: "TENDON",
  eritemaCm: "3.5",
  bengkak: true,
  hangat: true,
  nyeriTekan: true,
  nanah: true,
  nekrosisBaru: false,
  suhuC: "38.6",
  nadi: "104",
  napas: "22",
  gulaDarah: "342",
  nadiKakiTakTeraba: true,
  sensasiHilang: true,
  lokasi: "BELAKANG",
};

/** Luka tenang: tanpa tanda infeksi, tanda vital normal, gula tidak diukur. */
const TENANG = {
  panjangCm: "1.1",
  lebarCm: "0.8",
  kedalaman: "KULIT",
  eritemaCm: "0",
  suhuC: "36.6",
  nadi: "76",
  napas: "16",
  gulaDarah: "",
  lokasi: "TENGAH",
};

describe("Woundex", () => {
  test("pasien tidak bisa mengisi Woundex", async () => {
    const { id, pasien } = await perawatSudahTiba();
    ditolak(await pasien.aksi({ action: "SIMPAN_WOUNDEX", bookingId: id, sinyal: TENANG }), 403, "pasien mengisi Woundex");
  });

  test("perawat lain tidak bisa mengisi Woundex untuk kunjungan yang bukan miliknya", async () => {
    const { id } = await perawatSudahTiba();
    const lain = await masuk(AKUN.perawat2);
    ditolak(await lain.aksi({ action: "SIMPAN_WOUNDEX", bookingId: id, sinyal: TENANG }), 403, "perawat lain mengisi Woundex");
  });

  test("belum bisa diisi sebelum perawat tiba di rumah pasien", async () => {
    const { id, perawat } = await siapkanPemesanan();
    ditolak(await perawat.aksi({ action: "SIMPAN_WOUNDEX", bookingId: id, sinyal: TENANG }), 409, "Woundex sebelum tiba");
  });

  test("angka klinis wajib yang kosong ditolak, bukan diisi nilai bawaan", async () => {
    const { id, perawat } = await perawatSudahTiba();
    for (const kolom of ["panjangCm", "suhuC", "nadi", "napas", "eritemaCm", "kedalaman", "lokasi"]) {
      const r = await perawat.aksi({ action: "SIMPAN_WOUNDEX", bookingId: id, sinyal: { ...TENANG, [kolom]: "" } });
      ditolak(r, 400, `Woundex tanpa ${kolom}`);
    }
  });

  test("keputusan dihitung server: kiriman 'HIJAU' dari layar tidak berpengaruh", async () => {
    const { id, perawat } = await perawatSudahTiba();
    const isi = diterima(
      await perawat.aksi({
        action: "SIMPAN_WOUNDEX",
        bookingId: id,
        tingkat: "HIJAU",
        sinyal: { ...BERAT, tingkat: "HIJAU", derajatIwgdf: 1 },
      }),
      "menyimpan pengkajian berat"
    );
    assert.equal(isi.woundex.tingkat, "MERAH");
    assert.equal(isi.woundex.derajatIwgdf, 4);
    assert.equal(isi.woundex.sinbad, 6, "S I N B A D semuanya ada");
    assert.match(isi.hasil.tindakan.utama, /IGD/);
  });

  test("MERAH langsung masuk ke pemberitahuan admin", async () => {
    const { id, kode, perawat } = await perawatSudahTiba();
    diterima(await perawat.aksi({ action: "SIMPAN_WOUNDEX", bookingId: id, sinyal: BERAT }), "menyimpan pengkajian berat");
    const admin = await masuk(AKUN.admin);
    const r = await admin.ambil("/api/platform");
    assert.ok(
      (r.isi.notifications ?? []).some((n) => n.title.includes("WOUNDEX MERAH") && n.title.includes(kode)),
      "admin harus menerima pemberitahuan MERAH untuk kunjungan ini"
    );
    assert.ok((r.isi.woundexChecks ?? []).some((w) => w.bookingId === id), "admin melihat pengkajiannya");
  });

  test("luka tenang: HIJAU, dan gula darah yang tidak diukur tersimpan null", async () => {
    const { id, perawat } = await perawatSudahTiba();
    const isi = diterima(
      await perawat.aksi({ action: "SIMPAN_WOUNDEX", bookingId: id, sinyal: TENANG }),
      "menyimpan pengkajian tenang"
    );
    assert.equal(isi.woundex.tingkat, "HIJAU");
    assert.equal(isi.woundex.gulaDarah, null);
    assert.equal(isi.woundex.derajatIwgdf, 1);
  });

  test("pasien tidak menerima baris Woundex, perawatnya menerima", async () => {
    const { id, pasien, perawat } = await perawatSudahTiba();
    diterima(await perawat.aksi({ action: "SIMPAN_WOUNDEX", bookingId: id, sinyal: TENANG }), "menyimpan pengkajian");
    const lihatPasien = await pasien.ambil("/api/platform");
    assert.equal((lihatPasien.isi.woundexChecks ?? []).length, 0, "pasien tidak boleh menerima baris Woundex");
    const lihatPerawat = await perawat.ambil("/api/platform");
    assert.ok((lihatPerawat.isi.woundexChecks ?? []).some((w) => w.bookingId === id), "perawatnya menerima");
  });
});
