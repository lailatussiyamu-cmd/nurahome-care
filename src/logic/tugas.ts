/**
 * Tugas terjadwal yang dijalankan server, bukan oleh orang.
 *
 * Sebagian janji di aplikasi ini hanya bisa ditepati oleh sesuatu yang
 * berjalan sendiri tanpa ada yang membuka layar. Yang paling penting:
 * teks persetujuan menjanjikan foto luka dihapus setelah masa simpannya
 * habis. Sampai
 * ada yang benar-benar menghapusnya, kalimat itu janji kosong — dan janji
 * kosong soal data kesehatan lebih buruk daripada tidak berjanji.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  TUGAS DI SINI MENGHAPUS DAN MENGUBAH DATA PASIEN.                    │
 * │  Karena itu semuanya:                                                 │
 * │   - punya mode UJI KERING (tidak menulis apa pun, hanya melapor);     │
 * │   - punya batas maksimum baris per jalan, supaya satu kesalahan       │
 * │     tidak menyapu seluruh basis data sekaligus;                       │
 * │   - mencatat apa yang dikerjakannya ke audit_logs.                    │
 * │  Jalankan uji kering dulu setiap kali mengubah aturannya.             │
 * └──────────────────────────────────────────────────────────────────────┘
 */

/* ------------------------------------------------------------------ */
/* Tenggat — ANGKA DI BAWAH INI BELUM DISETUJUI, ISI SESUAI KEBIJAKAN  */
/* ------------------------------------------------------------------ */

export const TENGGAT = {
  /**
   * Masa simpan rekam medis, termasuk foto luka.
   *
   * 25 tahun, mengikuti Permenkes 24/2022 Pasal 39 ayat (1): "Penyimpanan
   * data Rekam Medis Elektronik di Fasilitas Pelayanan Kesehatan dilakukan
   * paling singkat 25 (dua puluh lima) tahun sejak tanggal kunjungan
   * terakhir Pasien."
   *
   * Diputuskan 9 September 2026, menggantikan angka 5 yang sebelumnya
   * dipakai — dan yang dulu benar-benar menghapus foto.
   *
   * ┌──────────────────────────────────────────────────────────────────┐
   * │  ANGKA INI HARUS SAMA dengan yang tertulis di logic/consent.ts,  │
   * │  di wizard pemesanan, dan di layar hasil kunjungan.              │
   * │  Kalau berbeda, aplikasi menjanjikan satu hal kepada pasien dan  │
   * │  melakukan hal lain — dan yang mengikat adalah kalimat yang      │
   * │  pasien baca.                                                     │
   * └──────────────────────────────────────────────────────────────────┘
   */
  simpanFotoTahun: 25,

  /** Penawaran yang tidak dijawab pasien dianggap hangus setelah ini. */
  penawaranJam: 48,

  /** Permintaan yang tidak diambil perawat mana pun; perlu didorong. */
  tanpaPenanganJam: 6,

  /** Sudah disetujui tapi tidak dibayar; jadwalnya dilepas kembali. */
  belumDibayarJam: 24,

  /** Kunjungan yang perawatnya lupa menutup laporannya. */
  belumDitutupJam: 12,

  /** Pengingat ke pasien & perawat sebelum jadwal kunjungan. */
  pengingatJam: 24,

  /**
   * Jarak minimum antar pengingat untuk pemesanan yang sama.
   *
   * Tugas pendorong berjalan tiap jam, tapi orangnya tidak boleh diingatkan
   * tiap jam. Tanpa jeda ini, satu permintaan yang menggantung seminggu
   * menghasilkan 168 pemberitahuan ke pasien dan 168 lagi ke admin.
   */
  jedaDorongJam: 12,

  /**
   * Berapa lama masukan pasien boleh menunggu di meja admin sebelum
   * diingatkan.
   *
   * Tidak diteruskan otomatis — penyortiran memang wewenang admin, dan
   * meneruskan kritik yang belum diverifikasi bisa merugikan perawat yang
   * ternyata tidak salah. Yang tidak boleh adalah masukannya TERLUPAKAN
   * diam-diam: pasien menunggu jawaban, dan perawat tidak tahu ada yang
   * dikeluhkan.
   */
  sortirTestimoniJam: 72,

  /**
   * Berapa lama sebuah pembayaran boleh berstatus MENUNGGU sebelum server
   * bertanya sendiri ke Midtrans.
   *
   * Kabar dari penyedia bisa tidak pernah sampai — jaringan putus, server
   * sedang di-deploy, alamat webhook salah ketik di dasbor. Tanpa
   * pencocokan ini, satu kabar yang hilang berarti pasien SUDAH membayar
   * tetapi kunjungannya dibatalkan otomatis setelah 24 jam karena
   * tercatat belum dibayar. Uangnya masuk, jadwalnya hilang — kesalahan
   * paling merugikan yang bisa dilakukan aplikasi ini.
   *
   * Sengaja jauh lebih pendek dari belumDibayarJam (24), supaya
   * pencocokan selalu sempat berjalan beberapa kali sebelum pembatalan.
   */
  cocokkanBayarJam: 1,
} as const;

/** Berapa banyak baris paling banyak disentuh dalam satu kali jalan. */
export const BATAS_PER_JALAN = 200;

/* ------------------------------------------------------------------ */
/* Bentuk hasil                                                        */
/* ------------------------------------------------------------------ */

export type HasilTugas = {
  nama: string;
  ujiKering: boolean;
  diperiksa: number;
  dikenai: number;
  /** Ringkasan yang bisa dibaca orang, untuk dicatat ke audit_logs. */
  catatan: string[];
  galat?: string;
};

export function hasilKosong(nama: string, ujiKering: boolean): HasilTugas {
  return { nama, ujiKering, diperiksa: 0, dikenai: 0, catatan: [] };
}

/* ------------------------------------------------------------------ */
/* Perhitungan waktu — dipisah supaya bisa diuji tanpa basis data      */
/* ------------------------------------------------------------------ */

export function jamBerlalu(sejak: Date | string | null | undefined, sekarang = new Date()): number {
  if (!sejak) return Infinity;
  const d = sejak instanceof Date ? sejak : new Date(sejak);
  if (isNaN(d.getTime())) return Infinity;
  return (sekarang.getTime() - d.getTime()) / 3_600_000;
}

/** Sudah waktunya mengingatkan lagi soal pemesanan ini? */
export function bolehDidorong(
  terakhir: Date | string | null | undefined,
  sekarang = new Date()
): boolean {
  return jamBerlalu(terakhir, sekarang) >= TENGGAT.jedaDorongJam;
}

export function batasSimpanFoto(sekarang = new Date()): Date {
  const d = new Date(sekarang);
  d.setFullYear(d.getFullYear() - TENGGAT.simpanFotoTahun);
  return d;
}

/**
 * Apakah foto sebuah pemesanan boleh dihapus.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  MASA SIMPAN DIHITUNG DARI KUNJUNGAN TERAKHIR PASIEN,                 │
 * │  BUKAN DARI KUNJUNGAN INI.                                            │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Permenkes 24/2022 Pasal 39 ayat (1) berbunyi "…sejak tanggal kunjungan
 * terakhir Pasien" — per PASIEN, bukan per pemesanan.
 *
 * Bedanya nyata. Seorang pasien dirawat tahun 2026, lalu datang lagi tahun
 * 2040. Kalau dihitung per pemesanan, foto 2026 dihapus pada 2051. Padahal
 * kunjungan terakhirnya 2040, jadi seluruh rekamnya — termasuk yang 2026 —
 * harus disimpan sampai 2065.
 *
 * Versi pertama berkas ini menghitungnya per pemesanan. Ketahuan saat
 * membaca bunyi pasalnya kata per kata, bukan saat menulis kodenya.
 *
 * Dua penahan yang sengaja ada:
 *
 * 1. Pemesanan yang ditandai bersengketa TIDAK pernah dihapus. Menghapus
 *    bukti saat perkaranya masih berjalan adalah hal terburuk yang bisa
 *    dilakukan sistem ini — merugikan pasien maupun perawat sekaligus.
 * 2. Pemesanan yang belum selesai juga tidak disentuh, apa pun umurnya.
 */
export function bolehHapusFoto(
  pesanan: { status?: string | null; scheduledDate?: string | null; sengketa?: boolean | null },
  sekarang = new Date(),
  kunjunganTerakhirPasien?: string | null
): { boleh: boolean; alasan: string } {
  if (!pesanan) return { boleh: false, alasan: "Pemesanan tidak ditemukan." };
  if (pesanan.sengketa) return { boleh: false, alasan: "Ditahan: sedang bersengketa." };
  if (pesanan.status !== "SELESAI" && pesanan.status !== "DIBATALKAN")
    return { boleh: false, alasan: "Ditahan: kunjungan belum selesai." };

  const tgl = String(pesanan.scheduledDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl))
    return { boleh: false, alasan: "Ditahan: tanggal kunjungan tidak terbaca." };

  /**
   * Kalau tanggal kunjungan terakhir pasien tidak diberikan, dipakai
   * tanggal pemesanan ini — yang selalu LEBIH AWAL atau sama. Artinya
   * kalau pemanggilnya lupa, akibatnya adalah menghapus terlalu cepat.
   *
   * Karena itu ketiadaannya diperlakukan sebagai penahan, bukan sebagai
   * nilai bawaan yang tenang. Pada pilihan antara menghapus terlalu cepat
   * dan menahan terlalu lama, yang kedua bisa diperbaiki.
   */
  if (kunjunganTerakhirPasien === undefined)
    return { boleh: false, alasan: "Ditahan: kunjungan terakhir pasien belum dihitung." };

  const acuan = String(kunjunganTerakhirPasien ?? tgl);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acuan))
    return { boleh: false, alasan: "Ditahan: tanggal kunjungan terakhir pasien tidak terbaca." };

  const kunjungan = new Date(`${acuan}T00:00:00`);
  if (kunjungan > batasSimpanFoto(sekarang))
    return { boleh: false, alasan: "Belum lewat masa simpan." };

  return { boleh: true, alasan: "" };
}

/* ------------------------------------------------------------------ */
/* Daftar tugas                                                        */
/* ------------------------------------------------------------------ */

export type NamaTugas =
  | "cocokkan-pembayaran"
  | "testimoni-belum-disortir"
  | "hapus-foto-kedaluwarsa"
  | "penawaran-hangus"
  | "permintaan-menggantung"
  | "belum-dibayar"
  | "kunjungan-belum-ditutup"
  | "pengingat-kunjungan";

export const TUGAS: { nama: NamaTugas; jadwal: string; penjelasan: string }[] = [
  {
    nama: "cocokkan-pembayaran",
    jadwal: "setiap jam",
    penjelasan:
      "Menanyakan langsung ke Midtrans keadaan pembayaran yang masih menunggu lebih dari 1 jam — jaring pengaman untuk kabar yang tidak pernah sampai. Dijalankan SEBELUM tugas belum-dibayar, supaya tidak ada kunjungan yang dibatalkan padahal uangnya sudah masuk.",
  },
  {
    nama: "testimoni-belum-disortir",
    jadwal: "08:00 setiap hari",
    penjelasan:
      "Masukan pasien yang lebih dari 3 hari belum diteruskan ke perawatnya diingatkan ke admin. Tidak diteruskan otomatis — penyortiran tetap wewenang admin.",
  },
  {
    nama: "hapus-foto-kedaluwarsa",
    jadwal: "03:10 setiap hari",
    penjelasan:
      `Menghapus foto luka yang sudah lewat masa simpan ${TENGGAT.simpanFotoTahun} tahun sejak kunjungan TERAKHIR pasien (Permenkes 24/2022 Pasal 39), menepati janji di teks persetujuan.`,
  },
  {
    nama: "penawaran-hangus",
    jadwal: "setiap jam",
    penjelasan:
      "Penawaran yang tidak dijawab pasien dalam 48 jam dikembalikan ke antrean perawat lain.",
  },
  {
    nama: "permintaan-menggantung",
    jadwal: "setiap jam",
    penjelasan:
      "Permintaan yang belum diambil perawat mana pun setelah 6 jam ditandai supaya admin turun tangan.",
  },
  {
    nama: "belum-dibayar",
    jadwal: "setiap jam",
    penjelasan:
      "Pemesanan yang sudah disetujui tapi tidak dibayar dalam 24 jam dilepas, supaya jadwal perawat tidak terkunci percuma.",
  },
  {
    nama: "kunjungan-belum-ditutup",
    jadwal: "setiap 3 jam",
    penjelasan:
      "Kunjungan yang laporannya belum ditandatangani setelah 12 jam diingatkan ke perawatnya.",
  },
  {
    nama: "pengingat-kunjungan",
    jadwal: "07:00 setiap hari",
    penjelasan: "Mengingatkan pasien dan perawat sehari sebelum jadwal kunjungan.",
  },
];

/** Nama tugas yang sah, untuk memeriksa masukan dari luar. */
export function tugasSah(nama: string): nama is NamaTugas {
  return TUGAS.some((t) => t.nama === nama);
}

/* ------------------------------------------------------------------ */
/* Penanda foto yang gambarnya sudah dihapus                           */
/* ------------------------------------------------------------------ */

/**
 * Nilai yang menggantikan gambar setelah masa simpannya habis.
 *
 * Barisnya tetap ada — yang hilang gambarnya, bukan catatan bahwa dulu ada
 * foto di tahap itu. Layar harus bisa membedakan tiga keadaan: belum ada
 * foto, ada foto, dan foto sudah dihapus karena masa simpan. Tanpa penanda
 * ini yang ketiga tampil sebagai gambar rusak.
 */
export const FOTO_TERHAPUS = "TERHAPUS:MASA_SIMPAN";

export function fotoSudahDihapus(foto?: { imageUrl?: string | null } | null): boolean {
  return foto?.imageUrl === FOTO_TERHAPUS;
}
