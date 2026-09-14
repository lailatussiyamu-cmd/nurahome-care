/**
 * Pembayaran.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  KEADAAN SEBELUMNYA:                                                  │
 * │                                                                       │
 * │  Menekan "Bayar" di layar memanggil satu aksi, dan aksi itu menulis   │
 * │  `paymentStatus: "LUNAS"` ke basis data. Tidak ada penyedia           │
 * │  pembayaran, tidak ada uang yang berpindah. Yang menyatakan bahwa     │
 * │  pembayaran sudah terjadi adalah browser pasien — dan browser pasien  │
 * │  bisa memanggil API itu langsung tanpa membayar apa pun.              │
 * │                                                                       │
 * │  Akibatnya bukan sekadar "salah catat". Status LUNAS itulah yang      │
 * │  membuat perawat berangkat, membeli bahan habis pakai dengan uangnya  │
 * │  sendiri, dan mengerjakan tindakan. Perawat yang menanggung.          │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Tiga aturan yang membentuk seluruh berkas ini:
 *
 * 1. **Nominal dihitung server, dari penawaran yang sudah disetujui.**
 *    Browser tidak pernah menyebut angka. Kalau browser boleh mengirim
 *    nominal, ia akan mengirim Rp1.000.
 *
 * 2. **Yang menyatakan lunas hanya kabar dari penyedia**, sampai ke server
 *    lewat jalur server-ke-server, dan hanya kalau tanda tangannya cocok.
 *    Browser tidak pernah bisa menyatakan lunas — bahkan browser pasien
 *    yang sudah masuk dengan benar sekalipun.
 *
 * 3. **Kabar yang sama datang dua kali tidak berakibat dua kali.** Penyedia
 *    pembayaran mengulang kiriman kabarnya kalau jawaban server tidak
 *    sampai — itu perilaku normal, bukan gangguan.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/* ------------------------------------------------------------------ */
/* Nominal                                                             */
/* ------------------------------------------------------------------ */

export type ItemTagihan = { kind: string; qty: number; unitPriceIdr: number };

/**
 * Total tagihan, dihitung ulang dari item penawaran yang tersimpan.
 *
 * Dipanggil saat membuat transaksi DAN saat memeriksa kabar dari penyedia.
 * Keduanya harus sampai pada angka yang sama; kalau tidak, ada yang
 * berubah di antaranya dan pembayarannya ditahan.
 */
export function totalTagihan(item: ItemTagihan[]): number {
  return item.reduce(
    (jumlah, i) => jumlah + Math.round(Number(i.qty) || 0) * Math.round(Number(i.unitPriceIdr) || 0),
    0
  );
}

/**
 * Midtrans menerima `gross_amount` sebagai bilangan bulat rupiah.
 *
 * Pecahan sen tidak ada dalam rupiah, dan mengirim `460000.00` membuat
 * tanda tangan yang dihitung ulang nanti tidak pernah cocok — karena yang
 * dipakai Midtrans untuk menandatangani adalah teks nominalnya persis
 * seperti yang ia catat, bukan angkanya.
 */
export function rupiahBulat(n: number): number {
  return Math.max(0, Math.round(Number(n) || 0));
}

/* ------------------------------------------------------------------ */
/* Nomor pesanan di sisi penyedia                                      */
/* ------------------------------------------------------------------ */

/**
 * `NHC-2026-8841-3` — kode pemesanan ditambah nomor percobaan.
 *
 * Kenapa perlu nomor percobaan: Midtrans menolak `order_id` yang sudah
 * pernah dipakai. Pasien yang membuka halaman pembayaran, lalu menutupnya,
 * lalu mencoba lagi keesokan harinya adalah kejadian biasa — tanpa nomor
 * percobaan, percobaan keduanya selalu gagal dan tidak ada yang tahu
 * sebabnya.
 *
 * Kenapa kode pemesanannya tetap ikut: kalau suatu hari ada selisih
 * setoran, yang membaca mutasi rekening adalah orang. Nomor acak murni
 * memaksa orang itu membuka basis data untuk setiap baris.
 */
export function nomorPesanan(kodePemesanan: string, percobaan: number): string {
  return `${kodePemesanan}-${percobaan}`;
}

export function kodeDariNomorPesanan(orderId: string): string {
  return String(orderId ?? "").replace(/-\d+$/, "");
}

/* ------------------------------------------------------------------ */
/* Tanda tangan kabar Midtrans                                         */
/* ------------------------------------------------------------------ */

/**
 * Midtrans menandatangani kabarnya dengan
 *
 *     SHA512(order_id + status_code + gross_amount + ServerKey)
 *
 * ServerKey tidak pernah keluar dari server. Artinya kabar yang tanda
 * tangannya cocok pasti berasal dari pihak yang tahu ServerKey — dan itu
 * hanya Midtrans.
 *
 * Tanpa pemeriksaan ini, siapa pun yang tahu alamat webhook-nya bisa
 * mengirim satu permintaan berisi `{"transaction_status":"settlement"}`
 * dan setiap kunjungan tercatat lunas. Alamat webhook bukan rahasia —
 * ia tertulis di dasbor penyedia dan terkirim dalam setiap transaksi.
 */
export function tandaTanganMidtrans(a: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
}): string {
  return createHash("sha512")
    .update(`${a.orderId}${a.statusCode}${a.grossAmount}${a.serverKey}`)
    .digest("hex");
}

/**
 * Perbandingan berwaktu tetap.
 *
 * Perbandingan string biasa berhenti di karakter pertama yang berbeda.
 * Selisih waktunya kecil, tapi webhook boleh dipanggil siapa saja
 * sebanyak apa pun — keadaan terbaik untuk mengukur selisih sekecil itu.
 */
export function tandaTanganCocok(dikirim: string, dihitung: string): boolean {
  const a = Buffer.from(String(dikirim ?? ""), "utf8");
  const b = Buffer.from(dihitung, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------ */
/* Menerjemahkan status Midtrans                                       */
/* ------------------------------------------------------------------ */

export type HasilBayar = "LUNAS" | "MENUNGGU" | "GAGAL" | "DIKEMBALIKAN" | "PERLU_TINJAUAN";

/**
 * Peta status Midtrans ke keadaan yang dimengerti aplikasi ini.
 *
 * Yang paling mudah salah di sini adalah `capture` dengan
 * `fraud_status: "challenge"`. Itu BUKAN lunas — Midtrans sedang meminta
 * seseorang memutuskan. Memperlakukannya sebagai lunas berarti perawat
 * berangkat untuk transaksi yang mungkin dibatalkan. Memperlakukannya
 * sebagai gagal juga salah: uangnya sudah ditahan di kartu pasien.
 * Karena itu ada keadaan ketiga, PERLU_TINJAUAN, yang memanggil admin.
 */
export function bacaStatusMidtrans(a: {
  transactionStatus?: string | null;
  fraudStatus?: string | null;
}): { hasil: HasilBayar; alasan: string } {
  const t = String(a.transactionStatus ?? "").toLowerCase();
  const f = String(a.fraudStatus ?? "").toLowerCase();

  if (t === "capture") {
    if (f === "challenge")
      return { hasil: "PERLU_TINJAUAN", alasan: "Ditandai perlu ditinjau oleh Midtrans." };
    if (f === "deny") return { hasil: "GAGAL", alasan: "Ditolak sebagai transaksi mencurigakan." };
    return { hasil: "LUNAS", alasan: "" };
  }
  if (t === "settlement") return { hasil: "LUNAS", alasan: "" };
  if (t === "pending") return { hasil: "MENUNGGU", alasan: "Menunggu pembayaran pasien." };
  if (t === "deny") return { hasil: "GAGAL", alasan: "Pembayaran ditolak." };
  if (t === "cancel") return { hasil: "GAGAL", alasan: "Pembayaran dibatalkan." };
  if (t === "expire") return { hasil: "GAGAL", alasan: "Batas waktu pembayaran lewat." };
  if (t === "refund" || t === "partial_refund")
    return { hasil: "DIKEMBALIKAN", alasan: "Dana dikembalikan ke pasien." };

  /**
   * Status yang tidak dikenali TIDAK dianggap gagal, dan tentu tidak
   * dianggap lunas. Kalau suatu hari Midtrans menambah status baru,
   * menebaknya sebagai "gagal" berarti membatalkan kunjungan orang yang
   * sudah membayar.
   */
  return { hasil: "PERLU_TINJAUAN", alasan: `Status tidak dikenali: "${t}".` };
}

export const NAMA_HASIL: Record<HasilBayar, string> = {
  LUNAS: "Lunas",
  MENUNGGU: "Menunggu pembayaran",
  GAGAL: "Gagal / kedaluwarsa",
  DIKEMBALIKAN: "Dana dikembalikan",
  PERLU_TINJAUAN: "Perlu ditinjau admin",
};

/* ------------------------------------------------------------------ */
/* Apakah kabar ini boleh mengubah apa pun                             */
/* ------------------------------------------------------------------ */

export type Catatan = {
  status?: string | null;
  amountIdr?: number | null;
  bookingId?: number | null;
};

/**
 * Kenapa sebuah kabar tidak diterapkan — dan seberapa serius.
 *
 * Dua-duanya sama-sama "tidak diterapkan", tapi akibatnya harus berbeda:
 *
 *   TERTINGGAL — kabar lama yang sampai belakangan. NORMAL. Urutan kabar
 *                dari penyedia memang tidak dijamin. Cukup dicatat lalu
 *                diabaikan; tidak ada yang perlu dibangunkan.
 *
 *   ANOMALI    — nominalnya tidak cocok, atau nomor pesanannya tidak
 *                dikenali. Ada uang sungguhan yang terlibat dan tidak ada
 *                jawaban yang benar secara otomatis; harus dilihat orang.
 *
 * Perbedaan ini ketahuan saat menguji: versi pertama memperlakukan
 * keduanya sama, sehingga satu kabar `pending` yang tertinggal beberapa
 * detik di belakang `settlement` membuat pembayaran yang sudah lunas
 * ditandai PERLU_TINJAUAN dan pemesanannya ditandai BERSENGKETA. Tanda
 * sengketa itu menghentikan penghapusan foto dan memanggil admin untuk
 * sesuatu yang sepenuhnya normal.
 */
export type Penahan = { alasan: string; jenis: "TERTINGGAL" | "ANOMALI" };

export function penghalangKabar(a: {
  catatan: Catatan | null | undefined;
  nominalDikabarkan: number;
  hasil: HasilBayar;
}): Penahan | null {
  if (!a.catatan)
    return { alasan: "Nomor pesanan tidak dikenali.", jenis: "ANOMALI" };

  /**
   * Nominal yang dikabarkan harus sama persis dengan yang dicatat saat
   * transaksinya dibuat.
   *
   * Penjagaan terhadap kemungkinan nominal diubah di tengah jalan — baik
   * karena dipermainkan maupun karena penawarannya diubah setelah halaman
   * pembayaran terbuka. Kalau berbeda, pembayarannya TIDAK ditandai lunas
   * dan tidak juga ditandai gagal; ada uang sungguhan yang terlibat, jadi
   * yang benar adalah memanggil orang.
   */
  if (
    a.hasil === "LUNAS" &&
    rupiahBulat(a.nominalDikabarkan) !== rupiahBulat(a.catatan.amountIdr ?? 0)
  )
    return {
      alasan: `Nominal tidak cocok: dikabarkan ${a.nominalDikabarkan}, tercatat ${a.catatan.amountIdr}.`,
      jenis: "ANOMALI",
    };

  /**
   * Kabar yang datang terlambat tidak boleh menarik mundur keadaan yang
   * sudah selesai.
   *
   * Sebuah kabar `pending` yang tertahan di jaringan bisa sampai SETELAH
   * kabar `settlement` — dan kalau diterapkan apa adanya, pembayaran yang
   * sudah lunas kembali menjadi menunggu, lalu tugas terjadwal
   * membatalkan kunjungannya karena "tidak dibayar dalam 24 jam".
   */
  const selesai = ["LUNAS", "DIKEMBALIKAN"];
  if (selesai.includes(String(a.catatan.status)) && a.hasil === "MENUNGGU")
    return {
      alasan: `Kabar tertinggal: pembayaran sudah ${a.catatan.status}.`,
      jenis: "TERTINGGAL",
    };

  /** Kabar `gagal` yang sampai setelah lunas juga tertinggal, bukan anomali. */
  if (a.catatan.status === "LUNAS" && a.hasil === "GAGAL")
    return { alasan: "Kabar tertinggal: pembayaran sudah lunas.", jenis: "TERTINGGAL" };

  return null;
}

/**
 * Kabar yang isinya sama persis dengan yang terakhir diproses.
 *
 * Penyedia pembayaran MENGULANG kirimannya kalau jawaban server tidak
 * sampai dalam batas waktu — itu perilaku yang benar, bukan gangguan.
 * Tanpa pemeriksaan ini, satu pembayaran bisa menghasilkan tiga baris
 * pemberitahuan ke pasien dan tiga baris jejak audit.
 */
export function sidikKabar(isi: unknown): string {
  return createHash("sha256").update(JSON.stringify(isi ?? {})).digest("hex");
}

/* ------------------------------------------------------------------ */
/* Berapa lama halaman pembayaran berlaku                              */
/* ------------------------------------------------------------------ */

/**
 * 24 jam, disamakan dengan `TENGGAT.belumDibayarJam` di logic/tugas.ts.
 *
 * Dua angka ini harus sama. Kalau halaman pembayaran berlaku 48 jam
 * sementara tugas terjadwal membatalkan pemesanan setelah 24 jam, pasien
 * bisa membayar tagihan untuk kunjungan yang sudah dibatalkan sistem —
 * uangnya masuk, jadwalnya sudah dilepas ke orang lain.
 */
export const BERLAKU_JAM = 24;

export function kedaluwarsaBayar(sejak = new Date()): Date {
  return new Date(sejak.getTime() + BERLAKU_JAM * 3_600_000);
}
