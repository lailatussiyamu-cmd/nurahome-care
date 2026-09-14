/**
 * Bagi hasil — 70/30 atas jasa tindakan.
 *
 * Ini uang perawat. Kesalahan di sini tidak berbunyi: tidak ada layar yang
 * merah, tidak ada galat di log. Yang terjadi hanyalah seseorang yang sudah
 * bekerja menerima lebih sedikit dari yang seharusnya, atau tidak menerima
 * sama sekali — dan baru ketahuan berbulan-bulan kemudian, kalau ketahuan.
 *
 * Empat hal yang dijaga berkas ini:
 *
 *   1. Yang dibagi HANYA jasa tindakan. Bahan, jarak, dan biaya luar jam
 *      utuh ke perawat. Membaginya sama saja menyuruh perawat menombok
 *      sebagian bahannya sendiri.
 *   2. Tercatat tepat SEKALI per kunjungan — termasuk kalau kabar
 *      pembayaran yang sama datang berkali-kali, dan kalau pencatatan
 *      susulan dijalankan lagi.
 *   3. Tidak tercatat sebelum uangnya benar-benar masuk.
 *   4. Perawat melihat honornya sendiri saja; pasien tidak melihatnya sama
 *      sekali.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AKUN,
  diterima,
  ditolak,
  kabar,
  kirimKabar,
  masuk,
  siapkanPemesanan,
} from "./bantu.mjs";

/**
 * Angka penawaran bawaan `siapkanPemesanan`:
 *   JASA  1 x 350.000 = 350.000
 *   BAHAN 2 x  55.000 = 110.000
 *                        -------
 *   total              460.000
 *
 * Ditulis di sini sebagai angka mati, bukan dihitung ulang dengan rumus
 * yang sama seperti di aplikasi. Tes yang memakai rumus yang sedang diuji
 * akan tetap lulus ketika rumusnya salah.
 */
const JASA = 350_000;
const BAHAN = 110_000;
const TOTAL = 460_000;
const PORSI_PERAWAT = 245_000; // 70% dari 350.000
const POTONGAN = 105_000; // 30%
const DITERIMA = 355_000; // 245.000 + 110.000

/** Membawa satu pemesanan sampai selesai dan lunas. */
async function kunjunganSelesai({ bayarDulu = true } = {}) {
  const { id, kode, pasien, perawat } = await siapkanPemesanan();

  if (bayarDulu) {
    await pasien.kirim("/api/pembayaran", { bookingId: id });
    diterima(await kirimKabar(kabar(`${kode}-1`)), "kabar pembayaran lunas");
  }

  for (const status of ["PERAWAT_BERANGKAT", "PERAWAT_TIBA", "DIKERJAKAN"]) {
    if (bayarDulu) await perawat.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status });
  }

  return { id, kode, pasien, perawat };
}

const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJ";

async function tutupLaporan(perawat, id) {
  for (const photoType of ["WOUND_BEFORE", "WOUND_AFTER"]) {
    diterima(
      await perawat.aksi({
        action: "UPLOAD_TASK_PHOTO",
        bookingId: id,
        photoType,
        imageUrl: FOTO,
        caption: "uji bagi hasil",
      }),
      `mengunggah foto ${photoType}`
    );
  }
  return perawat.aksi({
    action: "SIMPAN_LAPORAN",
    bookingId: id,
    whatWasDone: "Balutan diganti, luka dibersihkan dengan NaCl.",
    homeInstructions: "Jaga balutan tetap kering, kontrol tiga hari lagi.",
  });
}

async function bagiHasilUntuk(sesi, bookingId) {
  const r = await sesi.ambil("/api/platform");
  return (r.isi.payouts ?? []).find((p) => p.bookingId === bookingId) ?? null;
}

/* ================================================================== */

describe("Angka bagi hasil", () => {
  test("yang dibagi 70/30 hanya jasa; bahan utuh ke perawat", async () => {
    const { id, perawat } = await kunjunganSelesai();
    diterima(await tutupLaporan(perawat, id), "menutup kunjungan");

    const admin = await masuk(AKUN.admin);
    const bagi = await bagiHasilUntuk(admin, id);
    assert.ok(bagi, "kunjungan yang selesai dan lunas harus punya baris bagi hasil");

    assert.equal(bagi.totalBilledIdr, TOTAL, "total tagihan");
    assert.equal(bagi.serviceIdr, JASA, "jasa tindakan");
    assert.equal(bagi.suppliesIdr, BAHAN, "bahan habis pakai");
    assert.equal(bagi.providerShareIdr, PORSI_PERAWAT, "70% dari jasa");
    assert.equal(bagi.platformFeeIdr, POTONGAN, "30% dari jasa");
    assert.equal(
      bagi.providerTakeIdr,
      DITERIMA,
      "yang diterima perawat = porsi jasa + bahan + jarak + luar jam"
    );
    assert.equal(bagi.status, "TERKUMPUL");

    /**
     * Potongan platform tidak boleh menyentuh bahan. Kalau suatu saat
     * rumusnya diubah menjadi 30% dari TOTAL, angka ini yang berteriak:
     * perawat kehilangan 33.000 per kunjungan tanpa satu pun pesan galat.
     */
    assert.ok(
      bagi.platformFeeIdr < Math.round(TOTAL * 0.3),
      "potongan platform tidak boleh dihitung dari total — bahan bukan pendapatan platform"
    );
  });

  test("porsi yang dipakai ikut dibekukan di barisnya", async () => {
    const { id, perawat } = await kunjunganSelesai();
    diterima(await tutupLaporan(perawat, id), "menutup kunjungan");
    const admin = await masuk(AKUN.admin);
    const bagi = await bagiHasilUntuk(admin, id);
    assert.ok(
      Number(bagi.platformRate) > 0 && Number(bagi.platformRate) < 1,
      `porsi platform harus tercatat di barisnya sendiri, dapat ${bagi.platformRate} — tanpa itu, mengubah tarif tahun depan diam-diam mengubah honor tahun ini`
    );
  });
});

describe("Kapan bagi hasil tercatat", () => {
  test("kunjungan selesai TAPI belum dibayar tidak menghasilkan honor", async () => {
    /**
     * Kunjungan yang belum lunas bukan utang platform kepada perawat —
     * itu utang pasien kepada platform. Mencatatnya sebagai honor berarti
     * platform menjanjikan uang yang belum ia pegang.
     */
    const { id, perawat } = await kunjunganSelesai({ bayarDulu: false });
    await tutupLaporan(perawat, id); // ditolak alurnya, memang begitu

    const admin = await masuk(AKUN.admin);
    assert.equal(
      await bagiHasilUntuk(admin, id),
      null,
      "belum ada uang masuk, jadi belum boleh ada honor tercatat"
    );
  });

  /**
   * Catatan jujur tentang urutan.
   *
   * Pencatatan honor dipanggil dari DUA tempat — penutupan laporan dan
   * kabar pembayaran — tetapi hari ini hanya yang pertama yang benar-benar
   * terpakai. Sebabnya alur statusnya sendiri: perawat baru boleh
   * berangkat setelah pemesanan berstatus DIBAYAR, dan yang menyetel
   * status itu adalah kabar pembayaran. Jadi uang SELALU masuk lebih dulu.
   *
   * Panggilan kedua dibiarkan sebagai jaring, bukan hiasan: kalau suatu
   * saat ada jalur "bayar di tempat setelah tindakan" — yang sangat mungkin
   * diminta — urutannya terbalik, dan tanpa panggilan itu honornya hilang
   * tanpa satu pun galat. Tes di bawah menguji yang memang bisa diuji lewat
   * HTTP hari ini: pencatatan susulan oleh admin, yang menutup lubang yang
   * sama kalau pencatatan otomatisnya terlewat.
   */
  test("kunjungan yang honornya terlewat bisa dicatat susulan oleh admin", async () => {
    const { id, perawat } = await kunjunganSelesai();
    diterima(await tutupLaporan(perawat, id), "menutup kunjungan");

    const admin = await masuk(AKUN.admin);
    const sebelum = await bagiHasilUntuk(admin, id);
    assert.ok(sebelum, "honornya sudah tercatat otomatis");

    /** Dijalankan lagi: tidak boleh membuat baris kedua untuk kunjungan yang sama. */
    const hasil = diterima(
      await admin.aksi({ action: "CATAT_BAGI_HASIL_TERTINGGAL" }),
      "menjalankan pencatatan susulan"
    );
    assert.ok(Array.isArray(hasil.dilewati), "laporannya menyebut yang dilewati beserta alasannya");

    const r = await admin.ambil("/api/platform");
    const jumlah = (r.isi.payouts ?? []).filter((p) => p.bookingId === id).length;
    assert.equal(jumlah, 1, `pencatatan susulan tidak boleh menggandakan honor, dapat ${jumlah}`);
  });

  test("pencatatan susulan bukan wewenang perawat", async () => {
    const { perawat } = await kunjunganSelesai();
    ditolak(
      await perawat.aksi({ action: "CATAT_BAGI_HASIL_TERTINGGAL" }),
      403,
      "perawat menjalankan pencatatan susulan"
    );
  });

  test("kabar pembayaran yang sama tiga kali tetap satu baris honor", async () => {
    const { id, kode, perawat } = await kunjunganSelesai();
    diterima(await tutupLaporan(perawat, id), "menutup kunjungan");

    await kirimKabar(kabar(`${kode}-1`));
    await kirimKabar(kabar(`${kode}-1`));
    await kirimKabar(kabar(`${kode}-1`));

    const admin = await masuk(AKUN.admin);
    const r = await admin.ambil("/api/platform");
    const jumlah = (r.isi.payouts ?? []).filter((p) => p.bookingId === id).length;
    assert.equal(jumlah, 1, `honor harus tercatat tepat sekali, dapat ${jumlah} baris`);
  });
});

describe("Siapa melihat apa", () => {
  test("perawat melihat honornya sendiri, pasien tidak melihat honor sama sekali", async () => {
    const { id, pasien, perawat } = await kunjunganSelesai();
    diterima(await tutupLaporan(perawat, id), "menutup kunjungan");

    const milikPerawat = await bagiHasilUntuk(perawat, id);
    assert.ok(milikPerawat, "perawat harus bisa melihat honor kunjungannya sendiri");
    assert.equal(milikPerawat.providerTakeIdr, DITERIMA);

    const r = await pasien.ambil("/api/platform");
    assert.deepEqual(
      r.isi.payouts ?? [],
      [],
      "pasien tidak boleh menerima baris bagi hasil — berapa yang diterima perawat bukan urusannya"
    );
  });

  test("perawat lain tidak melihat honor kunjungan yang bukan miliknya", async () => {
    const { id, perawat } = await kunjunganSelesai();
    diterima(await tutupLaporan(perawat, id), "menutup kunjungan");

    const lain = await masuk(AKUN.perawat2);
    assert.equal(
      await bagiHasilUntuk(lain, id),
      null,
      "honor perawat lain tidak boleh ikut terkirim — itu penghasilan orang"
    );
  });
});

describe("Menandai honor sudah dibayarkan", () => {
  async function satuHonor() {
    const { id, perawat } = await kunjunganSelesai();
    diterima(await tutupLaporan(perawat, id), "menutup kunjungan");
    const admin = await masuk(AKUN.admin);
    const bagi = await bagiHasilUntuk(admin, id);
    return { id, bagi, admin, perawat };
  }

  test("perawat tidak bisa menandai honornya sendiri sudah dibayarkan", async () => {
    const { bagi, perawat } = await satuHonor();
    ditolak(
      await perawat.aksi({
        action: "TANDAI_HONOR_DIBAYARKAN",
        payoutId: bagi.id,
        bukti: "TRF-123456",
      }),
      403,
      "perawat menandai honornya sendiri lunas"
    );
  });

  test("tanpa bukti transfer ditolak", async () => {
    const { bagi, admin } = await satuHonor();
    ditolak(
      await admin.aksi({ action: "TANDAI_HONOR_DIBAYARKAN", payoutId: bagi.id, bukti: "" }),
      409,
      "menandai dibayarkan tanpa nomor referensi"
    );
  });

  test("sekali ditandai dibayarkan, tidak bisa ditandai lagi", async () => {
    const { id, bagi, admin } = await satuHonor();
    diterima(
      await admin.aksi({
        action: "TANDAI_HONOR_DIBAYARKAN",
        payoutId: bagi.id,
        bukti: "TRF-998877",
      }),
      "menandai honor dibayarkan"
    );

    const sesudah = await bagiHasilUntuk(admin, id);
    assert.equal(sesudah.status, "DIBAYARKAN");
    assert.equal(sesudah.paymentReference, "TRF-998877");
    assert.ok(sesudah.paidAt, "tanggal bayarnya harus tercatat");

    ditolak(
      await admin.aksi({
        action: "TANDAI_HONOR_DIBAYARKAN",
        payoutId: bagi.id,
        bukti: "TRF-lagi-lagi",
      }),
      409,
      "menandai honor yang sama dibayarkan dua kali"
    );

    /** Angkanya tidak boleh bergerak sedikit pun karena ditandai bayar. */
    assert.equal(sesudah.providerTakeIdr, DITERIMA);
  });
});

describe("Sengketa", () => {
  test("honor kunjungan yang bersengketa dicatat tapi ditahan", async () => {
    const { id, perawat } = await kunjunganSelesai();
    const admin = await masuk(AKUN.admin);
    diterima(
      await admin.aksi({
        action: "TANDAI_SENGKETA",
        bookingId: id,
        sengketa: true,
        alasan: "Pasien mengeluhkan biaya bahan; sedang diperiksa.",
      }),
      "menyalakan sengketa"
    );
    diterima(await tutupLaporan(perawat, id), "menutup kunjungan");

    const bagi = await bagiHasilUntuk(admin, id);
    assert.ok(bagi, "honornya tetap DICATAT supaya tidak hilang");
    assert.equal(
      bagi.status,
      "DITAHAN",
      "tapi tidak boleh berstatus siap dibayarkan selama sengketanya berjalan"
    );

    ditolak(
      await admin.aksi({ action: "TANDAI_HONOR_DIBAYARKAN", payoutId: bagi.id, bukti: "TRF-1" }),
      409,
      "membayarkan honor yang sedang bersengketa"
    );
  });
});
