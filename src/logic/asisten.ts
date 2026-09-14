/**
 * Asisten tanya-jawab sebelum memesan, dan perapi catatan untuk perawat.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  INI BUKAN AI, DAN TIDAK BOLEH MENGAKU AI.                            │
 * │                                                                       │
 * │  Yang ada di sini adalah pencocokan kata yang ditulis tangan, dengan  │
 * │  daftar yang bisa dibaca dan diperdebatkan siapa pun. Versi           │
 * │  sebelumnya menyebut dirinya "AI Clinical Decision-Support            │
 * │  Assistant" padahal isinya persis pencocokan seperti ini — hanya      │
 * │  dalam bahasa Inggris, sehingga tidak satu pun kalimat pasien di      │
 * │  Malang yang pernah cocok.                                            │
 * │                                                                       │
 * │  Diukur 13 September 2026 pada aplikasi yang berjalan:                │
 * │    "luka ibu berdarah hebat menyembur dan demam tinggi"               │
 * │      → tanda bahaya TIDAK menyala, pasien malah ditawari paket        │
 * │        ganti balut.                                                   │
 * │    "jari kaki hitam bau busuk"  → tidak menyala.                      │
 * │    "halo"                       → langsung direkomendasikan layanan   │
 * │                                   berikut harganya.                   │
 * │                                                                       │
 * │  Mengaku AI membuat orang PERCAYA lebih dari yang pantas dipercaya.   │
 * │  Untuk hal yang salahnya bisa berarti orang terlambat ke IGD, itu     │
 * │  bukan soal pemasaran.                                                │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Dua aturan yang membentuk berkas ini:
 *
 * 1. LEBIH BAIK SALAH MENYURUH KE IGD daripada salah menenangkan. Orang
 *    yang disuruh ke IGD padahal tidak perlu kehilangan waktu dan biaya.
 *    Orang yang ditenangkan padahal perlu bisa kehilangan kakinya. Kedua
 *    kesalahan itu tidak setara, jadi ambangnya sengaja rendah.
 *
 * 2. TIDAK PERNAH MENGARANG. Kalau tidak cukup jelas, jawabannya adalah
 *    pertanyaan — bukan tebakan yang terdengar meyakinkan.
 */

/* ------------------------------------------------------------------ */
/* Menyamakan tulisan orang                                            */
/* ------------------------------------------------------------------ */

/**
 * Orang mengetik di ponsel, sambil panik, sering satu tangan.
 *
 * Daftar ini bukan "pembersih teks" umum — isinya singkatan dan salah
 * ketik yang memang lazim di pesan singkat berbahasa Indonesia. Tanpa ini,
 * "gk berhenti berdarah" tidak pernah cocok dengan "tidak berhenti".
 */
const SAMAKAN: [RegExp, string][] = [
  [/\btdk\b|\btdak\b|\bgk\b|\bga\b|\bgak\b|\bnggak\b|\bngga\b|\benggak\b|\btak\b/g, "tidak"],
  [/\byg\b/g, "yang"],
  [/\bsdh\b|\budh\b|\budah\b/g, "sudah"],
  [/\bblm\b|\bblum\b/g, "belum"],
  [/\bbgt\b|\bbanget\b/g, "sangat"],
  [/\bkluar\b|\bkeluar2\b/g, "keluar"],
  [/\bdrh\b/g, "darah"],
  [/\bdemem\b|\bdmam\b/g, "demam"],
  [/\bpanas\s*tinggi\b/g, "demam tinggi"],
  [/\bmeriang\b/g, "demam"],
  [/\bsesek\b/g, "sesak"],
  [/\bpipis\b|\bkencing\b|\bbuang\s*air\s*kecil\b|\bbak\b/g, "kencing"],
  [/\bmuncrat\b|\bmuncrat2\b|\bcrot\b/g, "menyembur"],
  [/\bngucur\b|\bmengucur\b|\bmengalir\s*deras\b/g, "menyembur"],
  [/\bbusuk\b|\bbacin\b|\bbangar\b/g, "busuk"],
  [/\bnanah\b|\bnanahnya\b/g, "nanah"],
  [/\bpingsan\b|\bsemaput\b|\btidak\s*sadarkan\s*diri\b/g, "tidak sadar"],
];

export function samakan(masukan: string): string {
  let t = String(masukan ?? "").toLowerCase();
  /** Tanda baca jadi spasi supaya "berdarah,demam" tetap dua kata. */
  t = t.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  for (const [dari, ke] of SAMAKAN) t = t.replace(dari, ke);
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Kata yang membalikkan arti, kalau berdiri tepat sebelum ungkapannya.
 *
 * Tanpa ini, "tidak ada demam tinggi" ikut menyalakan tanda bahaya —
 * dan asisten yang menyuruh semua orang ke IGD sama tidak bergunanya
 * dengan yang tidak pernah menyuruh siapa pun.
 *
 * Jangkauannya sengaja pendek (dua kata) dan tidak menangani kalimat
 * berbelit seperti "bukan berarti tidak berdarah". Itu disengaja: kalau
 * ragu, yang menang adalah tanda bahayanya.
 */
const PEMBALIK = ["tidak", "belum", "bukan", "tanpa", "kecuali"];
const JANGKAUAN_PEMBALIK = 2;

function adaUngkapan(teks: string, ungkapan: string): boolean {
  const kata = teks.split(" ");
  const cari = ungkapan.split(" ");
  for (let i = 0; i + cari.length <= kata.length; i++) {
    let cocok = true;
    for (let j = 0; j < cari.length; j++) {
      if (kata[i + j] !== cari[j]) {
        cocok = false;
        break;
      }
    }
    if (!cocok) continue;
    const sebelum = kata.slice(Math.max(0, i - JANGKAUAN_PEMBALIK), i);
    if (sebelum.some((k) => PEMBALIK.includes(k))) continue;
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Tanda bahaya                                                        */
/* ------------------------------------------------------------------ */

export type TandaBahaya = {
  nama: string;
  /** Ungkapan sebagaimana orang benar-benar menuliskannya. */
  ungkapan: string[];
  /** Ditunjukkan ke pasien: kenapa ini tidak boleh menunggu kunjungan. */
  sebab: string;
};

/**
 * Daftar ini pendek dengan sengaja.
 *
 * Yang masuk hanya keadaan yang, kalau benar, artinya menunggu kunjungan
 * ke rumah bisa merugikan orangnya secara permanen. Daftar panjang yang
 * menyalakan peringatan untuk keluhan biasa akan diabaikan orang dalam
 * seminggu — dan peringatan yang diabaikan sama saja tidak ada.
 */
export const TANDA_BAHAYA: TandaBahaya[] = [
  {
    nama: "Perdarahan yang tidak berhenti",
    ungkapan: [
      "darah menyembur",
      "berdarah menyembur",
      "menyembur",
      "perdarahan hebat",
      "pendarahan hebat",
      "berdarah hebat",
      "berdarah banyak",
      "darah banyak sekali",
      "darah tidak berhenti",
      "berdarah tidak berhenti",
      "darah terus keluar",
      "darah tidak mau berhenti",
    ],
    sebab: "Perdarahan yang menyembur atau tidak berhenti perlu ditekan dan dinilai langsung.",
  },
  {
    nama: "Demam tinggi",
    ungkapan: ["demam tinggi", "demam sangat", "demam dan menggigil", "menggigil hebat"],
    sebab:
      "Demam tinggi bersama luka bisa berarti infeksinya sudah menyebar ke seluruh tubuh, bukan hanya di lukanya.",
  },
  {
    nama: "Jaringan menghitam atau berbau",
    ungkapan: [
      "menghitam",
      "sudah hitam",
      "jari hitam",
      "kaki hitam",
      "warnanya hitam",
      "bau busuk",
      "berbau busuk",
      "membusuk",
      "busuk",
    ],
    sebab:
      "Jaringan yang menghitam atau berbau busuk bisa berarti jaringannya sudah mati, dan itu bisa menjalar cepat.",
  },
  {
    nama: "Kesadaran menurun",
    ungkapan: ["tidak sadar", "kejang", "linglung", "bicaranya melantur", "sulit dibangunkan"],
    sebab: "Perubahan kesadaran adalah keadaan gawat, apa pun penyebabnya.",
  },
  {
    nama: "Sesak napas atau nyeri dada",
    ungkapan: ["sesak napas", "sesak nafas", "susah bernapas", "nyeri dada", "dada sakit sekali"],
    sebab: "Sesak napas dan nyeri dada tidak pernah menjadi keluhan perawatan luka di rumah.",
  },
  {
    nama: "Kemerahan yang menjalar cepat",
    ungkapan: [
      "merah menjalar",
      "kemerahan menjalar",
      "menjalar ke atas",
      "menjalar cepat",
      "bengkak cepat",
      "bengkak sekali",
    ],
    sebab:
      "Kemerahan yang menjalar naik dari luka adalah tanda infeksi yang sedang bergerak, dan jamnya berarti.",
  },
  {
    nama: "Tidak bisa buang air kecil setelah sunat",
    ungkapan: [
      "tidak bisa kencing",
      "belum kencing",
      "susah kencing",
      "tidak keluar kencing",
    ],
    sebab:
      "Setelah sunat, tidak bisa buang air kecil berarti ada sumbatan atau pembengkakan yang harus segera dilihat.",
  },
];

export type HasilPeriksa = {
  bahaya: boolean;
  /** Nama tanda bahaya yang ditemukan — ditunjukkan apa adanya ke orangnya. */
  temuan: { nama: string; sebab: string }[];
};

export function periksaTandaBahaya(masukan: string): HasilPeriksa {
  const teks = samakan(masukan);
  const temuan: { nama: string; sebab: string }[] = [];
  for (const t of TANDA_BAHAYA) {
    if (t.ungkapan.some((u) => adaUngkapan(teks, samakan(u))))
      temuan.push({ nama: t.nama, sebab: t.sebab });
  }
  return { bahaya: temuan.length > 0, temuan };
}

export const PESAN_BAHAYA = {
  judul: "Ini sebaiknya jangan menunggu kunjungan ke rumah",
  tindakan:
    "Bawa sekarang ke IGD rumah sakit terdekat, atau telepon 119. Kalau ada perdarahan, tekan kuat dengan kain bersih selama perjalanan dan jangan dilepas untuk dilihat-lihat.",
  jujur:
    "Ini bukan diagnosis. Aplikasi ini hanya mengenali kata-kata yang Anda tulis, dan bisa saja keliru — tetapi untuk keluhan seperti ini, keliru menyuruh Anda ke IGD jauh lebih murah daripada keliru menyuruh Anda menunggu.",
};

/* ------------------------------------------------------------------ */
/* Memilihkan layanan                                                  */
/* ------------------------------------------------------------------ */

export type LayananRingkas = {
  id?: number;
  slug: string;
  name: string;
  category?: string | null;
  basePriceIdr?: number | null;
};

/**
 * Kata yang menunjuk ke satu layanan.
 *
 * Harganya TIDAK ditulis di sini. Versi sebelumnya menyimpan harga sendiri
 * di dalam jawaban chatbot — Rp 1.650.000 dan Rp 420.000 tertulis mati di
 * berkas API — sehingga menaikkan tarif di tabel layanan tidak mengubah
 * angka yang dilihat pasien di percakapan. Dua harga untuk satu layanan
 * adalah sengketa yang menunggu terjadi.
 */
const PETUNJUK: { slug: string; kata: string[] }[] = [
  {
    slug: "diabetic-ulcer-care",
    kata: [
      "diabetes", "diabetes melitus", "gula darah", "kencing manis", "diabetisi",
      "luka diabetes", "ulkus", "luka kaki", "kaki luka", "luka kronis",
      "luka lama", "luka tidak sembuh sembuh", "luka tidak kunjung sembuh",
    ],
  },
  {
    slug: "pressure-injury-care",
    kata: [
      "luka tekan", "dekubitus", "decubitus", "luka baring", "berbaring lama",
      "tirah baring", "stroke", "lumpuh", "tidak bisa bangun", "bokong luka",
      "punggung luka", "pantat luka",
    ],
  },
  {
    slug: "pediatric-circumcision-klamp",
    kata: [
      "sunat anak", "khitan anak", "sunat", "khitan", "supit", "klamp",
      "smart klamp", "super ring", "anak saya sunat",
    ],
  },
  {
    slug: "adult-circumcision-laser",
    kata: ["sunat dewasa", "khitan dewasa", "sunat laser", "laser", "sunat suami", "sunat saya"],
  },
  {
    slug: "post-op-wound-care",
    kata: [
      "pasca operasi", "habis operasi", "setelah operasi", "jahitan", "dijahit",
      "operasi caesar", "sesar", "luka jahit", "angkat jahitan", "ganti balut",
      "ganti perban", "luka operasi",
    ],
  },
];

/**
 * Umur mengalahkan kata "sunat" saja.
 *
 * "Sunat" cocok ke layanan anak dan dewasa sekaligus. Kalau umurnya
 * disebut, itu yang menentukan — supaya bapak 40 tahun tidak ditawari
 * paket Smart Klamp anak.
 */
function umurDisebut(teks: string): number | null {
  const m = teks.match(/(\d{1,2})\s*(tahun|thn|th)\b/);
  if (m) return Number(m[1]);
  if (/\b(bapak|suami|ayah|saya sendiri|dewasa|om|pak)\b/.test(teks)) return 30;
  if (/\b(anak|putra|balita|bayi|adik|ponakan|keponakan)\b/.test(teks)) return 8;
  return null;
}

export type Saran = {
  /** null berarti: belum cukup jelas, jangan menebak. */
  layanan: LayananRingkas | null;
  alasan: string;
  pertanyaan: string[];
};

/**
 * Kalimat pembuka yang tidak menyangkut keluhan apa pun — "halo", "tes",
 * "assalamualaikum". Versi sebelumnya menjawab ini dengan rekomendasi
 * layanan lengkap beserta harganya.
 */
const SAPAAN = ["halo", "hai", "hallo", "tes", "test", "assalamualaikum", "permisi", "p", "pagi", "siang", "malam", "sore"];

export function sarankanLayanan(masukan: string, daftar: LayananRingkas[]): Saran {
  const teks = samakan(masukan);
  const cari = (slug: string) => daftar.find((l) => l.slug === slug) ?? null;

  const kataSaja = teks.split(" ").filter(Boolean);
  const hanyaSapaan = kataSaja.length > 0 && kataSaja.every((k) => SAPAAN.includes(k));

  if (!teks || hanyaSapaan)
    return {
      layanan: null,
      alasan: "",
      pertanyaan: [
        "Ceritakan dulu keluhannya — ini tentang luka, atau tentang sunat?",
        "Untuk siapa perawatannya, dan di daerah mana? (Kota Malang, Kota Batu, Singosari, atau Kepanjen)",
      ],
    };

  const cocok = PETUNJUK.filter((p) => p.kata.some((k) => adaUngkapan(teks, samakan(k))));

  if (cocok.length === 0)
    return {
      layanan: null,
      alasan: "",
      pertanyaan: [
        "Boleh diceritakan lebih jelas? Misalnya: luka karena apa, sudah berapa lama, dan di bagian tubuh mana.",
        "Apakah ini perawatan luka, atau sunat?",
      ],
    };

  /** Sunat: umur yang menentukan, bukan urutan kata. */
  const adaSunat = cocok.some((c) => c.slug.includes("circumcision"));
  if (adaSunat) {
    const umur = umurDisebut(teks);
    if (umur === null)
      return {
        layanan: null,
        alasan: "",
        pertanyaan: [
          "Sunatnya untuk siapa — anak atau dewasa? Kalau anak, berapa umurnya?",
          "Ada riwayat gangguan pembekuan darah, alergi obat, atau kelainan bawaan?",
        ],
      };
    const slug = umur >= 15 ? "adult-circumcision-laser" : "pediatric-circumcision-klamp";
    const layanan = cari(slug);
    return {
      layanan,
      alasan:
        umur >= 15
          ? "Untuk usia remaja ke atas, yang biasa dipakai adalah metode laser bipolar."
          : "Untuk anak, yang biasa dipakai adalah klem sekali pakai (Super-Ring / Smart Klamp) — tanpa jahitan.",
      pertanyaan: [
        "Berapa berat badannya sekarang?",
        "Ada riwayat gangguan pembekuan darah, alergi obat, atau kelainan bawaan?",
        "Lebih enak dijadwalkan pagi (08.00–11.00) atau sore?",
      ],
    };
  }

  /**
   * Beberapa petunjuk cocok sekaligus — mis. "luka diabetes setelah
   * operasi". Yang dipilih adalah yang ungkapannya paling banyak kena,
   * dan kalau seri, yang paling spesifik (diabetes/luka tekan) di atas
   * perawatan luka umum.
   */
  const skor = cocok
    .map((c) => ({
      slug: c.slug,
      n: c.kata.filter((k) => adaUngkapan(teks, samakan(k))).length,
      umum: c.slug === "post-op-wound-care" ? 1 : 0,
    }))
    .sort((a, b) => b.n - a.n || a.umum - b.umum);

  const layanan = cari(skor[0].slug);
  if (!layanan)
    return {
      layanan: null,
      alasan: "",
      pertanyaan: ["Boleh diceritakan lebih jelas keluhannya?"],
    };

  const ALASAN: Record<string, string> = {
    "diabetic-ulcer-care":
      "Luka pada penyandang diabetes butuh penanganan yang berbeda — pembersihan bertahap, pemilihan balutan, dan pengurangan tekanan pada area lukanya.",
    "pressure-injury-care":
      "Luka pada orang yang lama berbaring butuh perawatan luka sekaligus pengaturan posisi, supaya tidak muncul luka baru di tempat lain.",
    "post-op-wound-care":
      "Untuk luka operasi dan luka jahit, yang dikerjakan adalah pembersihan steril, pemeriksaan jahitan, dan penggantian balutan.",
  };

  return {
    layanan,
    alasan: ALASAN[layanan.slug] ?? "",
    pertanyaan: PERTANYAAN_LUKA,
  };
}

/**
 * Pertanyaan lanjutan untuk keluhan luka.
 *
 * Semuanya hal yang memang ditanyakan perawat sebelum berangkat, dan yang
 * jawabannya mengubah apa yang ia bawa. Pertanyaan yang jawabannya tidak
 * mengubah apa pun hanya membuat orang berhenti membalas.
 */
export const PERTANYAAN_LUKA = [
  "Sudah berapa lama lukanya ada, dan di bagian tubuh mana?",
  "Balutannya kering, atau ada cairan yang tembus sampai ke luar?",
  "Ada demam, atau nyeri yang makin bertambah?",
];

export const SANGKALAN =
  "Ini bukan pemeriksaan medis dan bukan diagnosis. Yang menilai luka Anda adalah perawat saat kunjungan.";

export const SAPAAN_PEMBUKA =
  "Halo. Saya bukan dokter dan bukan AI — saya hanya alat bantu yang mengenali kata-kata, untuk membantu Anda memilih layanan dan menyiapkan pertanyaan sebelum perawat datang. Ceritakan keluhannya.";

/* ------------------------------------------------------------------ */
/* Merapikan catatan perawat menjadi SOAP                              */
/* ------------------------------------------------------------------ */

/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  YANG INI TIDAK BOLEH MENGARANG SATU KATA PUN.                        │
 * │                                                                       │
 * │  Versi sebelumnya mengembalikan kalimat yang SAMA apa pun yang        │
 * │  ditulis perawat. Diukur 13 September 2026: perawat menulis "ganti    │
 * │  balut, luka bersih", yang dikembalikan adalah                        │
 * │                                                                       │
 * │      "Dimensions measured at approximately 2.8 cm x 1.8 cm x 0.3 cm.  │
 * │       Tissue composition: 85% healthy pink-red granulation tissue…"   │
 * │                                                                       │
 * │  Ukuran yang tidak pernah diukur, persentase yang tidak pernah        │
 * │  dihitung — di dalam dokumen yang ditandatangani perawat dengan       │
 * │  nomor STR-nya. Rekam medis harus memuat apa yang benar-benar         │
 * │  dikerjakan (Permenkes 24/2022 Pasal 26). Angka karangan di sana      │
 * │  bukan "bantuan menulis", itu keterangan palsu, dan yang menanggung   │
 * │  adalah perawat yang menandatanganinya.                               │
 * │                                                                       │
 * │  Yang dikerjakan sekarang hanya MEMINDAHKAN kalimat perawat ke        │
 * │  kotak yang tepat. Kotak yang tidak ada isinya dibiarkan kosong,      │
 * │  dengan keterangan bahwa itu masih harus ia isi sendiri.              │
 * └──────────────────────────────────────────────────────────────────────┘
 */

export type Soap = {
  subjektif: string[];
  objektif: string[];
  asesmen: string[];
  rencana: string[];
  /** Kalimat yang tidak bisa ditebak tempatnya — ditunjukkan, bukan dibuang. */
  belumTertempatkan: string[];
};

const PETUNJUK_SOAP: { bagian: keyof Omit<Soap, "belumTertempatkan">; kata: string[] }[] = [
  {
    bagian: "subjektif",
    kata: [
      "pasien mengatakan", "pasien mengeluh", "mengeluh", "keluhan", "menurut pasien",
      "katanya", "pasien bilang", "keluarga mengatakan", "nyeri skala", "terasa",
      "merasa", "ngeluh",
    ],
  },
  {
    bagian: "objektif",
    kata: [
      "luka", "ukuran", "cm", "granulasi", "slough", "nekrotik", "eksudat", "pus",
      "nanah", "kemerahan", "edema", "bengkak", "tepi luka", "dasar luka", "td",
      "tekanan darah", "nadi", "suhu", "rr", "spo2", "gds", "tampak", "terlihat",
      "teraba", "berbau",
    ],
  },
  {
    bagian: "asesmen",
    kata: [
      "kesan", "asesmen", "assessment", "diagnosa", "diagnosis", "masalah keperawatan",
      "perbaikan", "membaik", "memburuk", "stagnan", "risiko", "curiga", "tanda infeksi",
    ],
  },
  {
    bagian: "rencana",
    kata: [
      "rencana", "plan", "kontrol", "kunjungan berikut", "edukasi", "diajarkan",
      "dianjurkan", "disarankan", "lanjutkan", "ganti balut", "dibersihkan",
      "irigasi", "debridement", "dipasang", "diberikan", "rujuk", "konsul",
      "berikutnya", "hari lagi",
    ],
  },
];

/**
 * Memecah catatan bebas menjadi kalimat.
 *
 * Perawat menulis sambil berdiri di rumah pasien, sering satu baris per
 * hal, kadang dipisah koma, kadang enter. Ketiganya diperlakukan sama.
 */
export function pecahKalimat(catatan: string): string[] {
  /**
   * Dipecah HANYA pada baris baru, titik koma, dan titik.
   *
   * Sempat dipecah pada koma juga, dan hasilnya terlihat saat dicoba:
   * "pasien mengeluh nyeri berkurang, skala 2" jadi dua potong, dan
   * "skala 2" — yang berdiri sendiri tidak berarti apa-apa — masuk ke
   * daftar "belum tahu ini masuk bagian mana". Koma di catatan perawat
   * biasanya memisahkan rincian di dalam SATU pengamatan, bukan dua
   * pengamatan berbeda. Memecahnya berarti memotong kalimat medis di
   * tengah, lalu menyusunnya kembali tanpa komanya — dan yang ditandatangani
   * perawat bukan lagi kalimat yang ia tulis.
   */
  return String(catatan ?? "")
    .split(/[\n;.]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export function rapikanSoap(catatan: string): Soap {
  const hasil: Soap = {
    subjektif: [],
    objektif: [],
    asesmen: [],
    rencana: [],
    belumTertempatkan: [],
  };

  for (const kalimat of pecahKalimat(catatan)) {
    const t = samakan(kalimat);
    let terbaik: { bagian: keyof Omit<Soap, "belumTertempatkan">; n: number } | null = null;
    for (const p of PETUNJUK_SOAP) {
      const n = p.kata.filter((k) => t.includes(samakan(k))).length;
      if (n > 0 && (!terbaik || n > terbaik.n)) terbaik = { bagian: p.bagian, n };
    }
    /**
     * Kalimatnya disalin APA ADANYA, bukan ditulis ulang. Menulis ulang
     * kalimat perawat berarti mengubah isi rekam medis, dan yang
     * menandatanganinya tidak pernah menulis kalimat itu.
     */
    if (terbaik) hasil[terbaik.bagian].push(kalimat.trim());
    else hasil.belumTertempatkan.push(kalimat.trim());
  }

  return hasil;
}

export const KOSONG_SOAP: Record<keyof Omit<Soap, "belumTertempatkan">, string> = {
  subjektif: "(belum ada — tulis apa yang dikatakan pasien atau keluarganya)",
  objektif: "(belum ada — tulis yang Anda ukur dan lihat sendiri: ukuran, dasar luka, eksudat, tanda vital)",
  asesmen: "(belum ada — tulis kesan Anda atas keadaan lukanya)",
  rencana: "(belum ada — tulis tindakan yang dikerjakan dan rencana kunjungan berikutnya)",
};

export const SANGKALAN_SOAP =
  "Ini hanya penyusunan ulang kalimat yang ANDA tulis — tidak ada satu kata pun yang ditambahkan. Bagian yang kosong harus Anda isi sendiri. Periksa seluruhnya sebelum ditandatangani; yang bertanggung jawab atas isinya tetap Anda, dengan nomor STR Anda.";

/* ------------------------------------------------------------------ */
/* Menggabungkan jawaban model dengan jalur pencocokan kata            */
/* ------------------------------------------------------------------ */

/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  MODEL HANYA BOLEH MENAIKKAN TANDA BAHAYA, TIDAK PERNAH MENCABUTNYA.  │
 * │                                                                       │
 * │  Aturan itu bukan kehati-hatian umum, ia menjawab satu pertanyaan     │
 * │  yang konkret: kalau daftar kata bilang "gawat" dan model bilang      │
 * │  "tidak apa-apa", siapa yang menang?                                  │
 * │                                                                       │
 * │  Daftar kata. Sebabnya bukan karena daftar kata lebih pintar — jelas  │
 * │  tidak. Sebabnya karena daftar kata SELALU MENJAWAB SAMA. Kalimat     │
 * │  yang sama hari ini dan bulan depan mendapat jawaban yang sama, dan   │
 * │  kalau jawabannya salah, salahnya bisa ditemukan, ditulis di tes, dan │
 * │  diperbaiki sekali untuk selamanya. Model bisa menjawab lain untuk    │
 * │  kalimat yang sama, dan kesalahan yang tidak bisa diulang tidak bisa  │
 * │  diperbaiki — hanya bisa disesali.                                    │
 * │                                                                       │
 * │  Sebaliknya, model MENAMBAH nilai justru di tempat daftar kata lemah: │
 * │  kalimat yang gawat tetapi tidak memakai satu pun kata di daftar.     │
 * │  Menaikkan itu aman — kesalahannya berarti seseorang pergi ke IGD     │
 * │  padahal tidak perlu.                                                 │
 * └──────────────────────────────────────────────────────────────────────┘
 */
export type JawabanGabungan = {
  bahaya: boolean;
  temuan: { nama: string; sebab: string }[];
  /** true kalau tanda bahayanya datang dari model, bukan dari daftar kata. */
  dariModel: boolean;
  slugLayanan: string | null;
  balasan: string;
  pertanyaan: string[];
};

export const TEMUAN_MODEL_NAMA = "Keluhan yang perlu dilihat langsung";

export function gabungkan(a: {
  kata: HasilPeriksa;
  saran: Saran;
  model: {
    gawat: boolean;
    alasanGawat: string;
    slugLayanan: string | null;
    balasan: string;
    pertanyaan: string[];
  } | null;
}): JawabanGabungan {
  /** Daftar kata menyala → selesai. Model tidak ditanya, tidak bisa membantah. */
  if (a.kata.bahaya)
    return {
      bahaya: true,
      temuan: a.kata.temuan,
      dariModel: false,
      slugLayanan: null,
      balasan: "",
      pertanyaan: [],
    };

  /** Model menyala padahal daftar kata tidak → tetap dinaikkan. */
  if (a.model?.gawat)
    return {
      bahaya: true,
      temuan: [
        {
          nama: TEMUAN_MODEL_NAMA,
          sebab:
            a.model.alasanGawat.trim() ||
            "Dari cara Anda menceritakannya, ini sebaiknya dilihat langsung hari ini.",
        },
      ],
      dariModel: true,
      slugLayanan: null,
      balasan: "",
      pertanyaan: [],
    };

  /**
   * Tidak gawat. Model boleh menulis kalimat balasan dan pertanyaan, tapi
   * PILIHAN LAYANAN tetap punya aturan: kalau jalur pencocokan kata sudah
   * yakin, itu yang dipakai. Jalur itu memakai umur untuk memisahkan sunat
   * anak dari sunat dewasa, dan sengaja menolak menebak untuk kalimat yang
   * belum jelas — dua hal yang lebih baik tidak diserahkan ke tebakan yang
   * bisa berubah-ubah.
   */
  const slug = a.saran.layanan?.slug ?? a.model?.slugLayanan ?? null;

  return {
    bahaya: false,
    temuan: [],
    dariModel: false,
    slugLayanan: slug,
    balasan: a.model?.balasan?.trim() ?? "",
    /** Pertanyaan model dipakai kalau ada; kalau tidak, pertanyaan bawaan. */
    pertanyaan: a.model?.pertanyaan?.length ? a.model.pertanyaan : a.saran.pertanyaan,
  };
}

export const SANGKALAN_MODEL =
  "Jawaban ini disusun dengan bantuan layanan AI di luar NuraHome Care. Yang dikirim ke sana hanya kalimat yang Anda tulis — tanpa nama, nomor telepon, alamat, maupun foto. Ini tetap bukan diagnosis.";
