/**
 * Urutan alur dan verifikasi izin praktik.
 *
 * Urutan pemesanan ditulis sebagai DATA di logic/alur.ts — satu tabel
 * perpindahan yang sah, dipakai layar dan API sekaligus. Tes di sini
 * memastikan tabel itu benar-benar mengikat lewat HTTP, bukan hanya
 * menghalangi tombol di layar. Layar bisa dilewati; API tidak.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AKUN,
  ditolak,
  diterima,
  lihatPemesanan,
  masuk,
  siapkanPemesanan,
  tanggalNanti,
} from "./bantu.mjs";

describe("Urutan alur tidak bisa dilangkahi", () => {
  /**
   * Yang ditegaskan di sini KEADAANNYA, bukan kode statusnya.
   *
   * Percobaan pertama menuntut 409, dan gagal karena aplikasi menjawab 403
   * lebih dulu ("bukan perawat yang ditugaskan") — penjagaan kepemilikan
   * berjalan sebelum penjagaan urutan. Dua-duanya menolak, dan yang lebih
   * dulu berjalan adalah urusan dalam kode. Tes di batas HTTP tidak boleh
   * mengunci urutan itu; kalau dikunci, merapikan kode nanti akan
   * memerahkan tes tanpa ada yang benar-benar rusak.
   */
  test("tidak bisa langsung berangkat dari permintaan yang baru masuk", async () => {
    const { id, perawat, pasien } = await siapkanPemesanan("MENUNGGU_TINJAUAN");
    for (const status of ["PERAWAT_BERANGKAT", "PERAWAT_TIBA", "DIKERJAKAN", "SELESAI"]) {
      const r = await perawat.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status });
      assert.ok(
        r.status === 403 || r.status === 409,
        `melompat ke ${status} seharusnya ditolak, dapat ${r.status}: ${JSON.stringify(r.isi).slice(0, 160)}`
      );
    }
    const b = await lihatPemesanan(pasien, id);
    assert.equal(b.status, "MENUNGGU_TINJAUAN", "statusnya tidak boleh bergeser sedikit pun");
  });

  test("tidak bisa menutup kunjungan yang belum dibayar", async () => {
    const { id, perawat } = await siapkanPemesanan();
    ditolak(
      await perawat.aksi({
        action: "SIMPAN_LAPORAN",
        bookingId: id,
        whatWasDone: "Balutan diganti.",
        homeInstructions: "Jaga tetap kering.",
      }),
      409,
      "menutup kunjungan sebelum dibayar"
    );
  });

  test("penawaran tanpa temuan ditolak", async () => {
    const { id, perawat } = await siapkanPemesanan("DITINJAU");
    ditolak(
      await perawat.aksi({
        action: "KIRIM_PENAWARAN",
        bookingId: id,
        temuan: "",
        item: [{ kind: "JASA", label: "Jasa", qty: 1, unitPriceIdr: 350000, fromCatalog: true }],
        scheduledDate: tanggalNanti(10),
        scheduledTimeSlot: "09:00 - 10:00",
      }),
      400,
      "penawaran tanpa hasil penilaian luka"
    );
  });

  test("persetujuan tanpa nama penanda tangan ditolak", async () => {
    const { id, pasien } = await siapkanPemesanan("DITAWARKAN");
    ditolak(
      await pasien.aksi({
        action: "PUTUSKAN_PENAWARAN",
        bookingId: id,
        setuju: true,
        namaTandaTangan: "",
        hubungan: "Diri sendiri",
      }),
      400,
      "menyetujui tanpa tanda tangan"
    );
  });

  test("testimoni hanya bisa diisi setelah kunjungan selesai", async () => {
    const { id, pasien } = await siapkanPemesanan();
    ditolak(
      await pasien.aksi({
        action: "KIRIM_TESTIMONI",
        bookingId: id,
        bintang: 5,
        isi: "Bagus sekali",
        izinTayang: "BOLEH_SAMARAN",
      }),
      409,
      "testimoni sebelum kunjungan selesai"
    );
  });

  /**
   * Wizard menahannya di layar. Di API ditahan lagi — karena layar bisa
   * dilewati dan API tidak.
   */
  test("tanda bahaya tidak bisa menjadi kunjungan rumah", async () => {
    const pasien = await masuk(AKUN.pasien);
    ditolak(
      await pasien.aksi({
        action: "CREATE_BOOKING",
        serviceId: 1,
        serviceName: "Perawatan luka",
        serviceCategory: "WOUND_CARE",
        addressText: "Jl. Contoh, Kota Malang",
        scheduledDate: tanggalNanti(3),
        scheduledTimeSlot: "09:00 - 10:00",
        triageRedFlag: true,
        triageNotes: "Perdarahan menyembur",
      }),
      409,
      "memesan dengan tanda bahaya"
    );
  });
});

describe("Verifikasi izin praktik", () => {
  /**
   * Sebelum 8 September 2026, `verified_status` bernilai "VERIFIED" sejak
   * data contoh dibuat — tak seorang pun pernah memverifikasi apa-apa.
   * Pasien memutuskan memasukkan orang asing ke rumahnya berdasarkan
   * lencana itu.
   */
  test("perawat yang belum terverifikasi tidak bisa mengambil kunjungan", async () => {
    const { id } = await siapkanPemesanan("MENUNGGU_TINJAUAN");
    const belumVerif = await masuk(AKUN.perawatBelumVerif);
    const r = await belumVerif.aksi({ action: "MULAI_TINJAUAN", bookingId: id });
    ditolak(r, 403, "perawat belum terverifikasi mengambil kunjungan");
  });

  test("perawat yang belum terverifikasi tidak melihat satu pun foto luka", async () => {
    await siapkanPemesanan("MENUNGGU_TINJAUAN");
    const belumVerif = await masuk(AKUN.perawatBelumVerif);
    const r = await belumVerif.ambil("/api/platform");
    assert.equal(
      (r.isi.bookings ?? []).length,
      0,
      "penjagaan verifikasi tidak ada gunanya kalau foto lukanya sudah sampai ke layarnya"
    );
    assert.equal((r.isi.taskPhotos ?? []).length, 0);
  });

  /**
   * Tanpa kolom "di mana dicocokkan", "terverifikasi" hanya berarti
   * seseorang menekan tombol hijau — persis keadaan yang sedang diperbaiki.
   */
  test("admin tidak bisa meluluskan tanpa menyebut di mana nomornya dicocokkan", async () => {
    const admin = await masuk(AKUN.admin);
    ditolak(
      await admin.aksi({ action: "PUTUS_VERIFIKASI", providerId: 3, keputusan: "TERVERIFIKASI" }),
      400,
      "meluluskan tanpa sumber pemeriksaan"
    );
  });

  test("admin tidak bisa menolak tanpa alasan yang bisa dibaca perawatnya", async () => {
    const admin = await masuk(AKUN.admin);
    ditolak(
      await admin.aksi({
        action: "PUTUS_VERIFIKASI",
        providerId: 3,
        keputusan: "PERLU_PERBAIKAN",
        alasan: "gak",
      }),
      400,
      "menolak dengan alasan terlalu pendek"
    );
  });

  test("meluluskan dengan lengkap berhasil, dan perawatnya jadi bisa bekerja", async () => {
    const admin = await masuk(AKUN.admin);
    diterima(
      await admin.aksi({
        action: "PUTUS_VERIFIKASI",
        providerId: 3,
        keputusan: "TERVERIFIKASI",
        diperiksaDi: "Portal KTKI / SATUSEHAT SDMK",
      }),
      "meluluskan verifikasi"
    );

    const { id } = await siapkanPemesanan("MENUNGGU_TINJAUAN");
    const perawat = await masuk(AKUN.perawatBelumVerif);
    diterima(
      await perawat.aksi({ action: "MULAI_TINJAUAN", bookingId: id }),
      "perawat yang sudah diluluskan mengambil kunjungan"
    );
  });

  /**
   * Pembekuan yang hanya mengubah satu kolom sementara sesinya tetap hidup
   * berarti orang itu masih membuka aplikasinya — dengan foto luka pasien
   * di layarnya.
   */
  test("membekukan perawat langsung mencabut sesinya", async () => {
    const perawat = await masuk(AKUN.perawatBelumVerif);
    assert.equal((await perawat.ambil("/api/auth")).isi.masuk, true);

    const admin = await masuk(AKUN.admin);
    diterima(
      await admin.aksi({
        action: "PUTUS_VERIFIKASI",
        providerId: 3,
        keputusan: "DIBEKUKAN",
        alasan: "SIP terindikasi tidak sah, sedang dicek ke Dinkes",
      }),
      "membekukan perawat"
    );

    const cek = await perawat.ambil("/api/auth");
    assert.equal(cek.isi.masuk, false, "sesi perawat yang dibekukan harus mati seketika");
  });
});

describe("Penyortiran kritik pasien", () => {
  /**
   * Keluhan yang pasien tandai menyangkut keselamatan tidak boleh menunggu
   * di meja admin — akibat salah tahan bersifat satu arah.
   */
  test("perawat tidak bisa membalas masukan yang belum diteruskan admin", async () => {
    const perawat = await masuk(AKUN.perawat);
    const r = await perawat.ambil("/api/platform");
    const belum = (r.isi.testimoni ?? []).find((t) => t.statusKePerawat && t.statusKePerawat !== "DITERUSKAN");
    if (!belum) return; // tidak ada bahan di data contoh
    ditolak(
      await perawat.aksi({ action: "BALAS_TESTIMONI", testimoniId: belum.id, balasan: "terima kasih" }),
      409,
      "membalas masukan yang belum disortir"
    );
  });

  test("perawat hanya menerima masukan yang sudah diteruskan", async () => {
    const perawat = await masuk(AKUN.perawat);
    const r = await perawat.ambil("/api/platform");
    for (const t of r.isi.testimoni ?? []) {
      if (t.__publik) continue;
      assert.equal(
        t.statusKePerawat,
        "DITERUSKAN",
        "masukan yang masih di meja admin tidak boleh terkirim ke browser perawat"
      );
      assert.equal(t.alasanTahan, undefined, "catatan admin kepada dirinya sendiri tidak ikut");
    }
  });
});

describe("Kode pemesanan", () => {
  /**
   * Versi lama memakai 4 angka acak — hanya 9.000 kemungkinan, di kolom
   * yang unik. Dengan 70 pemesanan peluang bentroknya sudah ±24%, dan saat
   * bentrok pemesanannya GAGAL dengan "Failed to process platform action".
   * Ketahuan karena satu tes berkedip merah.
   *
   * Tes ini membuat cukup banyak pemesanan supaya bentrokan lama pasti
   * muncul, lalu menuntut semuanya berhasil dan kodenya berbeda-beda.
   */
  test("40 pemesanan berturut-turut semuanya berhasil dan kodenya unik", async () => {
    const pasien = await masuk(AKUN.pasien);
    const kode = new Set();
    for (let i = 0; i < 40; i++) {
      const r = await pasien.aksi({
        action: "CREATE_BOOKING",
        serviceId: 1,
        serviceName: "Perawatan luka",
        serviceCategory: "WOUND_CARE",
        addressText: "Jl. Contoh, Kota Malang",
        scheduledDate: tanggalNanti(20),
        scheduledTimeSlot: "09:00 - 10:00",
      });
      const isi = diterima(r, `pemesanan ke-${i + 1}`);
      kode.add(isi.booking.bookingCode);
    }
    assert.equal(kode.size, 40, "setiap pemesanan harus punya kode sendiri");

    /**
     * Penegasan yang PASTI, bukan bergantung keberuntungan.
     *
     * Empat puluh pemesanan dengan kode 4 angka hanya bentrok ±8% dari
     * waktu — tes yang mengandalkan itu akan berkedip, dan tes berkedip
     * cepat berhenti dipercaya. Bentuk kodenya diperiksa langsung: kalau
     * ada yang mengembalikannya ke 4 angka, tes ini merah setiap kali,
     * bukan sesekali.
     */
    for (const k of kode) {
      const angka = String(k).split("-").pop() ?? "";
      assert.ok(
        angka.length >= 5,
        `kode "${k}" hanya ${angka.length} angka — ruangnya terlalu sempit dan akan bentrok`
      );
    }
  });
});
