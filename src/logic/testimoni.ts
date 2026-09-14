/**
 * Testimoni pasien: penilaian, penyamaran nama, dan batas kewenangan admin.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  TIGA ATURAN YANG TIDAK BOLEH DILANGGAR                               │
 * │                                                                       │
 * │  1. Tulisan asli pasien tidak pernah berubah. Admin merapikan versi   │
 * │     TAYANG; `isiAsli` tetap utuh selamanya.                           │
 * │  2. Bintang milik pasien. Admin tidak bisa menyentuhnya sama sekali   │
 * │     — bukan disembunyikan tombolnya, tapi memang tidak ada jalannya   │
 * │     di API.                                                           │
 * │  3. Yang menentukan boleh-tidaknya tayang adalah PASIEN. Admin hanya  │
 * │     bisa menayangkan dari yang sudah diizinkan, tidak bisa membuat    │
 * │     izin itu sendiri.                                                 │
 * │                                                                       │
 * │  Kalau salah satu dilanggar, yang tayang bukan lagi suara pasien —    │
 * │  melainkan ulasan yang ditulis penjual tentang dirinya sendiri.       │
 * └──────────────────────────────────────────────────────────────────────┘
 */

export type IzinTayang = "BOLEH_NAMA" | "BOLEH_SAMARAN" | "JANGAN_TAYANG";

export const NAMA_IZIN: Record<IzinTayang, string> = {
  BOLEH_NAMA: "Boleh tayang dengan nama saya",
  BOLEH_SAMARAN: "Boleh tayang, tapi nama saya disamarkan",
  JANGAN_TAYANG: "Jangan ditayangkan — cukup untuk perawat dan admin",
};

export const PENJELASAN_IZIN: Record<IzinTayang, string> = {
  BOLEH_NAMA: "Nama lengkap Anda muncul di halaman depan aplikasi.",
  BOLEH_SAMARAN:
    "Yang muncul hanya inisial dan daerah Anda, misalnya “B. S. — Sawojajar”.",
  JANGAN_TAYANG:
    "Tidak muncul di mana pun selain layar perawat yang menangani dan admin.",
};

export type StatusTinjauan = "BARU" | "DITINJAU" | "TAYANG" | "TIDAK_TAYANG";

/* ------------------------------------------------------------------ */
/* Penyortiran kritik sebelum sampai ke perawat                        */
/* ------------------------------------------------------------------ */

/**
 * Dua keputusan yang BERBEDA dan tidak saling mengunci:
 *
 *   statusTinjauan  → boleh tidak tayang di halaman depan (publik)
 *   statusKePerawat → sudah tidak diteruskan ke perawat yang menangani
 *
 * Testimoni bisa tayang publik tapi belum diteruskan ke perawat, dan
 * sebaliknya. Menggabungkan keduanya jadi satu tombol memaksa admin memilih
 * antara memuji di depan umum dan memperbaiki di dalam.
 */
export type StatusKePerawat = "BARU" | "DITAHAN" | "DITERUSKAN";

export const NAMA_KE_PERAWAT: Record<StatusKePerawat, string> = {
  BARU: "Belum disortir",
  DITAHAN: "Ditahan admin",
  DITERUSKAN: "Sudah diteruskan",
};

export const PENJELASAN_KE_PERAWAT: Record<StatusKePerawat, string> = {
  BARU: "Perawat belum melihat masukan ini. Sortir dulu.",
  DITAHAN: "Perawat belum melihatnya. Teruskan setelah selesai diverifikasi.",
  DITERUSKAN: "Perawat sudah membaca tulisan asli pasien beserta pengantar Anda.",
};

/**
 * Boleh tidak testimoni ini ditahan dari perawatnya.
 *
 * Keputusan 8 September 2026: keluhan yang menyangkut keselamatan atau
 * kondisi kesehatan pasien TIDAK BISA ditahan sama sekali. Alasannya bukan
 * kenyamanan perawat — melainkan bahwa tuduhan atas praktik seseorang harus
 * sampai ke orangnya. Kalau perkaranya berlanjut, perawat yang baru tahu
 * berbulan-bulan kemudian sudah kehilangan kesempatan menjelaskan, dan
 * kehilangan bukti yang mungkin ada di ingatannya sendiri.
 *
 * Admin tetap boleh menambahkan pengantar — misalnya "sudah saya
 * hubungi pasiennya, ada salah paham soal jadwal". Yang tidak boleh adalah
 * menahannya.
 */
export function bolehDitahan(t: { bahayaKlinis?: boolean | null }): {
  boleh: boolean;
  alasan: string;
} {
  if (t?.bahayaKlinis)
    return {
      boleh: false,
      alasan:
        "Pasien menandai keluhan ini menyangkut keselamatan atau kondisi kesehatannya. Keluhan seperti ini langsung sampai ke perawat dan tidak bisa ditahan — Anda tetap bisa menambahkan pengantar.",
    };
  return { boleh: true, alasan: "" };
}

/** Apa yang menghalangi admin menahan sebuah masukan. */
export function penghalangTahan(opsi: {
  bahayaKlinis?: boolean | null;
  alasan: string;
}): string | null {
  const cek = bolehDitahan(opsi);
  if (!cek.boleh) return cek.alasan;
  if (opsi.alasan.trim().length < 5)
    return "Tulis alasan menahannya — tercatat di jejak audit dan terlihat saat ditinjau ulang.";
  return null;
}

export const NAMA_TINJAUAN: Record<StatusTinjauan, string> = {
  BARU: "Belum dibaca",
  DITINJAU: "Sudah dibaca",
  TAYANG: "Tayang publik",
  TIDAK_TAYANG: "Tidak ditayangkan",
};

/* ------------------------------------------------------------------ */
/* Aspek penilaian                                                     */
/* ------------------------------------------------------------------ */

/**
 * Tiga aspek yang dinilai pasien, disetujui 7 September 2026.
 *
 * Sengaja tiga, bukan tujuh. Borang penilaian yang panjang diisi asal-asalan
 * — semua diberi 5 bintang supaya cepat selesai — dan hasilnya tidak bisa
 * dipakai untuk apa pun.
 */
export const ASPEK = [
  {
    kunci: "nilaiKetepatanWaktu" as const,
    label: "Ketepatan waktu",
    tanya: "Perawat datang sesuai jadwal yang disepakati?",
  },
  {
    kunci: "nilaiKeterampilan" as const,
    label: "Keterampilan tindakan",
    tanya: "Cekatan, tidak membuat sakit berlebihan, hasilnya rapi?",
  },
  {
    kunci: "nilaiKebersihan" as const,
    label: "Kebersihan & kesterilan",
    tanya: "Cuci tangan, sarung tangan, alat steril, sampah medis dibawa pulang?",
  },
];

export type KunciAspek = (typeof ASPEK)[number]["kunci"];

/* ------------------------------------------------------------------ */
/* Penyamaran nama                                                     */
/* ------------------------------------------------------------------ */

/**
 * Mengubah nama asli jadi nama tayang, sesuai izin pasien.
 *
 * Penyamaran memakai inisial + daerah, bukan "Pasien A". Dua alasan:
 * inisial masih terasa seperti orang sungguhan sehingga testimoninya bisa
 * dipercaya, sementara daerah membantu calon pasien di Malang mengenali
 * bahwa layanan ini memang sampai ke tempat mereka. Tapi keduanya tidak
 * cukup untuk menunjuk satu orang tertentu.
 */
export function namaTayang(
  namaAsli: string,
  izin: IzinTayang,
  wilayah?: string | null
): string {
  if (izin === "JANGAN_TAYANG") return "";
  if (izin === "BOLEH_NAMA") return namaAsli.trim();

  const bersih = namaAsli
    .replace(/^(Bpk\.|Ibu|Bapak|Ny\.|Tn\.|Sdr\.|Ns\.)\s*/i, "")
    .trim();
  const inisial = bersih
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((k) => k[0].toUpperCase() + ".")
    .join(" ");

  const tempat = (wilayah ?? "").trim();
  return tempat ? `${inisial} — ${tempat}` : inisial || "Pasien";
}

/**
 * Mengambil nama daerah dari alamat lengkap.
 *
 * Alamat pemesanan berbentuk "Jl. Danau Toba Blok C-7, Sawojajar,
 * Kedungkandang, Kota Malang". Yang diambil bagian kedua — kelurahan —
 * karena itu cukup untuk memberi rasa "dekat rumah saya" tanpa menunjuk
 * satu rumah. Nomor jalan TIDAK pernah ikut.
 */
export function wilayahDariAlamat(alamat?: string | null): string {
  const bagian = String(alamat ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  // Bagian pertama hampir selalu mengandung nomor rumah — dilewati.
  return bagian[1] ?? "";
}

/* ------------------------------------------------------------------ */
/* Penilaian perawat                                                   */
/* ------------------------------------------------------------------ */

export type RingkasanNilai = {
  jumlah: number;
  rata: number | null;
  perAspek: { label: string; rata: number | null; jumlah: number }[];
};

function rataDari(angka: (number | null | undefined)[]): { rata: number | null; jumlah: number } {
  const sah = angka.filter((x): x is number => typeof x === "number" && x >= 1 && x <= 5);
  if (!sah.length) return { rata: null, jumlah: 0 };
  return { rata: sah.reduce((a, b) => a + b, 0) / sah.length, jumlah: sah.length };
}

/**
 * Ringkasan nilai seorang perawat.
 *
 * SEMUA testimoni ikut dihitung — termasuk yang tidak ditayangkan dan yang
 * berupa keluhan. Kalau hanya yang tayang yang dihitung, angkanya jadi
 * rata-rata dari testimoni yang lolos seleksi admin, bukan dari pelayanan
 * yang sebenarnya. Peringkat semacam itu tidak berguna untuk memperbaiki
 * apa pun.
 */
export function ringkasNilai(daftar: any[]): RingkasanNilai {
  const keseluruhan = rataDari(daftar.map((t) => t.bintang));
  return {
    jumlah: daftar.length,
    rata: keseluruhan.rata,
    perAspek: ASPEK.map((a) => {
      const r = rataDari(daftar.map((t) => t[a.kunci]));
      return { label: a.label, rata: r.rata, jumlah: r.jumlah };
    }),
  };
}

/**
 * Testimoni yang teksnya boleh dibaca perawat.
 *
 * Nilainya tetap dihitung dari SEMUA (lihat ringkasNilai) — yang disaring
 * di sini hanya kalimatnya.
 */
export function bolehDibacaPerawat(t: { statusKePerawat?: string | null }): boolean {
  return t?.statusKePerawat === "DITERUSKAN";
}

/** "4,8" — koma, bukan titik. */
export function bintangTeks(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(1).replace(".", ",");
}

/* ------------------------------------------------------------------ */
/* Penjagaan                                                           */
/* ------------------------------------------------------------------ */

/** Apa yang menghalangi pasien mengirim testimoni. */
export function penghalangKirim(opsi: {
  bintang: number;
  isi: string;
  izin: IzinTayang | "";
}): string | null {
  if (!opsi.bintang) return "Beri bintang dulu untuk keseluruhan pelayanan.";
  if (opsi.isi.trim().length < 10)
    return "Tulis sedikit ceritanya — minimal satu kalimat.";
  if (!opsi.izin) return "Pilih dulu boleh atau tidaknya testimoni ini ditayangkan.";
  return null;
}

/**
 * Apa yang menghalangi admin menayangkan sebuah testimoni.
 *
 * Ini penjagaan utamanya: admin tidak bisa menayangkan tulisan yang pasien
 * minta jangan ditayangkan, sekuat apa pun keinginannya. Diperiksa di layar
 * DAN di server.
 */
export function penghalangTayang(t: {
  izinTayang?: string | null;
  keluhan?: boolean | null;
  isiTayang?: string | null;
}): string | null {
  if (t.izinTayang === "JANGAN_TAYANG")
    return "Pasien meminta testimoni ini tidak ditayangkan. Tidak bisa ditayangkan.";
  if (t.keluhan)
    return "Ini ditandai sebagai keluhan. Selesaikan dulu keluhannya bersama pasien; kalau ia kemudian setuju, ia bisa mengubah pilihannya sendiri.";
  if (!String(t.isiTayang ?? "").trim())
    return "Isi testimoni kosong.";
  return null;
}

/** Apa yang menghalangi admin menyimpan hasil merapikan. */
export function penghalangEdit(opsi: {
  isiTayang: string;
  isiAsli: string;
  alasan: string;
}): string | null {
  const berubah = opsi.isiTayang.trim() !== opsi.isiAsli.trim();
  if (!berubah) return null;
  if (!opsi.isiTayang.trim()) return "Versi tayang tidak boleh kosong.";
  if (opsi.alasan.trim().length < 5)
    return "Tulis alasan perubahannya — tercatat bersama teks aslinya.";
  // Merapikan berarti memotong dan membetulkan, bukan menulis ulang. Kalau
  // hasilnya jauh lebih panjang dari aslinya, itu bukan lagi tulisan pasien.
  if (opsi.isiTayang.trim().length > opsi.isiAsli.trim().length * 1.2 + 40)
    return "Versi tayang jauh lebih panjang dari tulisan asli pasien. Merapikan berarti memotong dan membetulkan, bukan menambahi.";
  return null;
}
