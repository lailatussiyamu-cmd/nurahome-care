/**
 * Celah alur yang ditemukan saat audit 20 November 2026.
 *
 * Setiap tes di sini GAGAL pada kode sebelum audit itu — dijalankan dulu
 * ke server yang sedang berjalan, baru diperbaiki. Kelompoknya:
 *
 *   1. Uang yang masuk ke pemesanan yang sudah batal, atau masuk dua kali,
 *      diterima diam-diam — pasien bahkan diberi tahu "perawat akan
 *      berangkat" untuk kunjungan yang sudah batal.
 *   2. Pemesanan yang sudah LUNAS bisa dibatalkan tanpa ada yang diberi
 *      tahu: admin tidak tahu harus mengembalikan uang, perawat tidak tahu
 *      kunjungannya batal.
 *   3. Perawat yang izinnya dicabut tetap bisa mengerjakan kunjungan yang
 *      sudah ia pegang — penjagaan verifikasi hanya ada saat mengambil.
 *   4. "Sudah tiba" bisa ditandai tanpa foto, dan foto bukti bisa
 *      ditambahkan sebelum berangkat atau setelah kunjungan ditutup.
 *   5. Tanda bahaya hanya dipercaya dari browser.
 *   6. Dua perawat yang mengambil permintaan yang sama pada saat
 *      bersamaan sama-sama berhasil.
 *   7. Perawat di rumah orang asing tidak punya cara meminta bantuan.
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
  siapkanPemesanan,
  tanggalNanti,
} from "./bantu.mjs";

/** Pemesanan DISETUJUI dengan tagihan Midtrans yang sudah dibuat. */
async function tertagih() {
  const p = await siapkanPemesanan();
  diterima(await p.pasien.kirim("/api/pembayaran", { bookingId: p.id }), "membuka pembayaran");
  return { ...p, orderId: `${p.kode}-1` };
}

/** Pemesanan yang sudah LUNAS lewat kabar bertanda tangan sah. */
async function lunas() {
  const p = await tertagih();
  diterima(await kirimKabar(kabar(p.orderId)), "kabar lunas");
  const b = await lihatPemesanan(p.pasien, p.id);
  assert.equal(b.status, "DIBAYAR", "pemesanan seharusnya sudah DIBAYAR");
  return p;
}

/** Pemberitahuan milik sesi ini sendiri yang menyebut kode pemesanannya. */
async function kabarUntukku(sesi, kode) {
  const r = await sesi.ambil("/api/platform");
  const saya = r.isi.sesi?.userId;
  return (r.isi.notifications ?? []).filter(
    (n) => n.userId === saya && `${n.title} ${n.message}`.includes(kode)
  );
}

/* ------------------------------------------------------------------ */

describe("Uang yang tidak boleh diterima diam-diam", () => {
  test("uang masuk setelah pemesanan dibatalkan: admin diminta mengembalikan, pasien tidak dijanjikan kunjungan", async () => {
    const { id, kode, pasien, orderId } = await tertagih();
    diterima(await pasien.aksi({ action: "CANCEL_BOOKING", bookingId: id, reason: "Tidak jadi" }), "pasien membatalkan");

    // Halaman bayar masih terbuka di ponselnya, dan ia tetap membayar.
    diterima(await kirimKabar(kabar(orderId)), "kabar lunas tetap diterima (uangnya memang masuk)");

    const b = await lihatPemesanan(pasien, id);
    assert.equal(b.status, "DIBATALKAN", "pemesanan yang sudah batal tidak boleh hidup lagi");

    const untukPasien = await kabarUntukku(pasien, kode);
    assert.ok(
      !untukPasien.some((n) => /berangkat/i.test(n.message)),
      `pasien tidak boleh dijanjikan perawat berangkat: ${JSON.stringify(untukPasien.map((n) => n.message))}`
    );
    assert.ok(
      untukPasien.some((n) => /dikembalikan/i.test(`${n.title} ${n.message}`)),
      "pasien harus diberi tahu uangnya akan dikembalikan"
    );

    const admin = await masuk(AKUN.admin);
    const untukAdmin = await kabarUntukku(admin, kode);
    assert.ok(
      untukAdmin.some((n) => /kembalikan/i.test(`${n.title} ${n.message}`)),
      "admin harus diminta mengembalikan uang"
    );
    const bAdmin = await lihatPemesanan(admin, id);
    assert.equal(bAdmin.sengketa, true, "pemesanan ditandai bersengketa supaya buktinya dibekukan");
  });

  test("pembayaran kedua untuk kunjungan yang sudah lunas ditandai untuk dikembalikan", async () => {
    const { id, kode, pasien, orderId } = await tertagih();

    // Percobaan pertama kedaluwarsa, pasien membuka halaman bayar baru…
    diterima(await kirimKabar(kabar(orderId, { transaction_status: "expire", status_code: "407" })), "kabar kedaluwarsa");
    const kedua = diterima(await pasien.kirim("/api/pembayaran", { bookingId: id }), "membuka pembayaran kedua");
    assert.notEqual(kedua.orderId, orderId, "percobaan kedua punya nomor pesanan baru");
    diterima(await kirimKabar(kabar(kedua.orderId)), "percobaan kedua lunas");

    // …lalu bank meneruskan pembayaran percobaan PERTAMA yang ternyata sempat dibayar.
    diterima(await kirimKabar(kabar(orderId, { transaction_id: `TXN-telat-${orderId}` })), "kabar lunas yang terlambat");

    const admin = await masuk(AKUN.admin);
    const untukAdmin = await kabarUntukku(admin, kode);
    assert.ok(
      untukAdmin.some((n) => /ganda|dua kali/i.test(`${n.title} ${n.message}`) && /kembalikan/i.test(`${n.title} ${n.message}`)),
      `admin harus tahu ada pembayaran ganda yang perlu dikembalikan: ${JSON.stringify(untukAdmin.map((n) => n.title))}`
    );
    const b = await lihatPemesanan(admin, id);
    assert.equal(b.status, "DIBAYAR", "kunjungannya sendiri tetap berjalan");
    // Sengaja TIDAK ditandai sengketa: sengketa menahan honor perawat, dan
    // pasien yang membayar dua kali bukan kesalahan perawatnya.
    assert.notEqual(b.sengketa, true, "honor perawat tidak boleh tertahan karena pasien membayar dua kali");

    const r = await admin.ambil("/api/platform");
    const yangPertama = (r.isi.payments ?? []).find((p) => p.orderId === orderId);
    assert.equal(yangPertama?.status, "PERLU_TINJAUAN", "pembayaran yang kedua masuk ditandai perlu ditinjau");
  });

  test("membatalkan kunjungan yang sudah lunas: admin diminta mengembalikan, perawat diberi tahu", async () => {
    const { id, kode, pasien, perawat } = await lunas();
    diterima(await pasien.aksi({ action: "CANCEL_BOOKING", bookingId: id, reason: "Pasien dirawat inap" }), "membatalkan yang sudah lunas");

    const admin = await masuk(AKUN.admin);
    assert.ok(
      (await kabarUntukku(admin, kode)).some((n) => /kembalikan/i.test(`${n.title} ${n.message}`)),
      "admin harus diminta mengembalikan uang pasien"
    );
    assert.ok(
      (await kabarUntukku(perawat, kode)).some((n) => /batal/i.test(`${n.title} ${n.message}`)),
      "perawat yang memegang kunjungan harus tahu kunjungannya batal — jangan sampai ia berangkat"
    );
  });
});

/* ------------------------------------------------------------------ */

describe("Perawat yang izinnya dicabut", () => {
  test("tidak bisa berangkat ke kunjungan yang sudah ia pegang", async () => {
    const pasien = await masuk(AKUN.pasien);
    const hendra = await masuk(AKUN.perawat2);
    const admin = await masuk(AKUN.admin);

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
        await admin.aksi({ action: "PUTUS_VERIFIKASI", providerId: idHendra, keputusan: "TERVERIFIKASI", diperiksaDi: "Portal KTKI (uji)" }),
        "memulihkan Hendra"
      );
    }
  });
});

/* ------------------------------------------------------------------ */

describe("Bukti kunjungan", () => {
  test('"sudah tiba" tidak bisa ditandai tanpa foto kedatangan', async () => {
    const { id, pasien, perawat } = await lunas();
    diterima(await perawat.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status: "PERAWAT_BERANGKAT" }), "berangkat");
    const r = await perawat.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status: "PERAWAT_TIBA" });
    ditolak(r, 409, "tiba tanpa foto kedatangan");
    assert.equal((await lihatPemesanan(pasien, id)).status, "PERAWAT_BERANGKAT");
  });

  test("foto bukti tidak bisa diunggah sebelum berangkat", async () => {
    const { id, perawat } = await lunas();
    const r = await perawat.aksi({ action: "UPLOAD_TASK_PHOTO", bookingId: id, photoType: "WOUND_BEFORE", imageUrl: FOTO });
    ditolak(r, 409, "foto luka sebelum perawat berangkat");
  });

  test("foto bukti tidak bisa ditambahkan setelah kunjungan ditutup", async () => {
    const { id, perawat } = await lunas();
    diterima(await perawat.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status: "PERAWAT_BERANGKAT" }), "berangkat");
    diterima(await perawat.aksi({ action: "UPLOAD_TASK_PHOTO", bookingId: id, photoType: "ARRIVAL_CONFIRMATION", imageUrl: FOTO }), "tiba");
    diterima(await perawat.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status: "DIKERJAKAN" }), "mulai");
    diterima(await perawat.aksi({ action: "UPLOAD_TASK_PHOTO", bookingId: id, photoType: "WOUND_BEFORE", imageUrl: FOTO }), "foto sebelum");
    diterima(await perawat.aksi({ action: "UPLOAD_TASK_PHOTO", bookingId: id, photoType: "WOUND_AFTER", imageUrl: FOTO }), "foto sesudah");
    diterima(
      await perawat.aksi({ action: "SIMPAN_LAPORAN", bookingId: id, whatWasDone: "Ganti balut foam.", homeInstructions: "Jaga tetap kering." }),
      "menutup kunjungan"
    );
    const r = await perawat.aksi({ action: "UPLOAD_TASK_PHOTO", bookingId: id, photoType: "WOUND_AFTER", imageUrl: FOTO });
    ditolak(r, 409, "menambah foto bukti setelah laporan ditandatangani");
  });

  test("jenis foto yang tidak dikenal ditolak", async () => {
    const { id, perawat } = await lunas();
    diterima(await perawat.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status: "PERAWAT_BERANGKAT" }), "berangkat");
    diterima(await perawat.aksi({ action: "UPLOAD_TASK_PHOTO", bookingId: id, photoType: "ARRIVAL_CONFIRMATION", imageUrl: FOTO }), "tiba");
    const r = await perawat.aksi({ action: "UPLOAD_TASK_PHOTO", bookingId: id, photoType: "APA_SAJA", imageUrl: FOTO });
    ditolak(r, 400, "jenis foto karangan");
  });
});

/* ------------------------------------------------------------------ */

describe("Tanda bahaya diperiksa server", () => {
  for (const [nama, kaji] of [
    ["demam", { woundLocation: "Telapak kaki", fever: true }],
    ["perdarahan hebat", { woundLocation: "Telapak kaki", bleeding: "Severe" }],
  ]) {
    test(`${nama} tetap menolak kunjungan rumah walau browser bilang aman`, async () => {
      const pasien = await masuk(AKUN.pasien);
      const r = await pasien.aksi({
        action: "CREATE_BOOKING",
        serviceId: 1,
        serviceName: "Perawatan luka",
        serviceCategory: "WOUND_CARE",
        addressText: "Jl. Bunga Coklat No. 18, Kota Malang",
        scheduledDate: tanggalNanti(5),
        scheduledTimeSlot: "09:00 - 10:00",
        triageRedFlag: false,
        woundAssessment: kaji,
      });
      ditolak(r, 409, `${nama} lolos jadi kunjungan rumah`);
    });
  }
});

/* ------------------------------------------------------------------ */

describe("Rebutan", () => {
  test("dua perawat mengambil permintaan yang sama bersamaan: hanya satu yang berhasil", async () => {
    const { id, pasien } = await siapkanPemesanan("MENUNGGU_TINJAUAN");
    const ratna = await masuk(AKUN.perawat);
    const hendra = await masuk(AKUN.perawat2);
    const [a, b] = await Promise.all([
      ratna.aksi({ action: "MULAI_TINJAUAN", bookingId: id }),
      hendra.aksi({ action: "MULAI_TINJAUAN", bookingId: id }),
    ]);
    const berhasil = [a, b].filter((r) => r.status === 200).length;
    assert.equal(berhasil, 1, `tepat satu yang boleh berhasil, dapat ${a.status} dan ${b.status}`);
    const sekarang = await lihatPemesanan(pasien, id);
    const pemenang = a.status === 200 ? a : b;
    assert.equal(sekarang.providerId, pemenang.isi.booking.providerId, "yang tercatat adalah yang berhasil");
  });
});

/* ------------------------------------------------------------------ */

describe("Perawat meminta bantuan", () => {
  test("perawat di rumah pasien bisa meminta bantuan, dan admin langsung tahu di mana", async () => {
    const { id, kode, perawat, pasien } = await lunas();
    diterima(await perawat.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status: "PERAWAT_BERANGKAT" }), "berangkat");

    ditolak(await pasien.aksi({ action: "MINTA_BANTUAN", bookingId: id }), 403, "pasien memakai tombol bantuan perawat");
    const lain = await masuk(AKUN.perawat2);
    ditolak(await lain.aksi({ action: "MINTA_BANTUAN", bookingId: id }), 403, "perawat lain memakai tombol bantuan");

    diterima(await perawat.aksi({ action: "MINTA_BANTUAN", bookingId: id, catatan: "Ada anjing galak" }), "minta bantuan");

    const admin = await masuk(AKUN.admin);
    const n = (await kabarUntukku(admin, kode)).find((x) => /bantuan/i.test(x.title));
    assert.ok(n, "admin menerima pemberitahuan bantuan");
    assert.match(n.message, /Bunga Coklat/, "pemberitahuan memuat alamat kunjungan");
    assert.match(n.message, /anjing galak/, "pemberitahuan memuat catatan perawat");

    const untukPasien = await kabarUntukku(pasien, kode);
    assert.ok(!untukPasien.some((x) => /bantuan/i.test(x.title)), "pasien tidak diberi tahu perawat meminta bantuan");
  });
});

/** JPEG 1×1 piksel. */
const FOTO =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";
