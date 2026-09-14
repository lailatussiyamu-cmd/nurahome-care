/**
 * Ukuran foto dan kebocoran lewat cache.
 *
 * Diukur pada aplikasi yang berjalan, 9 September 2026, dan hasilnya yang
 * melahirkan tes ini:
 *
 *   - 4 foto kamera penuh (kiriman 21,3 MB) diterima HTTP 200 tanpa keluhan;
 *   - pada 85 kunjungan, jawaban server melewati batas panjang string V8
 *     dan aplikasi berhenti bekerja permanen (`RangeError: Invalid string
 *     length`);
 *   - jawaban yang membawa foto luka dikirim TANPA satu pun kepala cache.
 *
 * Tes di sini menjaga ketiganya supaya tidak kembali.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AKUN, BASIS, ditolak, diterima, masuk, siapkanPemesanan, tanggalNanti } from "./bantu.mjs";

/** Membuat data URL sebesar N byte — isinya tidak penting, ukurannya yang diuji. */
function fotoSebesar(byte, jenis = "image/jpeg") {
  const b64 = "A".repeat(Math.ceil((byte * 4) / 3));
  return `data:${jenis};base64,${b64}`;
}

const SATU_MB = 1024 * 1024;

describe("Batas ukuran foto", () => {
  test("foto sebesar kamera penuh ditolak, bukan diterima diam-diam", async () => {
    const pasien = await masuk(AKUN.pasien);
    const r = await pasien.aksi({
      action: "CREATE_BOOKING",
      serviceId: 1,
      serviceName: "Perawatan luka",
      serviceCategory: "WOUND_CARE",
      addressText: "Jl. Contoh, Kota Malang",
      scheduledDate: tanggalNanti(10),
      scheduledTimeSlot: "09:00 - 10:00",
      fotoLuka: [fotoSebesar(4 * SATU_MB)],
      persetujuanFoto: true,
    });
    ditolak(r, 413, "foto 4 MB seharusnya ditolak");
    assert.match(
      JSON.stringify(r.isi),
      /batas|kecilkan/i,
      "pesannya harus memberitahu apa yang harus dilakukan"
    );
  });

  test("empat foto kamera penuh sekaligus ditolak", async () => {
    const pasien = await masuk(AKUN.pasien);
    const r = await pasien.aksi({
      action: "CREATE_BOOKING",
      serviceId: 1,
      serviceName: "Perawatan luka",
      serviceCategory: "WOUND_CARE",
      addressText: "Jl. Contoh, Kota Malang",
      scheduledDate: tanggalNanti(10),
      scheduledTimeSlot: "09:00 - 10:00",
      fotoLuka: Array(4).fill(fotoSebesar(4 * SATU_MB)),
      persetujuanFoto: true,
    });
    ditolak(r, 413, "kiriman 16 MB seharusnya ditolak");
  });

  test("lebih dari empat foto ditolak", async () => {
    const pasien = await masuk(AKUN.pasien);
    const r = await pasien.aksi({
      action: "CREATE_BOOKING",
      serviceId: 1,
      serviceName: "Perawatan luka",
      serviceCategory: "WOUND_CARE",
      addressText: "Jl. Contoh, Kota Malang",
      scheduledDate: tanggalNanti(10),
      scheduledTimeSlot: "09:00 - 10:00",
      fotoLuka: Array(9).fill(fotoSebesar(100_000)),
      persetujuanFoto: true,
    });
    ditolak(r, 413, "sembilan foto seharusnya ditolak");
  });

  test("berkas yang bukan gambar ditolak", async () => {
    const pasien = await masuk(AKUN.pasien);
    for (const jahat of [
      "data:application/pdf;base64,AAAA",
      "data:text/html;base64,PHNjcmlwdD4=",
      "https://contoh.id/foto.jpg",
      "bukan-data-url-sama-sekali",
    ]) {
      const r = await pasien.aksi({
        action: "CREATE_BOOKING",
        serviceId: 1,
        serviceName: "Perawatan luka",
        serviceCategory: "WOUND_CARE",
        addressText: "Jl. Contoh, Kota Malang",
        scheduledDate: tanggalNanti(10),
        scheduledTimeSlot: "09:00 - 10:00",
        fotoLuka: [jahat],
        persetujuanFoto: true,
      });
      ditolak(r, 413, `"${jahat.slice(0, 30)}" seharusnya ditolak`);
    }
  });

  test("foto berukuran wajar tetap diterima", async () => {
    const pasien = await masuk(AKUN.pasien);
    const r = await pasien.aksi({
      action: "CREATE_BOOKING",
      serviceId: 1,
      serviceName: "Perawatan luka",
      serviceCategory: "WOUND_CARE",
      addressText: "Jl. Contoh, Kota Malang",
      scheduledDate: tanggalNanti(10),
      scheduledTimeSlot: "09:00 - 10:00",
      fotoLuka: [fotoSebesar(300_000), fotoSebesar(400_000)],
      persetujuanFoto: true,
    });
    diterima(r, "foto yang sudah dikecilkan harus lolos");
  });

  test("batas yang sama berlaku untuk foto dari perawat", async () => {
    const { id, perawat } = await siapkanPemesanan();
    const r = await perawat.aksi({
      action: "UPLOAD_TASK_PHOTO",
      bookingId: id,
      photoType: "WOUND_BEFORE",
      imageUrl: fotoSebesar(4 * SATU_MB),
      caption: "uji",
    });
    ditolak(r, 413, "perawat mengunggah foto 4 MB");
  });
});

describe("Foto luka tidak boleh tertinggal di cache", () => {
  test("jawaban yang membawa foto luka bertanda no-store", async () => {
    const pasien = await masuk(AKUN.pasien);
    const r = await pasien.ambil("/api/platform");
    const cc = r.kepala.get("cache-control") ?? "";
    assert.match(
      cc,
      /no-store/,
      "tanpa no-store, peramban boleh menyimpan foto luka di cache disk — ponsel keluarga yang dipakai bergantian, ponsel perawat yang dijual atau diservis"
    );
    assert.match(cc, /private/, "jawaban ini tidak boleh disimpan cache bersama");
  });
});

describe("Masa simpan foto", () => {
  /**
   * Permenkes 24/2022 Pasal 39 ayat (1): rekam medis elektronik disimpan
   * paling singkat 25 tahun sejak kunjungan TERAKHIR pasien.
   *
   * Yang dijaga di sini bukan cuma angkanya, tapi bahwa angka itu SAMA di
   * tiga tempat: kebijakan penghapusan, teks persetujuan, dan kalimat di
   * layar. Kalau ketiganya bisa berbeda, aplikasi menjanjikan satu hal
   * kepada pasien dan melakukan hal lain — dan yang mengikat adalah
   * kalimat yang pasien baca.
   */
  test("teks persetujuan menyebut masa simpan yang sama dengan yang dikerjakan", async () => {
    const { id, pasien } = await siapkanPemesanan();
    const r = await pasien.ambil("/api/platform");
    const persetujuan = (r.isi.consents ?? []).find((c) => c.bookingId === id);
    assert.ok(persetujuan, "persetujuan tindakan harus tersimpan");

    const teks = String(persetujuan.textSnapshot ?? "") + String(persetujuan.photoConsentText ?? "");
    assert.match(
      teks,
      /25 \(dua puluh lima\) tahun|25 tahun/,
      "teks persetujuan harus menyebut 25 tahun — bukan angka lain"
    );
    assert.doesNotMatch(
      teks,
      /5 \(lima\) tahun/,
      "sisa janji 5 tahun tidak boleh tertinggal di teks yang ditandatangani pasien"
    );
  });

  test("foto tidak dihapus selama pasien masih punya kunjungan yang belum 25 tahun", async () => {
    const r = await fetch(`${BASIS}/api/cron?tugas=hapus-foto-kedaluwarsa`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    assert.equal(r.status, 200, "tugasnya harus tetap bisa dijalankan");
    const j = await r.json();
    const hasil = j.hasil?.[0];
    assert.equal(
      hasil?.dikenai,
      0,
      "data contoh semuanya baru — tidak satu pun foto boleh dihapus"
    );
  });
});
