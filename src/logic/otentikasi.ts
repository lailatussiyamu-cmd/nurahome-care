/**
 * Otentikasi — membuktikan bahwa orang ini memang siapa yang dia akui.
 *
 * Berkas ini adalah pasangan dari logic/sesi.ts. Bedanya penting:
 *
 *   sesi.ts       → "data siapa yang boleh tampil di layar" (penyaringan)
 *   otentikasi.ts → "benarkah orang ini siapa yang dia akui"  (pembuktian)
 *
 * Sampai berkas ini ada, aplikasi hanya punya yang pertama. Peran pemakai
 * dikirim dari browser di dalam badan permintaan: `{"actorRole":"ADMIN"}`.
 * Siapa pun yang bisa membuka Developer Tools bisa mengetik kalimat itu dan
 * menjadi admin — membaca seluruh foto luka, seluruh nomor telepon, seluruh
 * catatan klinis. Peran yang dikirim browser bukan penjagaan; itu permintaan
 * yang selama ini selalu dikabulkan.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ATURAN YANG TIDAK BOLEH DILANGGAR DI MANA PUN:                       │
 * │  Peran dan identitas SELALU berasal dari cookie sesi yang diperiksa   │
 * │  di server. TIDAK PERNAH dari badan permintaan, tidak pernah dari     │
 * │  query string, tidak pernah dari header buatan sendiri.               │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Yang ada di sini murni perhitungan — tidak menyentuh basis data dan tidak
 * menyentuh Next.js — supaya bisa diuji sendiri.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/* ------------------------------------------------------------------ */
/* Kata sandi                                                          */
/* ------------------------------------------------------------------ */

/**
 * scrypt, bukan SHA-256 polos.
 *
 * SHA-256 dirancang supaya CEPAT. Itu tepat untuk memeriksa berkas, dan
 * persis salah untuk kata sandi: kartu grafis kelas menengah menghitung
 * miliaran SHA-256 per detik, jadi seluruh kata sandi yang wajar tertebak
 * dalam hitungan jam kalau basis datanya bocor. scrypt sengaja lambat dan
 * sengaja rakus memori, sehingga menebak jadi mahal.
 *
 * scrypt ada di dalam Node sendiri — tidak menambah satu pun dependensi.
 * Untuk sesuatu yang menjaga data kesehatan, pustaka yang lebih sedikit
 * berarti permukaan serang yang lebih sedikit.
 *
 * N = 2^15 (32768). Sekitar 100 ms per hitungan di server biasa: tidak
 * terasa bagi orang yang masuk sekali, sangat terasa bagi mesin yang
 * mencoba sepuluh juta tebakan.
 */
const SCRYPT = { N: 32768, r: 8, p: 1, panjang: 64, maxmem: 64 * 1024 * 1024 };

export function acakSandi(garam: string, sandi: string): string {
  return scryptSync(sandi.normalize("NFKC"), garam, SCRYPT.panjang, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  }).toString("hex");
}

/**
 * Bentuk simpanan: `scrypt$N$r$p$garam$turunan`.
 *
 * Parameternya ikut disimpan, bukan ditanam di kode. Kalau suatu saat
 * angkanya dinaikkan, kata sandi lama tetap bisa diperiksa dengan angka
 * lamanya — tanpa itu, menaikkan keamanan berarti mengunci semua orang
 * keluar sekaligus.
 */
export function buatHashSandi(sandi: string): string {
  const garam = randomBytes(16).toString("hex");
  const turunan = acakSandi(garam, sandi);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${garam}$${turunan}`;
}

/**
 * Pemeriksaan berwaktu tetap.
 *
 * Perbandingan string biasa (`a === b`) berhenti di karakter pertama yang
 * berbeda. Selisih waktunya kecil, tapi cukup untuk ditebak satu karakter
 * demi satu karakter kalau penyerang mencoba puluhan ribu kali.
 */
export function sandiCocok(simpanan: string | null | undefined, sandi: string): boolean {
  if (!simpanan) return false;
  const bagian = simpanan.split("$");
  if (bagian.length !== 6 || bagian[0] !== "scrypt") return false;

  const [, nTeks, rTeks, pTeks, garam, turunan] = bagian;
  let hitung: Buffer;
  try {
    hitung = scryptSync(sandi.normalize("NFKC"), garam, turunan.length / 2, {
      N: Number(nTeks),
      r: Number(rTeks),
      p: Number(pTeks),
      maxmem: SCRYPT.maxmem,
    });
  } catch {
    return false;
  }

  const tersimpan = Buffer.from(turunan, "hex");
  if (tersimpan.length !== hitung.length) return false;
  return timingSafeEqual(tersimpan, hitung);
}

/* ------------------------------------------------------------------ */
/* Aturan kata sandi                                                   */
/* ------------------------------------------------------------------ */

/**
 * Sandi yang paling sering dipakai orang Indonesia di layanan konsumen.
 * Bukan daftar lengkap — hanya penyaring paling kasar, supaya akun yang
 * memegang foto luka tidak dijaga kata "12345678".
 */
const SANDI_TERLARANG = new Set([
  "12345678", "123456789", "1234567890", "password", "qwerty123", "qwertyui",
  "indonesia", "abcd1234", "11111111", "00000000", "sayangkamu", "iloveyou",
  "admin123", "perawat123", "nurahome", "rahasia123", "bismillah",
]);

/**
 * Panjang minimum 8, bukan 12.
 *
 * Aturan yang terlalu ketat punya akibat yang bisa diramalkan: kata sandi
 * ditulis di kertas dan ditempel di meja, atau dipakai ulang dari akun lain.
 * Delapan karakter ditambah penguncian setelah beberapa kali gagal (di
 * bawah) menahan penebakan lebih baik daripada aturan panjang saja.
 */
export function periksaSandi(
  sandi: string,
  konteks: { nama?: string | null; telepon?: string | null; surel?: string | null } = {}
): { boleh: boolean; alasan: string } {
  const s = String(sandi ?? "");
  if (s.length < 8) return { boleh: false, alasan: "Kata sandi minimal 8 karakter." };
  if (s.length > 128) return { boleh: false, alasan: "Kata sandi terlalu panjang." };
  if (s.trim() !== s)
    return { boleh: false, alasan: "Kata sandi tidak boleh diawali atau diakhiri spasi." };
  if (SANDI_TERLARANG.has(s.toLowerCase()))
    return { boleh: false, alasan: "Kata sandi ini terlalu umum dipakai. Pilih yang lain." };
  if (/^(\d)\1+$/.test(s))
    return { boleh: false, alasan: "Kata sandi tidak boleh satu angka berulang." };

  // Nomor telepon sendiri adalah tebakan pertama siapa pun yang kenal.
  const telp = normalTelepon(konteks.telepon ?? "");
  if (telp && normalTelepon(s) === telp)
    return { boleh: false, alasan: "Kata sandi tidak boleh nomor telepon Anda sendiri." };

  const nama = String(konteks.nama ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (nama.length >= 4 && s.toLowerCase().replace(/[^a-z]/g, "") === nama)
    return { boleh: false, alasan: "Kata sandi tidak boleh nama Anda sendiri." };

  return { boleh: true, alasan: "" };
}

/* ------------------------------------------------------------------ */
/* Pengenal: nomor telepon atau surel                                  */
/* ------------------------------------------------------------------ */

/**
 * Menyeragamkan nomor Indonesia ke bentuk 62xxxxxxxxxx.
 *
 * Orang menulis nomornya dengan cara yang berbeda-beda setiap kali:
 * `0812-3456-7890`, `+62 812 3456 7890`, `62812 3456 7890`. Tanpa
 * penyeragaman, satu orang bisa punya tiga akun tanpa sadar — dan yang
 * paling merepotkan, tidak bisa masuk ke akunnya sendiri karena mengetik
 * nomornya dengan gaya yang berbeda dari waktu mendaftar.
 */
export function normalTelepon(masukan: string): string {
  const angka = String(masukan ?? "").replace(/[^\d+]/g, "");
  if (!angka) return "";
  let n = angka.replace(/^\+/, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  else if (n.startsWith("8")) n = "62" + n;
  return /^\d{9,15}$/.test(n) ? n : "";
}

export function telingaTelepon(n: string): string {
  const t = normalTelepon(n);
  if (!t) return n;
  const lokal = "0" + t.slice(2);
  return lokal.replace(/(\d{4})(\d{4})(\d+)/, "$1-$2-$3");
}

export function normalSurel(masukan: string): string {
  const s = String(masukan ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : "";
}

export type Pengenal = { jenis: "TELEPON" | "SUREL"; nilai: string } | null;

/**
 * Satu kotak isian untuk nomor telepon maupun surel.
 *
 * Perawat cenderung punya surel; pasien — terutama yang memesan untuk orang
 * tuanya — sering hanya punya nomor WhatsApp. Memaksa keduanya lewat satu
 * jenis pengenal mengunci salah satu kelompok. Satu kotak yang menerima
 * keduanya menghindari itu tanpa menambah layar.
 */
export function bacaPengenal(masukan: string): Pengenal {
  const mentah = String(masukan ?? "").trim();
  if (!mentah) return null;
  if (mentah.includes("@")) {
    const surel = normalSurel(mentah);
    return surel ? { jenis: "SUREL", nilai: surel } : null;
  }
  const telp = normalTelepon(mentah);
  return telp ? { jenis: "TELEPON", nilai: telp } : null;
}

/* ------------------------------------------------------------------ */
/* Token sesi                                                          */
/* ------------------------------------------------------------------ */

/**
 * Yang dikirim ke browser adalah token acak; yang disimpan di basis data
 * hanya SIDIK JARI SHA-256-nya.
 *
 * Kalau isi tabel sesi bocor, penyerang memegang daftar sidik jari yang
 * tidak bisa dipakai masuk — sidik jarinya tidak bisa dibalik menjadi
 * tokennya. Menyimpan token apa adanya berarti satu kebocoran basis data
 * langsung membuka setiap akun yang sedang aktif.
 *
 * Di sini SHA-256 memang tepat (berbeda dengan kata sandi di atas): token
 * ini 32 byte acak penuh, jadi tidak ada yang bisa ditebak — yang perlu
 * hanyalah cepat, karena diperiksa di setiap permintaan.
 */
export function buatToken(): { token: string; sidik: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, sidik: sidikToken(token) };
}

export function sidikToken(token: string): string {
  return createHash("sha256").update(String(token ?? "")).digest("hex");
}

/** Sidik jari alamat IP — untuk pembatasan laju, tanpa menyimpan IP-nya. */
export function sidikIp(ip: string, garam: string): string {
  return createHash("sha256").update(`${garam}:${ip}`).digest("hex").slice(0, 32);
}

export const NAMA_COOKIE = "nh_sesi";

/* ------------------------------------------------------------------ */
/* Umur sesi                                                           */
/* ------------------------------------------------------------------ */

/**
 * Dua batas sekaligus, dan keduanya berbeda menurut peran.
 *
 *   diamJam    — berapa lama boleh tidak dipakai sebelum diminta masuk lagi
 *   totalJam   — batas mutlak, sekalipun dipakai terus-menerus
 *
 * Batas mutlak itulah yang menangkap token yang dicuri: sesi yang dipakai
 * penyerang setiap jam tidak akan pernah menganggur, jadi batas diam saja
 * tidak pernah menghentikannya.
 *
 * Admin dapat batas terpendek karena akun admin melihat data seluruh
 * pasien. Perawat lebih pendek dari pasien karena ponselnya dibawa ke
 * rumah orang dan lebih sering hilang atau dipinjam.
 */
export const UMUR_SESI: Record<string, { diamJam: number; totalJam: number }> = {
  ADMIN: { diamJam: 2, totalJam: 12 },
  PROVIDER: { diamJam: 12, totalJam: 24 * 7 },
  PATIENT: { diamJam: 24 * 7, totalJam: 24 * 30 },
};

export function umurUntuk(peran: string) {
  return UMUR_SESI[peran] ?? UMUR_SESI.PATIENT;
}

export function kedaluwarsaSesi(peran: string, sekarang = new Date()): Date {
  return new Date(sekarang.getTime() + umurUntuk(peran).totalJam * 3_600_000);
}

/**
 * Kenapa sesi ini tidak berlaku lagi — dipisah dari "berlaku / tidak"
 * supaya layar bisa mengatakan alasannya, bukan hanya melempar orang
 * kembali ke halaman masuk tanpa penjelasan.
 */
export type AlasanTolak =
  | "TIDAK_ADA"
  | "DICABUT"
  | "KEDALUWARSA"
  | "TERLALU_LAMA_DIAM"
  | "PEMAKAI_NONAKTIF";

export const PESAN_TOLAK: Record<AlasanTolak, string> = {
  TIDAK_ADA: "Anda belum masuk.",
  DICABUT: "Sesi ini sudah diakhiri. Silakan masuk lagi.",
  KEDALUWARSA: "Sesi Anda sudah habis masa berlakunya. Silakan masuk lagi.",
  TERLALU_LAMA_DIAM: "Anda terlalu lama tidak aktif. Demi keamanan, silakan masuk lagi.",
  PEMAKAI_NONAKTIF: "Akun ini sedang dinonaktifkan. Hubungi admin.",
};

export function periksaSesi(
  baris:
    | {
        expiresAt?: Date | string | null;
        lastSeenAt?: Date | string | null;
        revokedAt?: Date | string | null;
        role?: string | null;
      }
    | null
    | undefined,
  pemakaiAktif: boolean,
  sekarang = new Date()
): { boleh: boolean; alasan: AlasanTolak | "" } {
  if (!baris) return { boleh: false, alasan: "TIDAK_ADA" };
  if (baris.revokedAt) return { boleh: false, alasan: "DICABUT" };

  const habis = baris.expiresAt ? new Date(baris.expiresAt) : null;
  if (!habis || habis <= sekarang) return { boleh: false, alasan: "KEDALUWARSA" };

  const batasDiam = umurUntuk(String(baris.role ?? "PATIENT")).diamJam;
  const terakhir = baris.lastSeenAt ? new Date(baris.lastSeenAt) : null;
  if (terakhir && (sekarang.getTime() - terakhir.getTime()) / 3_600_000 >= batasDiam)
    return { boleh: false, alasan: "TERLALU_LAMA_DIAM" };

  if (!pemakaiAktif) return { boleh: false, alasan: "PEMAKAI_NONAKTIF" };
  return { boleh: true, alasan: "" };
}

/* ------------------------------------------------------------------ */
/* Penguncian setelah gagal berkali-kali                               */
/* ------------------------------------------------------------------ */

/**
 * Penundaan bertingkat, bukan pemblokiran permanen.
 *
 * Pemblokiran permanen setelah N kali gagal terdengar aman, tapi berubah
 * menjadi senjata: siapa pun yang tahu nomor telepon seorang perawat bisa
 * mengunci akunnya menjelang jam kunjungan hanya dengan salah mengetik
 * kata sandi lima kali. Penundaan yang memanjang membuat penebakan tidak
 * ada gunanya, tanpa memberi orang asing tombol untuk mematikan akun
 * orang lain.
 */
export const TANGGA_KUNCI = [
  { gagal: 5, menit: 1 },
  { gagal: 8, menit: 5 },
  { gagal: 11, menit: 30 },
  { gagal: 15, menit: 120 },
];

export function kunciSampai(gagalBeruntun: number, sekarang = new Date()): Date | null {
  let menit = 0;
  for (const t of TANGGA_KUNCI) if (gagalBeruntun >= t.gagal) menit = t.menit;
  return menit ? new Date(sekarang.getTime() + menit * 60_000) : null;
}

export function masihTerkunci(
  sampai: Date | string | null | undefined,
  sekarang = new Date()
): { terkunci: boolean; detik: number } {
  if (!sampai) return { terkunci: false, detik: 0 };
  const d = new Date(sampai);
  const sisa = d.getTime() - sekarang.getTime();
  return sisa > 0 ? { terkunci: true, detik: Math.ceil(sisa / 1000) } : { terkunci: false, detik: 0 };
}

export function sisaWaktuTeks(detik: number): string {
  if (detik < 60) return `${detik} detik`;
  const menit = Math.ceil(detik / 60);
  return menit < 60 ? `${menit} menit` : `${Math.ceil(menit / 60)} jam`;
}

/* ------------------------------------------------------------------ */
/* Jawaban gagal masuk                                                 */
/* ------------------------------------------------------------------ */

/**
 * Satu kalimat yang sama untuk "pengenal tidak terdaftar" dan "kata sandi
 * salah".
 *
 * Kalau jawabannya dibedakan, kotak masuk berubah menjadi alat pemeriksa
 * daftar pelanggan: siapa pun bisa mencoba nomor telepon satu per satu dan
 * mengetahui nomor mana yang punya akun di layanan perawatan luka. Untuk
 * layanan kesehatan, sekadar "orang ini pelanggan di sini" sudah informasi
 * yang tidak boleh keluar.
 */
export const GAGAL_MASUK = "Nomor/surel atau kata sandi salah.";

/* ------------------------------------------------------------------ */
/* Siapa boleh mendaftar sendiri                                       */
/* ------------------------------------------------------------------ */

/**
 * Hanya PASIEN yang boleh membuat akun sendiri.
 *
 * Akun perawat dibuat admin setelah STR dan SIP-nya diperiksa (lihat
 * logic/verifikasi.ts). Kalau perawat bisa mendaftar sendiri, aplikasi
 * kembali ke keadaan yang mau diperbaiki: nomor STR yang diketik sendiri
 * dan tidak pernah dicocokkan dengan dokumen apa pun. Akun admin tidak
 * pernah dibuat lewat aplikasi sama sekali.
 */
export const PERAN_DAFTAR_SENDIRI = "PATIENT";

export function bolehDaftarSendiri(peran: string): boolean {
  return peran === PERAN_DAFTAR_SENDIRI;
}
