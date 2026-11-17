/**
 * Woundex — peringatan dini luka kaki diabetik di kunjungan rumah.
 *
 * Perawat memasukkan sinyal yang memang sudah diukurnya di setiap kunjungan:
 * ukuran luka, kedalaman, lima tanda infeksi lokal, tanda vital, gula darah,
 * nadi kaki, dan sensasi. Berkas ini mengubahnya menjadi satu keputusan
 * (MERAH / KUNING / HIJAU) beserta ALASANNYA.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ATURAN, BUKAN MODEL.                                                 │
 * │                                                                       │
 * │  Sama seperti tanda bahaya di asisten: keputusan apakah seseorang     │
 * │  perlu ke IGD tidak boleh berubah-ubah untuk masukan yang sama, dan   │
 * │  harus bisa dijelaskan kalimat per kalimat kepada perawat, dokter,    │
 * │  dan auditor. Setiap ambang di bawah ini menyebut sumbernya.          │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Sumber:
 *   - IWGDF/IDSA 2023, klasifikasi infeksi kaki diabetik (derajat 1–4).
 *     Infeksi = ≥ 2 dari 5 tanda lokal. Derajat 4 = infeksi + ≥ 2 tanda
 *     SIRS. Leukosit tidak diukur di rumah, jadi hanya suhu, nadi, napas.
 *   - SINBAD (Ince dkk., Diabetes Care 2008): Site, Ischaemia, Neuropathy,
 *     Bacterial infection, Area ≥ 1 cm², Depth. Skor 0–6.
 *   - Sheehan dkk., Diabetes Care 2003: pengurangan luas < ~50% dalam
 *     4 minggu memprediksi luka TIDAK sembuh dalam 12 minggu.
 *
 * Berkas ini murni: tidak menyentuh basis data, jaringan, atau waktu
 * sekarang. Yang memanggilnya (API) menyerahkan riwayat dan hari ke-berapa.
 */

/** Naikkan setiap kali ada ambang atau aturan yang berubah. Ikut tersimpan per pengkajian. */
export const VERSI_ATURAN_WOUNDEX = "2026-11-17b";

export type Tingkat = "MERAH" | "KUNING" | "HIJAU";
export type Kedalaman = "KULIT" | "TENDON" | "TULANG";
export type Lokasi = "DEPAN" | "TENGAH" | "BELAKANG";

export interface SinyalWoundex {
  panjangCm: number;
  lebarCm: number;
  kedalaman: Kedalaman;
  eritemaCm: number;
  bengkak: boolean;
  hangat: boolean;
  nyeriTekan: boolean;
  nanah: boolean;
  nekrosisBaru: boolean;
  suhuC: number;
  nadi: number;
  napas: number;
  /** null = tidak diukur di kunjungan ini. Tidak pernah diisi tebakan. */
  gulaDarah: number | null;
  nadiKakiTakTeraba: boolean;
  sensasiHilang: boolean;
  lokasi: Lokasi;
}

/** Satu titik riwayat luas luka: hari ke-berapa sejak pengukuran pertama. */
export interface TitikLuas {
  hari: number;
  luas: number;
}

export interface Alasan {
  tingkat: Tingkat | "INFO";
  teks: string;
  kunci: string;
}

export interface HasilWoundex {
  tingkat: Tingkat;
  derajatIwgdf: 1 | 2 | 3 | 4;
  namaDerajat: string;
  tandaLokal: number;
  tandaSistemik: number;
  sinbad: number;
  sinbadRincian: string[];
  luas: number;
  /** Riwayat yang dipakai, termasuk pengukuran hari ini di ujungnya. */
  titik: TitikLuas[];
  proyeksi: { reduksiMinggu4: number; luasMinggu4: number; terukur: boolean } | null;
  alasan: Alasan[];
  tindakan: { utama: string; langkah: string[]; berikutnya: string };
}

export const NAMA_TINGKAT: Record<Tingkat, string> = {
  MERAH: "Tangani hari ini",
  KUNING: "Tinjau dalam 24 jam",
  HIJAU: "Sesuai rencana",
};

const PERINGKAT: Record<Tingkat, number> = { MERAH: 3, KUNING: 2, HIJAU: 1 };

const NAMA_DERAJAT = {
  1: "Tidak terinfeksi",
  2: "Infeksi ringan",
  3: "Infeksi sedang",
  4: "Infeksi berat",
} as const;

const bulat1 = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/* ------------------------------------------------------------------ */
/* Validasi masukan                                                    */
/* ------------------------------------------------------------------ */

const angka = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Mengubah isian mentah dari layar menjadi sinyal yang sah, atau menolak
 * dengan kalimat yang bisa langsung dibaca perawat.
 *
 * Tidak ada nilai bawaan untuk angka klinis. Kolom wajib yang kosong
 * DITOLAK — rekam medis tidak boleh memuat angka yang tidak pernah diukur
 * (lihat catatan skala nyeri di SUBMIT_CLINICAL_NOTE). Satu-satunya yang
 * boleh kosong adalah gula darah, dan kosong berarti "tidak diukur",
 * dicatat sebagai null, bukan 0.
 */
export function bacaSinyal(m: any): { sinyal: SinyalWoundex } | { galat: string } {
  const p = angka(m?.panjangCm);
  const l = angka(m?.lebarCm);
  const e = angka(m?.eritemaCm);
  const suhu = angka(m?.suhuC);
  const nadi = angka(m?.nadi);
  const napas = angka(m?.napas);
  const gulaMentah = m?.gulaDarah;
  const gula = gulaMentah === null || gulaMentah === undefined || gulaMentah === "" ? null : angka(gulaMentah);

  if (!(p > 0) || !(l > 0)) return { galat: "Panjang dan lebar luka wajib diisi, dalam cm, lebih dari 0." };
  if (p > 40 || l > 40) return { galat: "Ukuran luka di atas 40 cm. Periksa lagi satuannya (cm, bukan mm)." };
  if (!(e >= 0)) return { galat: "Lebar kemerahan di tepi luka wajib diisi. Tulis 0 kalau tidak ada." };
  if (!(suhu >= 30 && suhu <= 44)) return { galat: "Suhu tubuh wajib diisi, dalam °C (30–44)." };
  if (!(nadi >= 20 && nadi <= 250)) return { galat: "Denyut nadi wajib diisi, per menit (20–250)." };
  if (!(napas >= 4 && napas <= 80)) return { galat: "Frekuensi napas wajib diisi, per menit (4–80)." };
  if (gula !== null && !(gula >= 20 && gula <= 1500))
    return { galat: "Gula darah di luar rentang yang masuk akal (20–1500 mg/dL). Kosongkan kalau tidak diukur." };

  const kedalaman = ["KULIT", "TENDON", "TULANG"].includes(m?.kedalaman) ? (m.kedalaman as Kedalaman) : null;
  if (!kedalaman) return { galat: "Pilih jaringan terdalam yang terlihat atau teraba." };
  const lokasi = ["DEPAN", "TENGAH", "BELAKANG"].includes(m?.lokasi) ? (m.lokasi as Lokasi) : null;
  if (!lokasi) return { galat: "Pilih letak luka: kaki depan, tengah, atau belakang/tumit." };

  const ya = (v: unknown) => v === true || v === "true";
  return {
    sinyal: {
      panjangCm: p,
      lebarCm: l,
      kedalaman,
      eritemaCm: e,
      bengkak: ya(m?.bengkak),
      hangat: ya(m?.hangat),
      nyeriTekan: ya(m?.nyeriTekan),
      nanah: ya(m?.nanah),
      nekrosisBaru: ya(m?.nekrosisBaru),
      suhuC: suhu,
      nadi,
      napas,
      gulaDarah: gula,
      nadiKakiTakTeraba: ya(m?.nadiKakiTakTeraba),
      sensasiHilang: ya(m?.sensasiHilang),
      lokasi,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tren luas                                                           */
/* ------------------------------------------------------------------ */

/**
 * Garis dari ukuran AWAL ke ukuran TERAKHIR, diteruskan sampai hari 28.
 * Kalau sudah ada pengukuran di hari ≥ 28, yang dipakai angka terukurnya.
 *
 * Bukan regresi atas semua titik. Regresi pernah dicoba dan gagal di kasus
 * yang paling penting: luka yang mengecil cepat selama dua minggu lalu
 * MEMBESAR 129% hari ini tetap diproyeksikan "membaik 97%", karena titik-
 * titik lama menarik garisnya. Ukuran Sheehan sendiri adalah persen
 * perubahan dari ukuran awal; garis awal→terakhir adalah perpanjangan
 * paling jujur dari ukuran itu, dan bisa dijelaskan dalam satu kalimat.
 */
export function proyeksiMinggu4(titik: TitikLuas[]) {
  if (titik.length < 2) return null;
  const pertama = titik[0];
  const akhir = titik[titik.length - 1];
  if (!(pertama.luas > 0) || akhir.hari <= pertama.hari) return null;
  const terukur = akhir.hari >= 28;
  const miring = (akhir.luas - pertama.luas) / (akhir.hari - pertama.hari);
  let luasMinggu4 = terukur ? akhir.luas : Math.max(0, pertama.luas + miring * (28 - pertama.hari));
  /**
   * Luka yang MEMBESAR sejak kunjungan sebelumnya tidak boleh diproyeksikan
   * terus mengecil hanya karena ukuran awalnya besar. Paling baik, ia
   * bertahan di ukuran hari ini sampai minggu ke-4.
   */
  const sebelumAkhir = titik[titik.length - 2];
  if (!terukur && akhir.luas > sebelumAkhir.luas) luasMinggu4 = Math.max(luasMinggu4, akhir.luas);
  return { reduksiMinggu4: 1 - luasMinggu4 / pertama.luas, luasMinggu4, terukur };
}

/* ------------------------------------------------------------------ */
/* Penilaian                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param s        sinyal hari ini (sudah lolos bacaSinyal)
 * @param riwayat  pengukuran SEBELUM hari ini, urut hari, hari pertama = 0
 * @param hariIni  hari ke-berapa hari ini sejak pengukuran pertama
 */
export function nilaiWoundex(s: SinyalWoundex, riwayat: TitikLuas[], hariIni: number): HasilWoundex {
  const alasan: Alasan[] = [];
  const luas = s.panjangCm * s.lebarCm;

  const tandaLokal = [s.bengkak, s.eritemaCm >= 0.5, s.nyeriTekan, s.hangat, s.nanah].filter(Boolean).length;
  const terinfeksi = tandaLokal >= 2;
  const tandaSistemik = [s.suhuC > 38 || s.suhuC < 36, s.nadi > 90, s.napas > 20].filter(Boolean).length;

  let derajat: 1 | 2 | 3 | 4 = 1;
  if (terinfeksi) derajat = tandaSistemik >= 2 ? 4 : s.eritemaCm > 2 || s.kedalaman !== "KULIT" ? 3 : 2;

  if (derajat === 4)
    alasan.push({
      tingkat: "MERAH",
      kunci: "berat",
      teks: `Infeksi kaki dengan ${tandaSistemik} tanda sistemik (suhu, nadi, napas): IWGDF derajat 4, berat.`,
    });
  if (derajat === 3)
    alasan.push({
      tingkat: "MERAH",
      kunci: "sedang",
      teks:
        s.eritemaCm > 2
          ? `Infeksi sedang: kemerahan ${bulat1(s.eritemaCm)} cm dari tepi luka (IWGDF derajat 3).`
          : "Infeksi sedang: infeksi mencapai tendon atau tulang (IWGDF derajat 3).",
    });
  if (derajat === 2)
    alasan.push({
      tingkat: "KUNING",
      kunci: "ringan",
      teks: `Infeksi lokal ringan: ${tandaLokal} dari 5 tanda lokal ada (IWGDF derajat 2).`,
    });
  if (!terinfeksi && tandaSistemik >= 2)
    alasan.push({
      tingkat: "KUNING",
      kunci: "sistemik",
      teks: "Ada tanda sistemik tanpa infeksi lokal yang jelas. Cari sumber lain.",
    });
  if (s.nekrosisBaru)
    alasan.push({ tingkat: "MERAH", kunci: "nekrosis", teks: "Ada jaringan nekrosis atau hitam yang baru muncul." });
  if (s.kedalaman === "TULANG")
    alasan.push({
      tingkat: terinfeksi ? "MERAH" : "KUNING",
      kunci: "tulang",
      teks: "Luka teraba sampai tulang: curiga osteomielitis.",
    });
  if (s.nadiKakiTakTeraba)
    alasan.push(
      terinfeksi
        ? { tingkat: "MERAH", kunci: "iskemia", teks: "Infeksi pada kaki tanpa nadi teraba: iskemia plus infeksi perlu dinilai hari ini." }
        : { tingkat: "KUNING", kunci: "iskemia-saja", teks: "Nadi kaki tidak teraba: curiga penyakit arteri perifer." }
    );
  if (s.gulaDarah !== null) {
    if (s.gulaDarah >= 400)
      alasan.push({ tingkat: "MERAH", kunci: "gula", teks: `Gula darah ${s.gulaDarah} mg/dL: risiko krisis hiperglikemia.` });
    else if (s.gulaDarah > 250)
      alasan.push({
        tingkat: "KUNING",
        kunci: "gula",
        teks: `Gula darah ${s.gulaDarah} mg/dL: kontrol buruk memperlambat penyembuhan dan memperberat infeksi.`,
      });
  }

  const titik = [...riwayat, { hari: hariIni, luas }];
  const sebelum = riwayat.length ? riwayat[riwayat.length - 1].luas : NaN;
  if (sebelum > 0 && luas > sebelum * 1.1)
    alasan.push({
      tingkat: "KUNING",
      kunci: "membesar",
      teks: `Luka ${Math.round((luas / sebelum - 1) * 100)}% lebih besar daripada kunjungan sebelumnya.`,
    });

  const proyeksi = proyeksiMinggu4(titik);
  if (proyeksi && proyeksi.reduksiMinggu4 < 0.5)
    alasan.push({
      tingkat: "KUNING",
      kunci: "macet",
      teks: `${proyeksi.terukur ? "Pengurangan luas di minggu ke-4" : "Perkiraan pengurangan luas di minggu ke-4"} ${Math.round(
        proyeksi.reduksiMinggu4 * 100
      )}% (target ≥ 50%): risiko tinggi luka belum sembuh di minggu ke-12.`,
    });

  const sinbadBagian: [string, boolean][] = [
    ["S", s.lokasi !== "DEPAN"],
    ["I", s.nadiKakiTakTeraba],
    ["N", s.sensasiHilang],
    ["B", terinfeksi],
    ["A", luas >= 1],
    ["D", s.kedalaman !== "KULIT"],
  ];
  const sinbadRincian = sinbadBagian.filter(([, ada]) => ada).map(([h]) => h);

  const tingkat = alasan.reduce<Tingkat>(
    (m, a) => (a.tingkat !== "INFO" && PERINGKAT[a.tingkat] > PERINGKAT[m] ? a.tingkat : m),
    "HIJAU"
  );
  if (tingkat === "HIJAU") alasan.push({ tingkat: "HIJAU", kunci: "aman", teks: "Tidak ada tanda bahaya. Penyembuhan sesuai jalur." });

  return {
    tingkat,
    derajatIwgdf: derajat,
    namaDerajat: NAMA_DERAJAT[derajat],
    tandaLokal,
    tandaSistemik,
    sinbad: sinbadRincian.length,
    sinbadRincian,
    luas,
    titik,
    proyeksi,
    alasan: alasan.sort((a, b) => peringkatAlasan(b) - peringkatAlasan(a)),
    tindakan: tindakanDari(tingkat, new Set(alasan.map((a) => a.kunci))),
  };
}

const peringkatAlasan = (a: Alasan) => (a.tingkat === "INFO" ? 0 : PERINGKAT[a.tingkat]);

function tindakanDari(t: Tingkat, k: Set<string>): HasilWoundex["tindakan"] {
  if (k.has("berat"))
    return {
      utama: "Rujuk ke IGD sekarang. Atur transportasi dan hubungi dokter jaga.",
      langkah: [
        "Jangan menunggu jadwal kunjungan berikutnya.",
        "Bawa catatan kunjungan ini dan foto luka bersama pasien.",
        "Periksa ulang gula darah sebelum berangkat; catat jam rujukan.",
      ],
      berikutnya: "Hubungi keluarga dalam 6 jam setelah rujukan",
    };
  if (t === "MERAH") {
    const langkah = ["Tinjauan hari ini oleh tim kaki diabetik atau dokter bedah."];
    if (k.has("iskemia")) langkah.push("Minta penilaian perfusi segera (ABI atau tekanan jari kaki).");
    if (k.has("tulang")) langkah.push("Tanyakan ke dokter perlunya foto rontgen kaki untuk osteomielitis.");
    if (k.has("nekrosis")) langkah.push("Jangan debridemen nekrosis kering di rumah sebelum perfusinya diketahui.");
    if (k.has("gula")) langkah.push("Laporkan gula darah ke dokter; tinjau dosis insulin hari ini.");
    return { utama: "Tinjauan dokter hari ini. Jangan menunggu kunjungan rutin.", langkah, berikutnya: "Kaji ulang dalam 24 jam" };
  }
  if (t === "KUNING") {
    const langkah: string[] = [];
    if (k.has("ringan")) langkah.push("Kabari dokter hari ini; pertimbangkan kultur luka setelah dibersihkan.");
    if (k.has("macet") || k.has("membesar"))
      langkah.push("Tinjau offloading dan kepatuhan di rumah; pertimbangkan rujukan ke klinik kaki diabetik.");
    if (k.has("iskemia-saja")) langkah.push("Minta pemeriksaan perfusi (ABI) di kunjungan klinik berikutnya.");
    if (k.has("gula")) langkah.push("Tinjau pola makan dan obat bersama keluarga; teruskan catatan gula darah ke dokter.");
    if (k.has("sistemik")) langkah.push("Ukur ulang tanda vital dalam 4 jam; naikkan bila menetap.");
    if (k.has("tulang")) langkah.push("Laporkan ke dokter: luka teraba sampai tulang.");
    return { utama: "Tinjauan perawat dalam 24 jam dan kabari dokter.", langkah, berikutnya: "Kunjungan berikutnya dalam 24–48 jam" };
  }
  return {
    utama: "Lanjutkan rencana perawatan.",
    langkah: [
      "Balutan lembap dan offloading sesuai rencana.",
      "Ingatkan keluarga tanda bahaya: demam, kemerahan meluas, bau busuk, jaringan hitam baru.",
    ],
    berikutnya: "Kunjungan berikutnya 3–4 hari lagi",
  };
}

/** Selisih hari kalender antara dua tanggal (UTC, tanpa jam). */
export function selisihHari(dari: Date, ke: Date): number {
  const a = Date.UTC(dari.getUTCFullYear(), dari.getUTCMonth(), dari.getUTCDate());
  const b = Date.UTC(ke.getUTCFullYear(), ke.getUTCMonth(), ke.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}
