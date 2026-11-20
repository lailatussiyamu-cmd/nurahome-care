/**
 * Tes yang MENGUBAH status verifikasi perawat yang dipakai bersama.
 *
 * Berkas di folder ini dijalankan SETELAH semua tes lain selesai, tidak
 * berbarengan (lihat skrip/jalankan-uji.sh). Mencabut izin Ns. Hendra atau
 * membuatnya mengajukan ulang berkas — walau sebentar — membuat tes di
 * berkas lain yang sedang berjalan bersamaan melihat Hendra "belum lolos",
 * lalu gagal tanpa ada yang rusak. Itu persis jenis tes berkedip yang dulu
 * membuat CI merah-hijau untuk kode yang sama (UJI.md, galat nomor 3).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AKUN,
  ditolak,
  diterima,
  kabar,
  kirimKabar,
  lihatPemesanan,
  masuk,
  tamu,
  tanggalNanti,
} from "../bantu.mjs";

/** Kunjungan yang dipegang Ns. Hendra (perawat2), sampai LUNAS. */
async function lunasDenganHendra(pasien, hendra) {
  const buat = diterima(
    await pasien.aksi({
      action: "CREATE_BOOKING",
      serviceId: 1,
      serviceName: "Perawatan luka",
      serviceCategory: "WOUND_CARE",
      addressText: "Jl. Bunga Coklat No. 18, Lowokwaru, Kota Malang",
      scheduledDate: tanggalNanti(12),
      scheduledTimeSlot: "09:00 - 10:00",
      woundAssessment: { woundLocation: "Betis kanan" },
    }),
    "membuat permintaan"
  );
  const id = buat.booking.id;
  diterima(await hendra.aksi({ action: "MULAI_TINJAUAN", bookingId: id }), "Hendra mengambil");
  diterima(
    await hendra.aksi({
      action: "KIRIM_PENAWARAN",
      bookingId: id,
      temuan: "Luka bersih, perlu ganti balut.",
      item: [{ kind: "JASA", label: "Jasa ganti balut", qty: 1, unitPriceIdr: 460000, fromCatalog: true }],
      scheduledDate: tanggalNanti(12),
      scheduledTimeSlot: "09:00 - 10:00",
    }),
    "Hendra menawar"
  );
  diterima(
    await pasien.aksi({ action: "PUTUSKAN_PENAWARAN", bookingId: id, setuju: true, namaTandaTangan: "Budi Santoso", hubungan: "Diri sendiri" }),
    "pasien setuju"
  );
  diterima(await pasien.kirim("/api/pembayaran", { bookingId: id }), "membuka pembayaran");
  diterima(await kirimKabar(kabar(`${buat.booking.bookingCode}-1`)), "lunas");

  return { id, kode: buat.booking.bookingCode };
}

describe("Perawat yang izinnya dicabut", () => {
  test("tidak bisa berangkat ke kunjungan yang sudah ia pegang", async () => {
    const pasien = await masuk(AKUN.pasien);
    const hendra = await masuk(AKUN.perawat2);
    const admin = await masuk(AKUN.admin);

    const { id } = await lunasDenganHendra(pasien, hendra);

    const r = await admin.ambil("/api/platform");
    const idHendra = (r.isi.providers ?? []).find((p) => /Hendra/.test(p.fullName))?.id;
    assert.ok(idHendra, "data Hendra ditemukan");

    // Izinnya dicabut sementara (bukan dibekukan, supaya sesinya — yang
    // dipakai tes lain secara bersamaan — tidak ikut dicabut).
    diterima(
      await admin.aksi({ action: "PUTUS_VERIFIKASI", providerId: idHendra, keputusan: "PERLU_PERBAIKAN", alasan: "SIP perlu diunggah ulang, berkasnya buram." }),
      "admin mencabut sementara"
    );
    try {
      const berangkat = await hendra.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status: "PERAWAT_BERANGKAT" });
      ditolak(berangkat, 403, "perawat yang izinnya tidak berlaku berangkat ke rumah pasien");
      const b = await lihatPemesanan(pasien, id);
      assert.equal(b.status, "DIBAYAR", "status tidak boleh bergeser");
    } finally {
      diterima(
        await admin.aksi({ action: "PUTUS_VERIFIKASI", providerId: idHendra, keputusan: "TERVERIFIKASI", diperiksaDi: "Portal KTKI (uji)", fotoCocok: true }),
        "memulihkan Hendra"
      );
    }
  });
});

describe("Di depan pintu — foto perawat", () => {
  test("foto wajah tampil hanya setelah dicocokkan admin, dan hanya untuk pasien yang dikunjunginya", async () => {
    const pasien = await masuk(AKUN.pasien);
    const hendra = await masuk(AKUN.perawat2);
    const ratna = await masuk(AKUN.perawat);
    const admin = await masuk(AKUN.admin);
    const idHendra = (await admin.ambil("/api/platform")).isi.providers.find((p) => /Hendra/.test(p.fullName)).id;

    const aju = (berkas) =>
      hendra.aksi({
        action: "AJUKAN_VERIFIKASI",
        strNumber: "1204589234155",
        sipNumber: "503/SIPP/0311/35.73.302/2026",
        sipBerlakuSampai: tanggalNanti(400),
        sipDiterbitkanOleh: "Dinas Kesehatan Kota Malang",
        berkas,
      });
    const luluskan = (fotoCocok) =>
      admin.aksi({ action: "PUTUS_VERIFIKASI", providerId: idHendra, keputusan: "TERVERIFIKASI", diperiksaDi: "Portal KTKI (uji)", fotoCocok });

    ditolak(
      await aju([{ jenis: "FOTO", fileUrl: "data:application/pdf;base64,JVBERi0xLjQK" }]),
      400,
      "foto wajah berupa PDF"
    );

    try {
      diterima(
        await aju(["STR", "SIP", "KTP"].map((jenis) => ({ jenis, fileUrl: FOTO })).concat({ jenis: "FOTO", fileUrl: FOTO })),
        "mengajukan dengan foto wajah"
      );
      ditolak(await luluskan(false), 400, "meluluskan tanpa menyatakan wajah sudah dicocokkan dengan KTP");
      diterima(await luluskan(true), "meluluskan setelah dicocokkan");

      // Pasien yang punya kunjungan LUNAS dengan Hendra boleh melihat wajahnya.
      await lunasDenganHendra(pasien, hendra);
      const lihat = await pasien.minta(`/api/foto-perawat?id=${idHendra}`);
      assert.equal(lihat.status, 200, `pasien yang dikunjungi melihat foto, dapat ${lihat.status}`);
      assert.match(String(lihat.kepala.get("content-type")), /^image\//);
      assert.match(String(lihat.kepala.get("cache-control")), /no-store/);

      ditolak(await ratna.minta(`/api/foto-perawat?id=${idHendra}`), 403, "perawat lain melihat foto Hendra");
      ditolak(await tamu().minta(`/api/foto-perawat?id=${idHendra}`), 401, "tamu melihat foto perawat");

      // Kartu perawat untuk umum tidak membawa fotonya.
      const kartu = (await pasien.ambil("/api/platform")).isi.providers.find((p) => p.id === idHendra);
      assert.equal(kartu.adaFoto, true);
      assert.equal(kartu.avatarUrl, undefined, "foto tidak ikut di data umum");

      // Memperpanjang SIP saja: berkas lain yang masih berlaku ikut dihitung.
      diterima(await aju([{ jenis: "SIP", fileUrl: FOTO }]), "memperpanjang SIP tanpa mengunggah ulang semuanya");
    } finally {
      diterima(await luluskan(true), "memulihkan Hendra");
    }
  });
});

/** JPEG 1×1 piksel. */
const FOTO =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";
