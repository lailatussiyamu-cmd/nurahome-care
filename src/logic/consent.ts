/**
 * Persetujuan tindakan dan persetujuan pemakaian foto luka.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  TEKS DI BAWAH INI BELUM DITINJAU AHLI HUKUM.                         │
 * │  Saya menyusunnya dari sumber terbuka, bukan sebagai nasihat hukum.  │
 * │  Sebelum dipakai untuk pasien sungguhan, mintalah pengacara atau     │
 * │  bagian hukum meninjau kalimatnya — terutama bagian kewenangan       │
 * │  perawat dan penanganan foto luka.                                   │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Dua hal yang menentukan bentuk berkas ini:
 *
 * 1. UU 27/2022 (Pelindungan Data Pribadi) Pasal 4 ayat (2) menyebut data
 *    kesehatan sebagai data pribadi BERSIFAT SPESIFIK. Pasal 20 ayat (2)
 *    huruf a menuntut persetujuan yang eksplisit untuk tujuan tertentu, dan
 *    Pasal 21 ayat (1) menuntut sederet keterangan disampaikan LEBIH DULU:
 *    dasar hukum, tujuan, jenis data, jangka waktu penyimpanan, dan hak
 *    pemilik data. Karena itu persetujuan foto dipisah dari persetujuan
 *    tindakan — mencentang satu kotak untuk dua hal berbeda bukan
 *    persetujuan yang eksplisit.
 *
 * 2. Persetujuan harus bisa dibuktikan setelah kalimatnya berubah. Karena
 *    itu yang disimpan adalah SELURUH TEKS apa adanya (lihat kolom
 *    `textSnapshot` di schema), bukan nomor versinya saja. Nomor versi
 *    hanya penanda; teksnyalah buktinya.
 */

import { rp } from "./biaya";
import { penawaranSebagaiTeks, type ItemPenawaran } from "./alur";

/** Naikkan setiap kali kalimat di bawah berubah. Jangan pernah dipakai ulang. */
export const VERSI_CONSENT = "2026.09.07-1";

export type HubunganPenandaTangan =
  | "DIRI_SENDIRI"
  | "ORANG_TUA"
  | "WALI"
  | "ANAK"
  | "SUAMI_ISTRI";

export const NAMA_HUBUNGAN: Record<HubunganPenandaTangan, string> = {
  DIRI_SENDIRI: "Pasien sendiri",
  ORANG_TUA: "Orang tua pasien",
  WALI: "Wali pasien",
  ANAK: "Anak pasien",
  SUAMI_ISTRI: "Suami/istri pasien",
};

export type BahanConsent = {
  namaPasien: string;
  namaLayanan: string;
  kategori: string;
  namaPerawat: string;
  nomorSTR: string;
  temuanPerawat: string;
  item: ItemPenawaran[];
  total: number;
  tanggalKunjungan: string;
  jamKunjungan: string;
  alamat: string;
};

/**
 * Risiko yang wajib disebut, per jenis tindakan.
 *
 * Persetujuan yang hanya berbunyi "saya menyetujui tindakan" bukan informed
 * consent — yang membuatnya *informed* adalah pasien tahu apa yang bisa
 * terjadi. Daftarnya sengaja pendek dan konkret; daftar panjang berisi
 * istilah teknis tidak dibaca siapa pun.
 */
const RISIKO: Record<string, string[]> = {
  WOUND_CARE: [
    "Nyeri saat jaringan mati dibersihkan; bisa terasa perih beberapa jam sesudahnya.",
    "Perdarahan ringan dari dasar luka saat pembersihan.",
    "Luka bisa tampak lebih besar setelah jaringan mati diangkat — ini normal, bukan perburukan.",
    "Kulit sekitar luka bisa memerah atau gatal karena perekat balutan.",
    "Infeksi tetap mungkin terjadi meski alat dan bahan steril.",
    "Penyembuhan bisa lebih lambat pada penderita diabetes, perokok, atau gangguan aliran darah.",
  ],
  CIRCUMCISION: [
    "Nyeri dan bengkak pada beberapa hari pertama.",
    "Perdarahan; sebagian kecil kasus memerlukan penanganan lanjutan di fasilitas kesehatan.",
    "Infeksi pada luka sunat.",
    "Hasil penyembuhan bisa tidak simetris atau menyisakan kulit lebih pada satu sisi.",
    "Alat (Super-Ring/Smart Klamp) bisa lepas lebih awal dan perlu dipasang ulang.",
    "Pada keadaan tertentu tindakan harus dihentikan dan dirujuk ke rumah sakit.",
  ],
};

const RISIKO_UMUM = [
  "Reaksi alergi terhadap obat bius lokal, antiseptik, atau bahan balutan.",
  "Keadaan tak terduga yang membuat tindakan dihentikan dan dirujuk ke IGD.",
];

/**
 * Menyusun seluruh isi persetujuan tindakan.
 *
 * Dikembalikan sebagai teks biasa, bukan komponen React, supaya yang tampil
 * di layar dan yang tersimpan di basis data DIJAMIN kalimat yang sama —
 * kalau keduanya dirakit terpisah, cepat atau lambat keduanya berbeda.
 */
export function teksPersetujuanTindakan(b: BahanConsent): string {
  const risiko = [...(RISIKO[b.kategori] ?? []), ...RISIKO_UMUM];

  return `PERSETUJUAN TINDAKAN KEPERAWATAN DI RUMAH
Versi ${VERSI_CONSENT}

1. SIAPA YANG MENGERJAKAN
   Nama perawat : ${b.namaPerawat}
   Nomor STR    : ${b.nomorSTR}
   Tindakan ini dikerjakan oleh perawat, bukan dokter. Perawat bekerja
   sesuai kewenangan profesinya. Bila selama kunjungan ditemukan keadaan di
   luar kewenangan tersebut, tindakan dihentikan dan Anda diarahkan ke
   fasilitas kesehatan yang sesuai.

2. TINDAKAN YANG AKAN DILAKUKAN
   Pasien   : ${b.namaPasien}
   Layanan  : ${b.namaLayanan}
   Jadwal   : ${b.tanggalKunjungan}, ${b.jamKunjungan}
   Alamat   : ${b.alamat}

3. HASIL PENILAIAN PERAWAT ATAS KONDISI ANDA
${b.temuanPerawat
  .trim()
  .split("\n")
  .map((x) => "   " + x.trim())
  .join("\n")}

4. RISIKO DAN HAL YANG BISA TERJADI
${risiko.map((r) => `   - ${r}`).join("\n")}

5. PILIHAN LAIN
   Anda berhak menolak tindakan ini, meminta pendapat tenaga kesehatan lain,
   atau memilih dirawat di puskesmas, klinik, atau rumah sakit. Menolak
   tidak menghilangkan hak Anda memakai layanan ini di kemudian hari.

6. BIAYA YANG DISEPAKATI
${penawaranSebagaiTeks(b.item)
  .split("\n")
  .map((x) => "   " + x)
  .join("\n")}

   Total yang Anda setujui: ${rp(b.total)}
   Tidak ada biaya lain di luar rincian ini. Bila di lapangan ternyata
   diperlukan bahan tambahan, perawat WAJIB meminta persetujuan Anda lebih
   dulu sebelum memakainya.

7. HAK ANDA
   - Bertanya kapan saja sebelum dan selama tindakan.
   - Menghentikan tindakan di tengah jalan.
   - Meminta salinan laporan tindakan dan catatan perawatan.
   - Mengadu bila pelayanan tidak sesuai.

Dengan menuliskan nama di bawah ini, saya menyatakan telah membaca dan
memahami seluruh keterangan di atas, dan menyetujui tindakan tersebut
dilakukan di rumah dengan biaya sebagaimana dirinci pada angka 6.`;
}

/**
 * Persetujuan terpisah untuk foto luka.
 *
 * Isinya mengikuti daftar keterangan wajib pada UU 27/2022 Pasal 21 ayat
 * (1): dasar hukum, tujuan, jenis data, jangka waktu penyimpanan, dan hak
 * pemilik data. Ditolak pun pemesanan tetap bisa jalan — foto memudahkan
 * penilaian, tapi menjadikannya syarat mutlak berarti memaksa orang
 * menyerahkan data kesehatan untuk mendapat layanan.
 */
export function teksPersetujuanFoto(namaPasien: string): string {
  return `PERSETUJUAN PENYIMPANAN DAN PEMAKAIAN FOTO LUKA
Versi ${VERSI_CONSENT}

Foto luka adalah data kesehatan. Menurut Undang-Undang Nomor 27 Tahun 2022
tentang Pelindungan Data Pribadi, data kesehatan termasuk data pribadi yang
bersifat spesifik (Pasal 4 ayat 2), dan pemrosesannya memerlukan persetujuan
yang tegas dari pemiliknya (Pasal 20 ayat 2 huruf a). Karena itu kami
menjelaskan lebih dulu:

TUJUAN PEMAKAIAN
  - Menilai kondisi luka sebelum kunjungan, untuk menentukan bahan yang
    diperlukan dan biayanya.
  - Membandingkan keadaan luka sebelum dan sesudah tindakan.
  - Menjadi bukti pekerjaan bila terjadi keluhan atau sengketa.

SIAPA YANG BISA MELIHAT
  Hanya perawat yang menangani pemesanan ini dan penanggung jawab klinis
  layanan. Foto TIDAK dipakai untuk iklan, TIDAK diunggah ke media sosial,
  dan TIDAK dibagikan ke pihak ketiga tanpa persetujuan Anda lagi.

BERAPA LAMA DISIMPAN
  Disimpan selama 25 (dua puluh lima) tahun sejak kunjungan TERAKHIR Anda,
  lalu dihapus. Kalau Anda datang lagi, hitungannya dimulai ulang dari
  kunjungan yang terbaru.

  Lamanya bukan pilihan kami. Peraturan Menteri Kesehatan Nomor 24 Tahun
  2022 Pasal 39 ayat (1) mewajibkan rekam medis elektronik disimpan paling
  singkat 25 tahun sejak kunjungan terakhir pasien.

HAK ANDA
  - Meminta salinan foto Anda, kapan saja.
  - Menarik persetujuan ini kapan saja. Setelah ditarik, foto Anda TIDAK
    dipakai lagi untuk apa pun selain menyimpannya sebagai rekam medis.
  - Meminta foto dihapus. Perlu kami sampaikan terus terang: selama masa
    25 tahun itu, permintaan hapus TIDAK selalu bisa kami penuhi, karena
    menyimpannya adalah kewajiban hukum yang berlaku bagi kami. Yang pasti
    bisa: foto tidak ditampilkan lagi, tidak dipakai untuk apa pun, dan
    hanya tersimpan sebagai rekam medis.
  - Menolak memberi foto. Pemesanan tetap dapat diproses; hanya saja
    perawat menilai lewat keterangan tertulis, dan rincian bahan bisa
    berubah setelah ia melihat langsung.

Saya, ${namaPasien}, menyetujui foto luka saya disimpan dan dipakai
sebagaimana dijelaskan di atas.`;
}

/** Apa yang menghalangi persetujuan ditandatangani. */
export function penghalangTandaTangan(opsi: {
  namaTandaTangan: string;
  sudahBacaTindakan: boolean;
  hubungan: HubunganPenandaTangan | "";
}): string | null {
  if (!opsi.sudahBacaTindakan)
    return "Centang dulu bahwa Anda sudah membaca persetujuan tindakan.";
  if (!opsi.hubungan) return "Pilih hubungan Anda dengan pasien.";
  if (opsi.namaTandaTangan.trim().length < 3)
    return "Tulis nama lengkap Anda sebagai tanda tangan.";
  return null;
}
