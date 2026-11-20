/**
 * Uang.
 *
 * Sebelum 8 September 2026, menekan "Bayar" memanggil satu aksi yang
 * langsung menulis `paymentStatus: "LUNAS"`. Yang menyatakan uang sudah
 * berpindah adalah browser pasien — yang bisa memanggil aksi itu langsung
 * tanpa membayar apa pun.
 *
 * Akibatnya bukan salah catat. Status LUNAS itulah yang membuat perawat
 * berangkat, membeli bahan habis pakai dengan uangnya sendiri, dan
 * mengerjakan tindakan. Yang menanggung perawat.
 *
 * Tes di berkas ini yang menjaga tiga aturannya:
 *   1. nominal dihitung server
 *   2. yang menyatakan lunas hanya kabar bertanda tangan sah
 *   3. kabar yang sama dua kali tidak berakibat dua kali
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
  tamu,
  tandaTangan,
} from "./bantu.mjs";

/**
 * Membuat baris pembayaran lewat API, lalu mengambil nomor pesanannya.
 *
 * Kalau Midtrans tidak terjangkau (lingkungan uji tanpa jaringan keluar),
 * pembuatan transaksinya gagal — dan itu sendiri sudah satu tes: yang
 * penting TIDAK ADA yang ditandai lunas. Nomor pesanannya lalu disusun
 * dengan pola yang sama supaya tes webhook tetap bisa berjalan.
 */
async function tagihan() {
  const { id, kode, pasien } = await siapkanPemesanan();
  const r = await pasien.kirim("/api/pembayaran", { bookingId: id });
  return { id, kode, pasien, orderId: `${kode}-1`, hasil: r };
}

describe("Memulai pembayaran", () => {
  test("aksi BAYAR lama sudah dicabut — browser tidak bisa menandai lunas", async () => {
    const { id, pasien } = await siapkanPemesanan();
    const r = await pasien.aksi({ action: "BAYAR", bookingId: id, metode: "QRIS" });
    assert.equal(r.status, 410, `aksi BAYAR seharusnya sudah tidak ada, dapat ${r.status}`);

    const b = await lihatPemesanan(pasien, id);
    assert.equal(b.paymentStatus, "BELUM", "pemesanan tidak boleh berubah lunas");
  });

  test("tanpa masuk tidak bisa membuka halaman pembayaran", async () => {
    const { id } = await siapkanPemesanan();
    ditolak(await tamu().kirim("/api/pembayaran", { bookingId: id }), 401, "tamu membuka pembayaran");
  });

  test("nominal yang dikirim browser diabaikan", async () => {
    const { id, pasien } = await siapkanPemesanan();
    await pasien.kirim("/api/pembayaran", {
      bookingId: id,
      nominal: 1000,
      amount: 1000,
      gross_amount: 1000,
      amountIdr: 1000,
    });
    // Apa pun hasilnya (berhasil atau Midtrans tak terjangkau), yang dicatat
    // tidak boleh Rp1.000.
    const admin = await masuk(AKUN.admin);
    const r = await admin.ambil("/api/platform");
    const bayar = (r.isi.payments ?? []).filter((p) => p.bookingId === id);
    for (const p of bayar) {
      assert.equal(p.amountIdr, 460000, "nominal harus dihitung server dari rincian yang disetujui");
    }
  });

  test("pembayaran tidak bisa dimulai sebelum penawaran disetujui", async () => {
    const { id, pasien } = await siapkanPemesanan("DITAWARKAN");
    const r = await pasien.kirim("/api/pembayaran", { bookingId: id });
    ditolak(r, 409, "membayar penawaran yang belum disetujui");
  });

  test("kalau penyedia tidak terjangkau, tidak ada yang ditandai lunas", async () => {
    const { id, pasien, hasil } = await tagihan();
    if (hasil.status < 400) return; // penyedianya terjangkau — tidak berlaku
    assert.equal(hasil.status, 502, "kegagalan menghubungi penyedia harus 502");
    assert.match(
      JSON.stringify(hasil.isi),
      /tidak ada yang tertagih/i,
      "pesannya harus mengatakan tidak ada yang tertagih"
    );
    const b = await lihatPemesanan(pasien, id);
    assert.equal(b.paymentStatus, "BELUM");
    assert.notEqual(b.status, "DIBAYAR");
  });
});

describe("Kabar dari penyedia — tanda tangan", () => {
  /**
   * Alamat webhook BUKAN rahasia: ia tertulis di dasbor Midtrans dan bisa
   * dipanggil siapa pun di internet. Yang membedakan kabar sungguhan dari
   * kabar palsu hanya tanda tangannya.
   */
  const palsu = [
    ["tanpa tanda tangan sama sekali", (o) => ({ ...kabar(o), signature_key: undefined })],
    ["tanda tangan asal-asalan", (o) => ({ ...kabar(o), signature_key: "a".repeat(128) })],
    ["tanda tangan kosong", (o) => ({ ...kabar(o), signature_key: "" })],
    [
      "tanda tangan dari kunci tebakan",
      (o) => ({ ...kabar(o), signature_key: tandaTangan(o, "200", "460000.00", "kunci-tebakan") }),
    ],
    [
      "tanda tangan sah tapi untuk nominal lain",
      (o) => ({ ...kabar(o), gross_amount: "1000.00", signature_key: tandaTangan(o, "200", "460000.00") }),
    ],
  ];

  for (const [nama, buat] of palsu) {
    test(`kabar palsu ditolak — ${nama}`, async () => {
      const { id, pasien, orderId } = await tagihan();
      const r = await kirimKabar(buat(orderId));
      ditolak(r, 401, `kabar palsu: ${nama}`);

      const b = await lihatPemesanan(pasien, id);
      assert.equal(b.paymentStatus, "BELUM", "kabar palsu tidak boleh melunaskan apa pun");
      assert.notEqual(b.status, "DIBAYAR");
    });
  }

  test("kabar palsu tetap dicatat, supaya percobaannya terlihat", async () => {
    const { orderId } = await tagihan();
    await kirimKabar({ ...kabar(orderId), signature_key: "b".repeat(128) });

    const admin = await masuk(AKUN.admin);
    const r = await admin.ambil("/api/platform");
    const ditolakSemua = (r.isi.paymentEvents ?? []).filter(
      (e) => e.outcome === "DITOLAK_TANDA_TANGAN"
    );
    assert.ok(
      ditolakSemua.length > 0,
      "percobaan dengan tanda tangan salah harus tercatat — tanpa itu tidak ada yang tahu ada yang mencoba"
    );
  });
});

describe("Kabar dari penyedia — isinya", () => {
  test("nominal yang dikabarkan harus cocok dengan yang dicatat", async () => {
    const { id, pasien, orderId } = await tagihan();
    // Tanda tangan SAH untuk nominal kecil: menirukan penyedia yang
    // mengabarkan angka berbeda dari yang dicatat saat transaksi dibuat.
    const r = await kirimKabar(
      kabar(orderId, { gross_amount: "1000.00", signature_key: tandaTangan(orderId, "200", "1000.00") })
    );
    assert.equal(r.status, 200, "kabar bertanda tangan sah tetap diterima badannya");
    assert.match(JSON.stringify(r.isi), /ditahan/i, "nominal tidak cocok harus ditahan");

    const b = await lihatPemesanan(pasien, id);
    assert.equal(b.paymentStatus, "BELUM", "nominal tidak cocok tidak boleh melunaskan");
  });

  test("nomor pesanan yang tidak dikenal ditahan", async () => {
    const asing = "NHC-9999-0000-1";
    const r = await kirimKabar(kabar(asing));
    assert.equal(r.status, 200);
    assert.match(JSON.stringify(r.isi), /ditahan|tidak dikenali/i);
  });

  /**
   * `capture` + `fraud_status: challenge` BUKAN lunas — Midtrans sedang
   * meminta seseorang memutuskan. Memperlakukannya sebagai lunas berarti
   * perawat berangkat untuk transaksi yang mungkin dibatalkan.
   */
  test("capture + challenge tidak dianggap lunas", async () => {
    const { id, pasien, orderId } = await tagihan();
    const r = await kirimKabar(
      kabar(orderId, { transaction_status: "capture", fraud_status: "challenge" })
    );
    diterima(r, "kabar challenge");
    assert.notEqual(r.isi.status, "LUNAS", "challenge bukan lunas");

    const b = await lihatPemesanan(pasien, id);
    assert.equal(b.paymentStatus, "BELUM");
  });

  test("status yang tidak dikenali tidak ditebak sebagai gagal", async () => {
    const { orderId } = await tagihan();
    const r = await kirimKabar(kabar(orderId, { transaction_status: "status_baru_dari_midtrans" }));
    diterima(r, "kabar berstatus asing");
    assert.equal(
      r.isi.status,
      "PERLU_TINJAUAN",
      "status asing harus memanggil orang — menebaknya 'gagal' berarti membatalkan kunjungan orang yang sudah membayar"
    );
  });

  /**
   * Pembayaran gagal bukan berarti pasiennya batal — sering artinya
   * saldonya kurang atau kode QR-nya lewat batas waktu. Yang membatalkan
   * setelah 24 jam adalah tugas terjadwal, dengan tenggat yang sudah
   * diketahui pasien.
   */
  test("pembayaran kedaluwarsa tidak membatalkan kunjungan", async () => {
    const { id, pasien, orderId } = await tagihan();
    diterima(
      await kirimKabar(
        kabar(orderId, {
          transaction_status: "expire",
          status_code: "407",
          signature_key: tandaTangan(orderId, "407", "460000.00"),
        })
      ),
      "kabar expire"
    );
    const b = await lihatPemesanan(pasien, id);
    assert.equal(b.status, "DISETUJUI", "jadwalnya harus tetap ditahan");
    assert.notEqual(b.sengketa, true, "kedaluwarsa biasa bukan sengketa");
  });
});

describe("Kabar berulang dan keluar urutan", () => {
  test("alur normal: pending lalu settlement melunaskan sekali", async () => {
    const { id, pasien, orderId } = await tagihan();

    diterima(
      await kirimKabar(
        kabar(orderId, {
          transaction_status: "pending",
          status_code: "201",
          signature_key: tandaTangan(orderId, "201", "460000.00"),
        })
      ),
      "kabar pending"
    );
    let b = await lihatPemesanan(pasien, id);
    assert.equal(b.paymentStatus, "BELUM", "pending belum lunas");

    const r = await kirimKabar(kabar(orderId));
    diterima(r, "kabar settlement");
    assert.equal(r.isi.status, "LUNAS");

    b = await lihatPemesanan(pasien, id);
    assert.equal(b.paymentStatus, "LUNAS");
    assert.equal(b.status, "DIBAYAR");
  });

  /**
   * Penyedia MENGULANG kirimannya kalau jawaban server tidak sampai —
   * perilaku yang benar, bukan gangguan.
   */
  test("kabar yang sama tiga kali hanya berakibat sekali", async () => {
    const { id, kode, pasien, orderId } = await tagihan();
    await kirimKabar(kabar(orderId));

    /**
     * Hanya pemberitahuan yang menyebut pesanan INI. Berkas tes lain berjalan
     * bersamaan (node --test menjalankan berkas secara paralel) dan ikut
     * menambah pemberitahuan admin — Woundex MERAH, misalnya. Menghitung
     * semuanya membuat tes ini sesekali merah tanpa ada yang rusak
     * (pernah: 261 !== 262 di CI, sementara jalannya sebelumnya hijau).
     */
    const admin = await masuk(AKUN.admin);
    const milikPesanan = async () =>
      ((await admin.ambil("/api/platform")).isi.notifications ?? []).filter((n) =>
        `${n.title} ${n.message}`.includes(kode)
      ).length;
    const sebelum = await milikPesanan();

    const kedua = await kirimKabar(kabar(orderId));
    const ketiga = await kirimKabar(kabar(orderId));
    assert.equal(kedua.isi.ganda, true, "kiriman kedua harus dikenali sebagai ulangan");
    assert.equal(ketiga.isi.ganda, true, "kiriman ketiga harus dikenali sebagai ulangan");

    const sesudah = await milikPesanan();
    assert.equal(sebelum, sesudah, "kiriman ulang tidak boleh menghasilkan pemberitahuan tambahan");

    const b = await lihatPemesanan(pasien, id);
    assert.equal(b.paymentStatus, "LUNAS");
  });

  /**
   * Urutan kabar dari penyedia TIDAK dijamin. Sebuah `pending` yang
   * tertahan di jaringan bisa sampai setelah `settlement`.
   *
   * Versi pertama memperlakukan ini sebagai keanehan: pembayaran yang sudah
   * lunas ditandai PERLU_TINJAUAN dan pemesanannya ditandai BERSENGKETA —
   * yang menghentikan penghapusan foto dan memanggil admin untuk sesuatu
   * yang sepenuhnya normal.
   */
  test("kabar pending yang tertinggal tidak menarik mundur yang sudah lunas", async () => {
    const { id, pasien, orderId } = await tagihan();
    await kirimKabar(kabar(orderId));

    const r = await kirimKabar(
      kabar(orderId, {
        transaction_status: "pending",
        status_code: "201",
        signature_key: tandaTangan(orderId, "201", "460000.00"),
      })
    );
    diterima(r, "kabar pending tertinggal");
    assert.ok(r.isi.tertinggal, "harus dikenali sebagai kabar tertinggal, bukan keanehan");

    const b = await lihatPemesanan(pasien, id);
    assert.equal(b.paymentStatus, "LUNAS", "tetap lunas");
    assert.notEqual(b.sengketa, true, "kabar tertinggal bukan sengketa — ini kejadian normal");
  });

  test("pemesanan yang sudah lunas tidak bisa dibayar lagi", async () => {
    const { id, pasien, orderId } = await tagihan();
    await kirimKabar(kabar(orderId));
    const r = await pasien.kirim("/api/pembayaran", { bookingId: id });
    ditolak(r, 409, "membayar yang sudah lunas");
    assert.match(JSON.stringify(r.isi), /sudah dibayar/i, "pesannya harus jelas supaya tidak dibayar dua kali");
  });
});

describe("Yang dilihat pasien tentang pembayarannya", () => {
  test("token pembayaran tidak ikut terkirim ke layar", async () => {
    const { pasien } = await tagihan();
    const r = await pasien.ambil("/api/platform");
    const teks = JSON.stringify(r.isi.payments ?? []);
    assert.doesNotMatch(teks, /snapToken/, "token pembayaran tidak perlu sampai ke layar");
  });

  test("pasien tidak menerima catatan kabar pembayaran — itu untuk admin", async () => {
    const { pasien } = await tagihan();
    const r = await pasien.ambil("/api/platform");
    assert.equal((r.isi.paymentEvents ?? []).length, 0);
  });
});
