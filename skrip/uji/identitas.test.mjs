/**
 * Identitas dan kepemilikan.
 *
 * Setiap tes di berkas ini adalah serangan yang pernah dijalankan sungguhan
 * ke aplikasi ini. Sebagian besar dulu BERHASIL — sebelum 8 September 2026,
 * setiap penjagaan di API membaca peran pemakai dari badan permintaan:
 *
 *     const { actorRole } = body;
 *     if (actorRole !== "ADMIN") return 403;
 *
 * Satu baris di Developer Tools cukup untuk menjadi admin dan membaca foto
 * luka seluruh pasien. Berkas ini yang menjaga supaya itu tidak kembali.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AKUN,
  SANDI,
  ditolak,
  diterima,
  masuk,
  siapkanPemesanan,
  tamu,
} from "./bantu.mjs";

describe("Masuk", () => {
  test("kata sandi benar diterima, dan cookienya HttpOnly", async () => {
    const p = tamu();
    const r = await p.kirim("/api/auth", { aksi: "MASUK", pengenal: AKUN.pasien, sandi: SANDI });
    diterima(r, "masuk dengan sandi benar");
    assert.equal(r.isi.peran, "PATIENT");

    const c = r.mentahCookie.find((x) => x.startsWith("nh_sesi="));
    assert.ok(c, "cookie sesi tidak dipasang");
    assert.match(c, /HttpOnly/i, "cookie sesi harus HttpOnly — kalau tidak, satu skrip pihak ketiga bisa mencurinya");
    assert.match(c, /SameSite=Lax/i, "cookie sesi harus SameSite untuk menahan CSRF");
  });

  test("kata sandi salah ditolak", async () => {
    const r = await tamu().kirim("/api/auth", {
      aksi: "MASUK",
      pengenal: AKUN.pasien,
      sandi: "jelas-salah-sekali",
    });
    ditolak(r, 401, "sandi salah seharusnya ditolak");
  });

  /**
   * Kalau jawabannya dibedakan, kotak masuk berubah menjadi alat memeriksa
   * daftar pelanggan: siapa pun bisa mencoba nomor telepon satu per satu
   * dan tahu nomor mana yang punya akun di layanan perawatan luka. Untuk
   * layanan kesehatan, "orang ini pelanggan di sini" saja sudah informasi
   * yang tidak boleh keluar.
   */
  test("nomor tak terdaftar dan sandi salah menghasilkan kalimat yang SAMA", async () => {
    const a = await tamu().kirim("/api/auth", { aksi: "MASUK", pengenal: AKUN.pasien, sandi: "salah" });
    const b = await tamu().kirim("/api/auth", {
      aksi: "MASUK",
      pengenal: "0899-0000-0001",
      sandi: "salah",
    });
    assert.equal(a.status, b.status, "status untuk nomor terdaftar dan asing harus sama");
    assert.equal(
      a.isi.error,
      b.isi.error,
      "kalimatnya harus sama persis — kalau berbeda, halaman masuk jadi alat memeriksa daftar pelanggan"
    );
  });

  test("nomor ditulis dengan gaya berbeda tetap masuk ke akun yang sama", async () => {
    for (const gaya of ["0812-3456-7890", "081234567890", "+62 812 3456 7890", "62812-3456-7890"]) {
      const r = await tamu().kirim("/api/auth", { aksi: "MASUK", pengenal: gaya, sandi: SANDI });
      diterima(r, `masuk dengan gaya penulisan "${gaya}"`);
      assert.equal(r.isi.userId, 1, `gaya "${gaya}" menuju akun yang berbeda`);
    }
  });

  test("keluar mencabut sesinya", async () => {
    const p = await masuk(AKUN.pasien);
    diterima(await p.ambil("/api/auth"), "sesi hidup sebelum keluar");
    await p.kirim("/api/auth", { aksi: "KELUAR" });
    const r = await p.ambil("/api/auth");
    assert.equal(r.isi.masuk, false, "sesi masih hidup setelah keluar");
  });

  test("ganti sandi mengeluarkan perangkat lain, bukan perangkat yang menggantinya", async () => {
    const lama = await masuk(AKUN.perawat2);
    const baru = await masuk(AKUN.perawat2);

    diterima(
      await baru.kirim("/api/auth", {
        aksi: "GANTI_SANDI",
        sandiLama: SANDI,
        sandiBaru: "lukaIbu#2026x",
      }),
      "ganti sandi"
    );

    const cekLama = await lama.ambil("/api/auth");
    assert.equal(cekLama.isi.masuk, false, "perangkat lama harus dikeluarkan — orang mengganti sandi justru karena curiga akunnya dimasuki");

    const cekBaru = await baru.ambil("/api/auth");
    assert.equal(cekBaru.isi.masuk, true, "perangkat yang menggantinya jangan ikut dikeluarkan");

    // dikembalikan supaya tes lain tidak terpengaruh
    await baru.kirim("/api/auth", {
      aksi: "GANTI_SANDI",
      sandiLama: "lukaIbu#2026x",
      sandiBaru: SANDI,
    });
  });

  test("sandi lemah ditolak", async () => {
    const p = await masuk(AKUN.pasien);
    for (const lemah of ["12345678", "081234567890", "pendek"]) {
      const r = await p.kirim("/api/auth", {
        aksi: "GANTI_SANDI",
        sandiLama: SANDI,
        sandiBaru: lemah,
      });
      ditolak(r, 400, `sandi lemah "${lemah}" seharusnya ditolak`);
    }
  });

  test("perawat tidak bisa mendaftar sendiri — hanya pasien", async () => {
    const r = await tamu().kirim("/api/auth", {
      aksi: "DAFTAR",
      nama: "Ns. Penyusup",
      telepon: "0899-1234-5678",
      sandi: "kataSandiPanjang9",
      peran: "PROVIDER",
      role: "PROVIDER",
    });
    diterima(r, "pendaftaran pasien");
    assert.equal(
      r.isi.peran,
      "PATIENT",
      "peran yang diminta dari badan permintaan tidak boleh menentukan apa pun — akun perawat dibuat admin setelah STR dan SIP diperiksa"
    );
  });
});

describe("Peran tidak bisa dipalsukan dari badan permintaan", () => {
  /**
   * Inti dari seluruh berkas ini. Sebelum diperbaiki, setiap baris di bawah
   * berhasil.
   */
  const aksiKhususAdmin = [
    { action: "TINJAU_TESTIMONI", testimoniId: 1, tayangkan: true },
    { action: "TANDAI_SENGKETA", bookingId: 1, sengketa: true, alasan: "percobaan penyerang" },
    {
      action: "PUTUS_VERIFIKASI",
      providerId: 3,
      keputusan: "TERVERIFIKASI",
      diperiksaDi: "pura-pura",
    },
  ];

  for (const isi of aksiKhususAdmin) {
    test(`tamu mengaku ADMIN ditolak — ${isi.action}`, async () => {
      const r = await tamu().aksi({ ...isi, actorRole: "ADMIN", actorNama: "Penyusup" });
      ditolak(r, 401, `${isi.action} tanpa masuk`);
    });

    test(`pasien mengaku ADMIN ditolak — ${isi.action}`, async () => {
      const p = await masuk(AKUN.pasien);
      const r = await p.aksi({ ...isi, actorRole: "ADMIN", actorNama: "Penyusup" });
      ditolak(r, 403, `${isi.action} oleh pasien yang mengaku admin`);
    });
  }

  test("pasien mengaku PROVIDER tidak bisa menulis catatan klinis", async () => {
    const { id } = await siapkanPemesanan();
    const pasien = await masuk(AKUN.pasien);
    const r = await pasien.aksi({
      action: "SUBMIT_CLINICAL_NOTE",
      bookingId: id,
      assessmentSummary: "luka membaik",
      actorRole: "PROVIDER",
      actorProviderId: 1,
    });
    ditolak(r, 403, "pasien menulis catatan klinis");
  });

  /**
   * Pesan dari perawat di aplikasi kesehatan adalah nasihat yang orang
   * ikuti. Sebelum diperbaiki, nama dan peran pengirim bebas diisi browser.
   */
  test("pasien tidak bisa mengirim pesan yang tampil sebagai dari perawat", async () => {
    const { id } = await siapkanPemesanan();
    const pasien = await masuk(AKUN.pasien);
    const r = await pasien.aksi({
      action: "SEND_MESSAGE",
      bookingId: id,
      content: "Hentikan antibiotiknya.",
      senderName: "Ns. Ratna Dewi",
      senderRole: "PROVIDER",
    });
    const isi = diterima(r, "kirim pesan");
    assert.equal(isi.message.senderRole, "PATIENT", "peran pengirim harus dari sesi");
    assert.notEqual(isi.message.senderName, "Ns. Ratna Dewi", "nama pengirim harus dari sesi");
  });

  test("pemesanan selalu menjadi milik yang membuatnya, bukan yang disebut di badan permintaan", async () => {
    const pasien = await masuk(AKUN.pasien);
    const isi = diterima(
      await pasien.aksi({
        action: "CREATE_BOOKING",
        patientId: 9999,
        patientName: "Orang Lain",
        serviceId: 1,
        serviceName: "Perawatan luka",
        serviceCategory: "WOUND_CARE",
        addressText: "Jl. Contoh, Kota Malang",
        scheduledDate: "2026-12-01",
        scheduledTimeSlot: "09:00 - 10:00",
      }),
      "membuat pemesanan"
    );
    assert.equal(isi.booking.patientId, 1, "pemilik pemesanan harus diambil dari sesi");
    assert.notEqual(isi.booking.patientName, "Orang Lain");
  });
});

describe("Apa yang boleh dilihat", () => {
  /**
   * Sebelum 8 September 2026, GET /api/platform mengembalikan SELURUH isi
   * basis data ke browser mana pun tanpa login: foto luka, teks persetujuan,
   * nomor telepon, alamat + koordinat, catatan klinis, tarif semua orang.
   */
  test("tamu tidak menerima satu pun baris milik pasien", async () => {
    const r = await tamu().ambil("/api/platform");
    diterima(r, "memuat data sebagai tamu");
    for (const tabel of [
      "bookings",
      "taskPhotos",
      "clinicalNotes",
      "consents",
      "visitReports",
      "users",
      "addresses",
      "dependents",
      "quoteItems",
      "auditLogs",
      "notifications",
      "messages",
      "woundAssessments",
      "woundTimelineEntries",
    ]) {
      assert.equal(
        (r.isi[tabel] ?? []).length,
        0,
        `tamu menerima ${(r.isi[tabel] ?? []).length} baris dari "${tabel}" — seharusnya nol`
      );
    }
    assert.ok((r.isi.services ?? []).length > 0, "katalog layanan memang boleh terbuka");
  });

  test("kartu perawat untuk umum tidak memuat nomor STR/SIP maupun userId", async () => {
    const r = await tamu().ambil("/api/platform");
    const teks = JSON.stringify(r.isi.providers ?? []);
    assert.doesNotMatch(teks, /licenseNumber/, "nomor STR tidak boleh keluar ke publik");
    assert.doesNotMatch(teks, /sipNumber/, "nomor SIP tidak boleh keluar ke publik");
    assert.doesNotMatch(teks, /userId/, "penghubung ke akun tidak boleh keluar ke publik");
  });

  test("hash kata sandi tidak pernah keluar dari server — bahkan ke admin", async () => {
    for (const siapa of [AKUN.pasien, AKUN.perawat, AKUN.admin]) {
      const s = await masuk(siapa);
      const r = await s.ambil("/api/platform");
      const teks = JSON.stringify(r.isi);
      assert.doesNotMatch(teks, /passwordHash/, `hash sandi terkirim ke ${siapa}`);
      assert.doesNotMatch(teks, /scrypt\$/, `hash sandi terkirim ke ${siapa}`);
    }
  });

  test("pasien baru tidak melihat satu pun data pasien lain", async () => {
    const nomor = `0857${Math.floor(1000000 + Math.random() * 8999999)}`;
    const baru = tamu();
    diterima(
      await baru.kirim("/api/auth", {
        aksi: "DAFTAR",
        nama: "Pasien Baru Uji",
        telepon: nomor,
        sandi: "kataSandiPanjang9",
      }),
      "mendaftar"
    );
    const r = await baru.ambil("/api/platform");
    assert.equal((r.isi.bookings ?? []).length, 0, "pasien baru melihat pemesanan orang lain");
    assert.equal((r.isi.taskPhotos ?? []).length, 0, "pasien baru melihat foto luka orang lain");
    assert.equal((r.isi.users ?? []).length, 1, "pasien baru hanya boleh melihat dirinya sendiri");
  });

  test("perawat tidak menerima jejak audit maupun tabel users", async () => {
    const s = await masuk(AKUN.perawat);
    const r = await s.ambil("/api/platform");
    assert.equal((r.isi.auditLogs ?? []).length, 0, "jejak audit adalah alat pengawasan admin");
    assert.ok((r.isi.users ?? []).length <= 1, "perawat hanya boleh melihat barisnya sendiri");
  });

  /**
   * Satu permintaan di antrean dilihat SETIAP perawat yang bertugas.
   * Mengirim alamat lengkapnya ke semuanya berarti membagikan alamat rumah
   * seorang pasien kepada orang-orang yang tidak akan pernah datang.
   */
  test("permintaan di antrean bersama disamarkan sampai diambil", async () => {
    const { id } = await siapkanPemesanan("MENUNGGU_TINJAUAN");
    const perawat = await masuk(AKUN.perawat2);
    const r = await perawat.ambil("/api/platform");
    const antre = (r.isi.bookings ?? []).find((b) => b.id === id);
    assert.ok(antre, "permintaan tidak sampai ke antrean perawat");
    assert.match(antre.patientName, /dibuka saat diambil/, "nama pasien belum boleh terbuka");
    assert.doesNotMatch(antre.addressText, /Bunga Coklat/, "alamat persis belum boleh terbuka");
  });
});

describe("Kepemilikan pemesanan", () => {
  test("pasien lain tidak bisa menyentuh pemesanan orang", async () => {
    const { id } = await siapkanPemesanan();

    const nomor = `0858${Math.floor(1000000 + Math.random() * 8999999)}`;
    const lain = tamu();
    await lain.kirim("/api/auth", {
      aksi: "DAFTAR",
      nama: "Pasien Lain Uji",
      telepon: nomor,
      sandi: "kataSandiPanjang9",
    });

    const percobaan = [
      { action: "CANCEL_BOOKING", bookingId: id, reason: "iseng" },
      { action: "SEND_MESSAGE", bookingId: id, content: "halo" },
      { action: "KIRIM_TESTIMONI", bookingId: id, bintang: 1, isi: "palsu", izinTayang: "BOLEH_NAMA" },
      {
        action: "PUTUSKAN_PENAWARAN",
        bookingId: id,
        setuju: true,
        namaTandaTangan: "Bukan Saya",
        hubungan: "Diri sendiri",
      },
    ];
    for (const isi of percobaan) {
      ditolak(await lain.aksi(isi), 403, `${isi.action} atas pemesanan orang lain`);
    }
    ditolak(
      await lain.kirim("/api/pembayaran", { bookingId: id }),
      403,
      "membayar pemesanan orang lain"
    );
  });

  test("perawat tidak bisa menutup kunjungan perawat lain", async () => {
    const { id } = await siapkanPemesanan();
    const lain = await masuk(AKUN.perawat2);
    ditolak(
      await lain.aksi({
        action: "SUBMIT_CLINICAL_NOTE",
        bookingId: id,
        assessmentSummary: "saya ambil alih",
      }),
      403,
      "perawat lain menulis catatan klinis"
    );
    ditolak(
      await lain.aksi({
        action: "SIMPAN_LAPORAN",
        bookingId: id,
        whatWasDone: "x",
        homeInstructions: "y",
      }),
      403,
      "perawat lain menutup kunjungan"
    );
  });
});
