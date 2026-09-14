/**
 * Perhitungan biaya kunjungan — satu tempat, dipakai semua.
 *
 * Sebelum berkas ini ada, angkanya tersebar: bawaan skema Rp 45.000, wizard
 * Rp 55.000, dan data awal Rp 65.000 untuk hal yang sama. Aritmetikanya
 * masing-masing benar, tapi harga yang dikutip ke pasien jadi tergantung
 * lewat jalur mana pemesanannya dibuat. Untuk layanan berbayar itu tidak
 * boleh. Semua yang menyangkut uang sekarang lewat sini.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  ANGKA DI BAWAH INI BELUM DISETUJUI — ISI SESUAI TARIF ANDA.    │
 * │  Strukturnya sudah siap; yang perlu diganti hanya nilainya.     │
 * └─────────────────────────────────────────────────────────────────┘
 */

/** Titik pangkal perjalanan perawat: alun-alun Kota Malang. */
export const PANGKALAN = { lat: -7.9797, lng: 112.6304 };

/**
 * Jarak garis lurus dalam kilometer (rumus haversine).
 *
 * Ini jarak "burung terbang", bukan jarak tempuh jalan. Di Malang selisihnya
 * biasanya 20–35% karena jalannya tidak lurus, jadi tarif di bawah sudah
 * memperhitungkan itu — JANGAN ditambah faktor pengali lagi di tempat lain.
 * Kalau nanti mau akurat betul, ganti fungsi ini dengan panggilan ke layanan
 * peta; sisanya tidak perlu diubah.
 */
export function jarakKm(
  dari: { lat: number; lng: number },
  ke: { lat: number; lng: number }
): number {
  const R = 6371; // jari-jari bumi, km
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(ke.lat - dari.lat);
  const dLng = rad(ke.lng - dari.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(dari.lat)) * Math.cos(rad(ke.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Tarif jarak bertingkat. Batas atas 25 km = di luar wilayah layanan. */
export const TARIF_JARAK: { sampaiKm: number; biaya: number; label: string }[] = [
  { sampaiKm: 8, biaya: 15000, label: "Dalam kota" },
  { sampaiKm: 15, biaya: 25000, label: "Pinggiran kota" },
  { sampaiKm: 25, biaya: 40000, label: "Luar kota" },
];

export const RADIUS_LAYANAN_KM = 25;

export type HasilJarak = {
  km: number;
  biaya: number;
  label: string;
  diLuarWilayah: boolean;
};

/**
 * Biaya perjalanan berdasarkan jarak sesungguhnya, bukan angka mati.
 *
 * Kalau koordinat alamat belum ada, kembalikan tarif tingkat tengah dan
 * tandai jaraknya nol — supaya jelas bahwa angkanya perkiraan, bukan hasil
 * hitungan. Menebak murah lebih berbahaya daripada mengaku belum tahu.
 */
export function biayaJarak(tujuan?: { lat?: number | null; lng?: number | null } | null): HasilJarak {
  if (!tujuan || tujuan.lat == null || tujuan.lng == null) {
    return { km: 0, biaya: TARIF_JARAK[1].biaya, label: "Perkiraan — alamat belum dipetakan", diLuarWilayah: false };
  }

  const km = jarakKm(PANGKALAN, { lat: tujuan.lat, lng: tujuan.lng });
  const tingkat = TARIF_JARAK.find((t) => km <= t.sampaiKm);

  if (!tingkat) {
    return {
      km,
      biaya: TARIF_JARAK[TARIF_JARAK.length - 1].biaya,
      label: `Di luar radius ${RADIUS_LAYANAN_KM} km`,
      diLuarWilayah: true,
    };
  }
  return { km, biaya: tingkat.biaya, label: tingkat.label, diLuarWilayah: false };
}

/**
 * Rupiah dengan pemisah Indonesia.
 *
 * `toLocaleString()` tanpa locale mengikuti setelan perangkat: di HP
 * berbahasa Inggris, Rp 350.000 tampil sebagai "350,000" — dan pembaca
 * Indonesia membacanya sebagai "350 koma 000". Untuk harga, itu salah baca
 * yang mahal. Selalu lewat sini.
 */
export function rp(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

export type RincianBiaya = {
  dasar: number;
  bahan: number;
  jarak: HasilJarak;
  darurat: number;
  total: number;
};

/** Satu-satunya tempat total dijumlahkan. */
export function hitungBiaya(opsi: {
  basePriceIdr?: number | null;
  suppliesFeeIdr?: number | null;
  tujuan?: { lat?: number | null; lng?: number | null } | null;
  emergencyFeeIdr?: number;
}): RincianBiaya {
  // `??` bukan `||`: harga yang sah bernilai 0 (layanan gratis atau promo)
  // tidak boleh diam-diam berubah jadi tarif bawaan.
  const dasar = opsi.basePriceIdr ?? 0;
  const bahan = opsi.suppliesFeeIdr ?? 0;
  const jarak = biayaJarak(opsi.tujuan);
  const darurat = opsi.emergencyFeeIdr ?? 0;
  return { dasar, bahan, jarak, darurat, total: dasar + bahan + jarak.biaya + darurat };
}

/**
 * Bagi hasil perawat.
 *
 * Sebelumnya portal perawat hanya menampilkan satu angka mati
 * ("IDR 14,850,000") tanpa asal-usul: tidak ada honor per kunjungan, tidak
 * ada potongan platform, tidak ada tanggal bayar. Untuk orang yang
 * menggantungkan penghasilan di sini, itu tidak cukup.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  70/30 ATAS JASA TINDAKAN — disetujui 7 September 2026.          │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Bahan habis pakai TIDAK dibagi: itu penggantian barang yang dipakai,
 * bukan pendapatan. Biaya jarak utuh ke perawat karena dia yang menempuh
 * jalannya. Yang dibagi hanya jasa tindakannya.
 *
 * Angka ini boleh berubah suatu hari, dan kalau berubah, honor kunjungan
 * yang SUDAH tercatat tidak boleh ikut bergerak. Itulah sebabnya setiap
 * baris bagi hasil menyimpan porsi yang dipakainya sendiri — lihat
 * `payouts.platformRate` di db/schema.ts.
 */
export const PORSI_PERAWAT = 0.7;
export const PORSI_PLATFORM = Number((1 - PORSI_PERAWAT).toFixed(4));

export type HonorPerawat = {
  jasa: number;
  porsiPerawat: number;
  potonganPlatform: number;
  jarak: number;
  bahan: number;
  diterima: number;
};

export function honorPerawat(pesanan: {
  basePriceIdr?: number | null;
  distanceFeeIdr?: number | null;
  suppliesFeeIdr?: number | null;
}): HonorPerawat {
  const jasa = pesanan.basePriceIdr ?? 0;
  const jarak = pesanan.distanceFeeIdr ?? 0;
  const bahan = pesanan.suppliesFeeIdr ?? 0;
  const porsiPerawat = Math.round(jasa * PORSI_PERAWAT);
  return {
    jasa,
    porsiPerawat,
    potonganPlatform: jasa - porsiPerawat,
    jarak,
    bahan,
    diterima: porsiPerawat + jarak + bahan,
  };
}
