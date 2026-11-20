/**
 * Asisten tanya-jawab.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  TES DI BERKAS INI MENJAGA SATU HAL DI ATAS SEGALANYA:                │
 * │  ORANG YANG MENULIS KEADAAN GAWAT DALAM BAHASA INDONESIA HARUS        │
 * │  DISURUH KE IGD.                                                      │
 * │                                                                       │
 * │  Sebelum 13 September 2026, tidak. Diukur pada aplikasi yang berjalan:│
 * │                                                                       │
 * │    "luka ibu berdarah hebat menyembur dan demam tinggi"               │
 * │        → tanda bahaya TIDAK menyala; pasien ditawari paket ganti      │
 * │          balut Rp 350.000.                                            │
 * │    "jari kaki hitam bau busuk"     → tidak menyala.                   │
 * │    "halo"                          → langsung direkomendasikan        │
 * │                                      layanan berikut harganya.        │
 * │                                                                       │
 * │  Sebabnya: seluruh daftar kata bahaya ditulis dalam bahasa Inggris    │
 * │  ("heavy bleeding", "high fever", "black toe") di aplikasi yang       │
 * │  seluruh pemakainya berbahasa Indonesia. Penjagaannya ada, terlihat   │
 * │  rapi di kode, dan tidak pernah sekali pun menyala.                   │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AKUN,
  ditolak,
  diterima,
  kabar,
  kirimKabar,
  majukanKunjungan,
  masuk,
  siapkanPemesanan,
  tamu,
} from "./bantu.mjs";

function tanya(p, teks) {
  return p.kirim("/api/ai/assistant", { mode: "INTAKE", prompt: teks });
}

/* ================================================================== */

describe("Tanda bahaya — bahasa yang benar-benar dipakai orang", () => {
  /**
   * Semuanya ditulis seperti orang menulis di ponsel: tanpa huruf besar,
   * disingkat, kadang salah ketik. Kalimat buku teks tidak akan pernah
   * masuk ke kotak ini.
   */
  const GAWAT = [
    "luka ibu saya berdarah hebat dan darahnya menyembur, demam tinggi",
    "darahnya muncrat terus gk berhenti",
    "pendarahan hebat tidak berhenti sejak tadi malam",
    "jari kaki ibu sudah hitam dan bau busuk",
    "lukanya membusuk dan bapak demam tinggi",
    "bapak tidak sadar sejak pagi",
    "ibu sesek nafas dan lukanya bengkak sekali",
    "merah menjalar naik dari luka ke betis",
    "anak saya habis sunat blm kencing dari kemarin",
    "luka bernanah, panas tinggi, menggigil",
  ];

  for (const kalimat of GAWAT) {
    test(`menyala: "${kalimat.slice(0, 44)}…"`, async () => {
      const r = await tanya(tamu(), kalimat);
      diterima(r, "bertanya ke asisten");
      assert.equal(
        r.isi.bahaya,
        true,
        `tanda bahaya HARUS menyala untuk kalimat ini — kalau tidak, orangnya menunggu kunjungan di rumah padahal seharusnya ke IGD`
      );
      assert.ok(r.isi.temuan?.length, "sebutkan apa yang dikenali, jangan hanya 'darurat'");
      assert.ok(
        /igd|119/i.test(String(r.isi.tindakan)),
        "harus menyebut IGD atau 119 — peringatan tanpa tujuan tidak menolong siapa pun"
      );
    });
  }

  /**
   * Yang PALING berbahaya bukan gagal menyala, melainkan menyala lalu
   * tetap menawarkan tombol pesan. Yang ditekan orang panik adalah tombol
   * yang ada di depannya.
   */
  test("saat bahaya, TIDAK ada layanan yang ditawarkan", async () => {
    const r = await tanya(tamu(), "darahnya menyembur tidak berhenti");
    assert.equal(r.isi.bahaya, true);
    assert.equal(
      r.isi.layanan,
      null,
      "jangan tawarkan layanan berbayar kepada orang yang sedang disuruh ke IGD"
    );
  });
});

describe("Tanda bahaya — yang TIDAK boleh menyala", () => {
  /**
   * Peringatan yang muncul untuk keluhan biasa akan diabaikan dalam
   * seminggu, dan peringatan yang diabaikan sama saja tidak ada.
   */
  const BIASA = [
    "luka jahitan sudah kering, tidak demam, mau kontrol saja",
    "tidak ada demam tinggi, cuma perlu ganti balut",
    "lukanya belum berbau, hanya agak basah",
    "anak saya mau sunat, tidak ada riwayat perdarahan",
  ];

  for (const kalimat of BIASA) {
    test(`tenang: "${kalimat.slice(0, 44)}…"`, async () => {
      const r = await tanya(tamu(), kalimat);
      assert.equal(
        r.isi.bahaya,
        false,
        `ini keluhan biasa — kalau ikut menyala, peringatan daruratnya kehilangan arti`
      );
    });
  }

  test("kata 'tidak' di depan gejala membalikkan artinya", async () => {
    const a = await tanya(tamu(), "demam tinggi");
    const b = await tanya(tamu(), "tidak demam tinggi");
    assert.equal(a.isi.bahaya, true, "'demam tinggi' harus menyala");
    assert.equal(b.isi.bahaya, false, "'tidak demam tinggi' tidak boleh menyala");
  });
});

describe("Memilihkan layanan", () => {
  test("sapaan kosong TIDAK menghasilkan rekomendasi berikut harganya", async () => {
    /**
     * Versi lama menjawab "halo" dengan paket lengkap beserta tarifnya.
     * Itu bukan membantu memilih, itu menjual sebelum ditanya.
     */
    for (const sapaan of ["halo", "tes", "assalamualaikum", "p"]) {
      const r = await tanya(tamu(), sapaan);
      assert.equal(
        r.isi.layanan,
        null,
        `"${sapaan}" belum menyebut keluhan apa pun — jangan menebak layanannya`
      );
      assert.ok(r.isi.pertanyaan?.length, "balas dengan pertanyaan, bukan tebakan");
    }
  });

  test("keluhan yang tidak dikenali dijawab pertanyaan, bukan tebakan", async () => {
    const r = await tanya(tamu(), "saya mau tanya tentang jadwal hari minggu");
    assert.equal(r.isi.layanan, null, "jangan memaksakan satu layanan untuk kalimat yang tidak jelas");
    assert.ok(r.isi.pertanyaan?.length);
  });

  test("luka diabetes diarahkan ke layanan luka diabetes", async () => {
    const r = await tanya(tamu(), "luka di kaki ibu saya sudah 2 minggu tidak sembuh, beliau diabetes");
    assert.equal(r.isi.bahaya, false);
    assert.equal(r.isi.layanan?.slug, "diabetic-ulcer-care");
  });

  test("luka baring punya layanannya sendiri", async () => {
    /**
     * Layanan luka tekan ADA di tabel layanan, tetapi versi lama tidak
     * pernah bisa menyebutnya — daftar di dalam chatbot hanya memuat dua
     * dari lima layanan. Dua layanan lainnya tidak pernah direkomendasikan
     * kepada siapa pun.
     */
    const r = await tanya(tamu(), "bapak stroke, berbaring lama, ada luka di bokong");
    assert.equal(r.isi.layanan?.slug, "pressure-injury-care");
  });

  test("umur memisahkan sunat anak dari sunat dewasa", async () => {
    const anak = await tanya(tamu(), "anak saya umur 9 tahun mau sunat di rumah");
    assert.equal(anak.isi.layanan?.slug, "pediatric-circumcision-klamp");

    const dewasa = await tanya(tamu(), "saya umur 35 tahun mau sunat di rumah");
    assert.equal(
      dewasa.isi.layanan?.slug,
      "adult-circumcision-laser",
      "bapak 35 tahun tidak boleh ditawari paket klem anak"
    );
  });

  test("sunat tanpa keterangan umur ditanya dulu, bukan ditebak", async () => {
    const r = await tanya(tamu(), "mau sunat di rumah");
    assert.equal(r.isi.layanan, null, "umurnya menentukan metodenya — tanya dulu");
    assert.ok(r.isi.pertanyaan.some((q) => /umur|anak|dewasa/i.test(q)));
  });

  test("harga yang disebut sama dengan harga di tabel layanan", async () => {
    /**
     * Versi lama menyimpan harganya sendiri di dalam jawaban chatbot
     * (Rp 1.650.000 dan Rp 420.000 tertulis mati di berkas API). Menaikkan
     * tarif di tabel layanan tidak mengubah angka yang dilihat pasien di
     * percakapan — dua harga untuk satu layanan, dan sengketa yang
     * menunggu terjadi.
     */
    const r = await tanya(tamu(), "luka diabetes di kaki");
    const daftar = (await tamu().ambil("/api/platform")).isi.services ?? [];
    const asli = daftar.find((s) => s.slug === r.isi.layanan.slug);
    assert.ok(asli, "layanannya harus ada di tabel layanan");
    assert.equal(
      r.isi.layanan.basePriceIdr,
      asli.basePriceIdr,
      "harga di percakapan harus sama persis dengan harga di tabel layanan"
    );
    assert.equal(r.isi.layanan.name, asli.name, "namanya juga");
  });
});

describe("Perapi catatan perawat", () => {
  const CATATAN =
    "pasien mengeluh nyeri berkurang\nluka 3 x 2 cm, dasar granulasi, eksudat sedikit\nganti balut dengan foam, kontrol 3 hari lagi";

  test("tamu tidak bisa memakainya sama sekali", async () => {
    /**
     * Ini alat penulis rekam medis. Sebelum ini, siapa pun tanpa masuk
     * bisa memanggilnya.
     */
    ditolak(
      await tamu().kirim("/api/ai/assistant", { mode: "SOAP_STRUCTURER", roughNotes: CATATAN }),
      403,
      "tamu memakai perapi catatan"
    );
  });

  test("pasien juga tidak bisa", async () => {
    const pasien = await masuk(AKUN.pasien);
    ditolak(
      await pasien.kirim("/api/ai/assistant", { mode: "SOAP_STRUCTURER", roughNotes: CATATAN }),
      403,
      "pasien memakai perapi catatan"
    );
  });

  test("TIDAK menambahkan satu angka pun yang tidak ditulis perawat", async () => {
    /**
     * Ini tes yang paling penting di berkas ini.
     *
     * Versi lama mengembalikan kalimat yang SAMA apa pun yang ditulis
     * perawat: "Dimensions measured at approximately 2.8 cm x 1.8 cm x
     * 0.3 cm. Tissue composition: 85% healthy pink-red granulation
     * tissue…" — ukuran yang tidak pernah diukur, persentase yang tidak
     * pernah dihitung, di dalam dokumen yang ditandatangani perawat
     * dengan nomor STR-nya.
     *
     * Rekam medis harus memuat apa yang benar-benar dikerjakan
     * (Permenkes 24/2022 Pasal 26). Angka karangan di sana bukan
     * "bantuan menulis" — itu keterangan palsu, dan yang menanggung
     * adalah perawat yang menandatanganinya.
     */
    const perawat = await masuk(AKUN.perawat);
    const r = diterima(
      await perawat.kirim("/api/ai/assistant", {
        mode: "SOAP_STRUCTURER",
        roughNotes: "ganti balut, luka bersih",
      }),
      "merapikan catatan pendek"
    );

    const semua = JSON.stringify(r.soap);
    assert.doesNotMatch(
      semua,
      /2[.,]8|1[.,]8|85\s*%|granulasi|slough/i,
      "ada isi klinis yang TIDAK ditulis perawat — perapi catatan tidak boleh mengarang apa pun"
    );

    /** Setiap angka yang muncul harus sudah ada di catatan aslinya. */
    const angkaKeluar = (semua.match(/\d+/g) ?? []).filter((n) => n.length > 1);
    assert.deepEqual(angkaKeluar, [], "tidak ada angka di catatan asli, jadi tidak boleh ada angka di hasilnya");
  });

  test("kalimat perawat disalin apa adanya ke kotak yang tepat", async () => {
    const perawat = await masuk(AKUN.perawat);
    const r = diterima(
      await perawat.kirim("/api/ai/assistant", { mode: "SOAP_STRUCTURER", roughNotes: CATATAN }),
      "merapikan catatan"
    );

    assert.ok(
      r.soap.subjektif.join(" ").includes("nyeri berkurang"),
      "keluhan pasien masuk ke bagian subjektif"
    );
    assert.ok(
      r.soap.objektif.join(" ").includes("3 x 2 cm"),
      "hasil pengukuran masuk ke bagian objektif — dan angkanya angka perawat sendiri"
    );
    /**
     * Kalimatnya utuh, KOMANYA IKUT. Sempat dipecah pada koma juga, dan
     * yang tersimpan jadi "luka 3 x 2 cm dasar granulasi eksudat sedikit"
     * — kalimat yang tidak pernah ditulis perawat, di dokumen yang ia
     * tandatangani.
     */
    assert.ok(
      r.soap.objektif.some((k) => k.includes("3 x 2 cm, dasar granulasi")),
      "kalimat perawat harus utuh apa adanya, termasuk komanya"
    );
    assert.ok(
      r.soap.rencana.join(" ").includes("kontrol 3 hari lagi"),
      "rencana kunjungan berikutnya masuk ke bagian rencana"
    );

    /** Bagian yang tidak ditulis dibiarkan KOSONG, bukan diisi kalimat. */
    assert.deepEqual(
      r.soap.asesmen,
      [],
      "perawat tidak menulis kesan, jadi bagian asesmen harus kosong — bukan diisi kalimat yang enak dibaca"
    );
    assert.ok(r.kosong.asesmen, "sertakan keterangan bahwa bagian itu masih harus diisi sendiri");
  });

  test("catatan kosong ditolak, bukan dijawab karangan", async () => {
    const perawat = await masuk(AKUN.perawat);
    ditolak(
      await perawat.kirim("/api/ai/assistant", { mode: "SOAP_STRUCTURER", roughNotes: "   " }),
      400,
      "merapikan catatan kosong"
    );
  });
});

describe("Batas permintaan", () => {
  test("permintaan bertubi-tubi dari satu alamat akhirnya ditolak", async () => {
    /**
     * Dikirim dengan alamat palsu sendiri lewat X-Forwarded-For, supaya
     * tes ini tidak menghabiskan jatah tes-tes lain di berkas ini —
     * pelajaran dari kali pertama berkas ini dijalankan, ketika seluruh
     * tes setelah tanda bahaya gagal dengan 429 dan sekilas terlihat
     * seperti asistennya yang rusak.
     */
    const p = tamu();
    const alamat = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
    let terakhir = 0;
    for (let i = 0; i < 70; i++) {
      const r = await p.minta("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": alamat },
        body: { mode: "INTAKE", prompt: "luka diabetes" },
      });
      terakhir = r.status;
      if (r.status === 429) break;
    }
    assert.equal(
      terakhir,
      429,
      "70 permintaan dalam sekejap dari satu alamat harus ditolak — tanpa batas, satu skrip bisa membebani basis data yang sama yang dipakai pasien sungguhan"
    );
  });
});

describe("Yang dikatakan asisten tentang dirinya", () => {
  test("tidak mengaku AI, dan selalu menyertakan sangkalan", async () => {
    const r = await tanya(tamu(), "luka diabetes di kaki");
    assert.ok(r.isi.sangkalan, "setiap jawaban harus membawa sangkalannya");
    assert.match(
      String(r.isi.sangkalan),
      /bukan diagnosis|bukan pemeriksaan/i,
      "katakan terus terang bahwa ini bukan diagnosis"
    );
  });
});

describe("Catatan klinis tidak boleh diisi angka yang tidak ada", () => {
  /**
   * Sampai 13 September 2026 penyimpanan catatan klinis berbunyi
   * `painScorePost: Number(painScorePost) || 2`.
   *
   * Artinya dua hal sekaligus, dan dua-duanya salah:
   *   - skala nyeri yang DIKOSONGKAN tersimpan sebagai 2;
   *   - skala nyeri 0 — yang justru berarti "pasien tidak nyeri" —
   *     juga tersimpan sebagai 2.
   *
   * Angka 2 itu tidak pernah ditanyakan kepada siapa pun dan tidak bisa
   * dibedakan dari angka yang benar-benar diukur. Ia ditulis untuk
   * menghindari galat basis data, dan yang dihasilkannya adalah
   * keterangan palsu yang rapi, di dokumen yang ditandatangani perawat
   * dengan nomor STR-nya.
   */
  async function kunjunganSiapDicatat() {
    const { id, kode, pasien, perawat } = await siapkanPemesanan();
    await pasien.kirim("/api/pembayaran", { bookingId: id });
    diterima(await kirimKabar(kabar(`${kode}-1`)), "pembayaran masuk");
    await majukanKunjungan(perawat, id);
    return { id, perawat };
  }

  const ISI = {
    assessmentSummary: "Dasar luka merah, tepi rata.",
    woundDimensions: "3 cm x 2 cm",
    exudateLevel: "bening sedikit",
    proceduresPerformed: "Dibilas NaCl, dipasang foam.",
    suppliesUsed: "NaCl 0,9%, foam",
    homecareInstructions: "Jaga balutan kering.",
  };

  test("skala nyeri yang dikosongkan DITOLAK, bukan diisi 2 diam-diam", async () => {
    const { id, perawat } = await kunjunganSiapDicatat();
    ditolak(
      await perawat.aksi({ action: "SUBMIT_CLINICAL_NOTE", bookingId: id, ...ISI }),
      400,
      "menyimpan catatan klinis tanpa skala nyeri"
    );
  });

  test("skala nyeri 0 diterima apa adanya — 0 berarti tidak nyeri", async () => {
    const { id, perawat } = await kunjunganSiapDicatat();
    diterima(
      await perawat.aksi({
        action: "SUBMIT_CLINICAL_NOTE",
        bookingId: id,
        ...ISI,
        painScorePost: 0,
      }),
      "menyimpan catatan dengan skala nyeri 0"
    );

    const admin = await masuk(AKUN.admin);
    const r = await admin.ambil("/api/platform");
    const catatan = (r.isi.clinicalNotes ?? []).find((c) => c.bookingId === id);
    assert.ok(catatan, "catatannya harus tersimpan");
    assert.equal(
      catatan.painScorePost,
      0,
      "0 harus tersimpan sebagai 0 — kalau berubah jadi 2, rekam medisnya memuat angka yang tidak pernah dilaporkan siapa pun"
    );
  });

  test("skala nyeri di luar 0–10 ditolak", async () => {
    const { id, perawat } = await kunjunganSiapDicatat();
    ditolak(
      await perawat.aksi({
        action: "SUBMIT_CLINICAL_NOTE",
        bookingId: id,
        ...ISI,
        painScorePost: 99,
      }),
      400,
      "skala nyeri 99"
    );
  });
});

/* ================================================================== */
/*  LAPISAN MODEL (AI)                                                 */
/* ================================================================== */

/**
 * Model dinyalakan selama tes lewat penyedia tiruan di `model-tiruan.mjs`.
 *
 * Yang diuji di sini bukan "apakah AI-nya pintar" — itu bukan sesuatu yang
 * bisa dijamin tes. Yang diuji adalah BATAS KEWENANGANNYA: apa yang boleh
 * ia ubah, apa yang tidak, dan apa yang terjadi ketika ia gagal.
 */
const MODEL = process.env.UJI_MODEL_BASIS ?? "http://127.0.0.1:3212";

async function aturModel(jawaban) {
  await fetch(`${MODEL}/_atur`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jawaban),
  });
}

async function bersihkanModel() {
  await fetch(`${MODEL}/_bersihkan`, { method: "POST" });
}

async function catatanModel() {
  const r = await fetch(`${MODEL}/_catatan`);
  return r.json();
}

describe("Batas kewenangan model", () => {
  test("keluhan gawat TIDAK PERNAH dikirim ke penyedia model", async () => {
    /**
     * Ini bukan sekadar "jawabannya diabaikan". Kalimat orang yang sedang
     * gawat tidak boleh keluar dari server sama sekali — dan menunggu
     * jawaban penyedia luar negeri untuk memutuskan apakah seseorang
     * perlu ke IGD berarti menambahkan beberapa detik, dan satu titik
     * kegagalan baru, ke jalur yang paling tidak boleh gagal.
     */
    await bersihkanModel();
    const r = await tanya(tamu(), "darahnya menyembur tidak berhenti");
    assert.equal(r.isi.bahaya, true);

    const c = await catatanModel();
    assert.equal(
      c.length,
      0,
      "penyedia model tidak boleh menerima satu permintaan pun untuk keluhan yang sudah dinyatakan gawat"
    );
  });

  test("model TIDAK BISA mencabut tanda bahaya dari daftar kata", async () => {
    await bersihkanModel();
    await aturModel({
      jenis: "JSON",
      isi: {
        gawat: false,
        alasanGawat: "",
        slugLayanan: "post-op-wound-care",
        balasan: "Tenang saja, ini keluhan biasa.",
        pertanyaan: ["Sudah berapa lama?"],
      },
    });

    const r = await tanya(tamu(), "jari kaki ibu sudah hitam dan bau busuk");
    assert.equal(
      r.isi.bahaya,
      true,
      "daftar kata menyala — apa pun kata model, jawabannya tetap tanda bahaya"
    );
    assert.equal(r.isi.layanan, null, "dan tetap tidak ada layanan yang ditawarkan");
  });

  test("model BOLEH menaikkan tanda bahaya yang tidak dikenali daftar kata", async () => {
    /**
     * Di sinilah model benar-benar menambah nilai: kalimat gawat yang
     * tidak memakai satu pun kata di daftar. Menaikkan itu aman —
     * kesalahannya berarti seseorang pergi ke IGD padahal tidak perlu.
     */
    await bersihkanModel();
    await aturModel({
      jenis: "JSON",
      isi: {
        gawat: true,
        alasanGawat: "Kaki mendadak dingin dan pucat sejak semalam.",
        slugLayanan: null,
        balasan: "",
        pertanyaan: [],
      },
    });

    const r = await tanya(
      tamu(),
      "kaki ibu mendadak dingin dan pucat sejak semalam, rasanya kesemutan terus"
    );
    assert.equal(r.isi.bahaya, true, "model harus bisa menaikkan tanda bahaya");
    assert.equal(r.isi.dibantuModel, true, "dan barisnya menyebutkan itu datang dari model");
    assert.ok(
      /igd|119/i.test(String(r.isi.tindakan)),
      "kalimat tindakannya tetap kalimat aplikasi, bukan karangan model"
    );
    assert.equal(r.isi.layanan, null);
  });

  test("layanan karangan model dibuang, bukan dipercaya", async () => {
    await bersihkanModel();
    await aturModel({
      jenis: "JSON",
      isi: {
        gawat: false,
        alasanGawat: "",
        slugLayanan: "paket-emas-perawatan-luka-premium",
        balasan: "Saya sarankan paket emas kami.",
        pertanyaan: [],
      },
    });

    const r = await tanya(tamu(), "saya mau tanya tentang jadwal hari minggu");
    assert.equal(
      r.isi.layanan,
      null,
      "slug yang tidak ada di tabel layanan harus dibuang — kalau tidak, tombol pesannya menunjuk ke layanan yang tidak ada"
    );
  });

  test("harga tetap dari tabel layanan, bukan dari model", async () => {
    await bersihkanModel();
    await aturModel({
      jenis: "JSON",
      isi: {
        gawat: false,
        alasanGawat: "",
        slugLayanan: "diabetic-ulcer-care",
        balasan: "Harganya Rp 99.000 saja kok.",
        pertanyaan: [],
      },
    });

    const r = await tanya(tamu(), "luka diabetes di kaki");
    const daftar = (await tamu().ambil("/api/platform")).isi.services ?? [];
    const asli = daftar.find((s) => s.slug === "diabetic-ulcer-care");
    assert.equal(
      r.isi.layanan.basePriceIdr,
      asli.basePriceIdr,
      "tarif yang ditampilkan harus dari tabel layanan, berapa pun yang disebut model"
    );
  });
});

describe("Ketika model gagal", () => {
  /**
   * Model adalah tambahan, bukan penopang. Tidak ada satu pun keadaan di
   * mana kegagalan penyedia luar negeri boleh membuat pasien di Malang
   * melihat layar kosong.
   */
  for (const [nama, jawaban] of [
    ["penyedia mati", { jenis: "GALAT", status: 500 }],
    ["penyedia menolak kunci", { jenis: "GALAT", status: 401 }],
    ["penyedia menjawab bukan JSON", { jenis: "NGAWUR" }],
  ]) {
    test(`${nama} — pasien tetap menerima jawaban lengkap`, async () => {
      await bersihkanModel();
      await aturModel(jawaban);

      const r = await tanya(tamu(), "luka di kaki ibu saya sudah 2 minggu tidak sembuh, beliau diabetes");
      diterima(r, "bertanya saat penyedia model bermasalah");
      assert.equal(
        r.isi.layanan?.slug,
        "diabetic-ulcer-care",
        "jalur pencocokan kata harus mengambil alih, bukan menyerah"
      );
      assert.ok(r.isi.sangkalan, "sangkalannya tetap ikut");
    });
  }

  test("penyedia yang LAMBAT tidak membuat pasien menunggu lama", async () => {
    /**
     * Yang menunggu adalah orang yang sedang cemas memandangi luka.
     * Jawaban bagus yang datang 30 detik lagi lebih buruk daripada
     * jawaban sederhana sekarang — ia sudah menutup aplikasinya.
     *
     * Penyedia tiruan sengaja menahan jawabannya 15 detik; batas
     * aplikasi 8 detik. Yang diperiksa: pasien tetap dijawab, dan
     * menunggunya jauh di bawah 15 detik.
     */
    await bersihkanModel();
    await aturModel({ jenis: "LAMBAT" });

    const mulai = Date.now();
    const r = await tanya(tamu(), "habis operasi caesar, jahitannya perlu diganti balut");
    const lama = Date.now() - mulai;

    diterima(r, "bertanya saat penyedia model menggantung");
    assert.equal(r.isi.layanan?.slug, "post-op-wound-care", "jalur pencocokan kata mengambil alih");
    assert.ok(
      lama < 12_000,
      `pasien menunggu ${Math.round(lama / 1000)} detik — batas modelnya harus memutus jauh sebelum penyedianya menyerah`
    );
  });

  test("tanda bahaya tetap menyala walau penyedia model mati", async () => {
    /**
     * Yang paling penting dari seluruh berkas ini: jalur darurat sama
     * sekali tidak bergantung pada penyedia luar.
     */
    await bersihkanModel();
    await aturModel({ jenis: "GALAT", status: 500 });

    const r = await tanya(tamu(), "darahnya muncrat terus gk berhenti");
    assert.equal(r.isi.bahaya, true);
    assert.ok(/igd|119/i.test(String(r.isi.tindakan)));
  });

  test("jawaban model yang dibungkus pagar kode tetap terbaca", async () => {
    await bersihkanModel();
    await aturModel({
      jenis: "JSON",
      pagar: true,
      isi: {
        gawat: false,
        alasanGawat: "",
        slugLayanan: "pressure-injury-care",
        balasan: "Baik, ini cocok untuk luka karena lama berbaring.",
        pertanyaan: ["Sudah berapa lama beliau berbaring?"],
      },
    });

    const r = await tanya(tamu(), "ada luka di bokong karena lama tiduran");
    assert.equal(r.isi.layanan?.slug, "pressure-injury-care");
    assert.ok(r.isi.pertanyaan.includes("Sudah berapa lama beliau berbaring?"));
  });
});

describe("Apa yang keluar dari server", () => {
  test("nomor telepon dan surel di dalam keluhan TIDAK ikut terkirim", async () => {
    /**
     * Orang sering menuliskan nomornya sendiri di dalam keluhan ("tolong
     * hubungi saya di 0812…"). Tanpa penyamaran, nomor itu ikut keluar ke
     * penyedia di luar negeri tanpa ada yang berniat mengirimnya —
     * padahal data kesehatan adalah data pribadi spesifik menurut UU
     * 27/2022 Pasal 4 ayat (2).
     */
    await bersihkanModel();
    await tanya(
      tamu(),
      "luka jahitan saya perlu diganti balut, tolong hubungi saya di 081234567890 atau siti@contoh.com"
    );

    const c = await catatanModel();
    assert.ok(c.length > 0, "permintaannya memang dikirim ke penyedia");
    const dikirim = c.map((x) => x.teks).join(" ");
    assert.doesNotMatch(dikirim, /081234567890/, "nomor telepon tidak boleh ikut keluar");
    assert.doesNotMatch(dikirim, /siti@contoh\.com/, "surel tidak boleh ikut keluar");
    assert.match(dikirim, /ganti balut|jahitan/, "keluhannya sendiri memang perlu dikirim");
  });

  test("perapi catatan perawat TIDAK PERNAH menyentuh penyedia model", async () => {
    /**
     * Rekam medis tidak dikirim ke mana pun, dan tidak ditulis oleh model.
     * Permenkes 24/2022 Pasal 22 meminta data rekam medis disimpan di
     * dalam negeri; mengirim isinya ke penyedia luar untuk "dirapikan"
     * adalah persoalan yang sama dengan menyimpannya di sana.
     */
    await bersihkanModel();
    const perawat = await masuk(AKUN.perawat);
    diterima(
      await perawat.kirim("/api/ai/assistant", {
        mode: "SOAP_STRUCTURER",
        roughNotes: "luka 3 x 2 cm, dasar granulasi\nganti balut foam",
      }),
      "merapikan catatan"
    );

    const c = await catatanModel();
    assert.equal(
      c.length,
      0,
      "isi rekam medis tidak boleh keluar dari server — perapi catatan harus murni pencocokan kata"
    );
  });
});
