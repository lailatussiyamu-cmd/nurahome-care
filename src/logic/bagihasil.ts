/**
 * Bagi hasil — dari kunjungan yang selesai menjadi angka yang dibayarkan.
 *
 * `honorDariItem()` di alur.ts sudah menghitung porsi perawat dari rincian
 * penawaran sejak lama. Yang belum ada sampai berkas ini: siapa yang
 * MENCATAT angka itu, kapan, dan atas dasar apa ia dianggap boleh
 * dibayarkan. Selama itu belum ada, bagi hasil dihitung ulang setiap kali
 * ada yang bertanya — dan dua orang yang menghitung di dua waktu berbeda
 * bisa mendapat angka berbeda tanpa ada yang tahu mana yang benar.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  TIGA ATURAN YANG MEMBENTUK BERKAS INI                                │
 * │                                                                       │
 * │  1. DICATAT SEKALI, LALU DIBEKUKAN. Angkanya disimpan apa adanya di   │
 * │     baris bagi hasil. Kalau tarif naik bulan depan, honor kunjungan   │
 * │     bulan ini tidak ikut berubah — yang dibayarkan harus sama dengan  │
 * │     yang disepakati saat kunjungannya terjadi.                        │
 * │                                                                       │
 * │  2. TIDAK DICATAT SEBELUM UANGNYA MASUK. Kunjungan yang selesai tapi  │
 * │     belum lunas bukan utang platform kepada perawat — itu utang       │
 * │     pasien kepada platform. Mencatatnya sebagai honor berarti         │
 * │     platform menjanjikan uang yang belum ia pegang.                   │
 * │                                                                       │
 * │  3. KALAU ANGKANYA TIDAK COCOK, TIDAK ADA YANG DIBAYARKAN OTOMATIS.   │
 * │     Jumlah rincian penawaran harus sama persis dengan uang yang       │
 * │     benar-benar diterima. Kalau berbeda, barisnya dibuat tetapi       │
 * │     ditandai PERLU_TINJAUAN — bukan dibulatkan, bukan dipilih salah   │
 * │     satunya. Selisih di sini artinya ada yang salah di satu tempat,   │
 * │     dan menebak mana yang benar akan merugikan perawat atau pasien.   │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { honorDariItem, type Honor, type ItemPenawaran, totalPenawaran } from "./alur";
import { rp } from "./biaya";

/**
 * TERKUMPUL      uangnya sudah diterima platform, honornya menjadi hak
 *                perawat, tinggal ditransfer.
 * DIBAYARKAN     sudah ditransfer ke perawat; ada bukti dan tanggalnya.
 * DITAHAN        ada sengketa atas kunjungan ini. Tidak dibayarkan sampai
 *                sengketanya selesai — membayar duluan membuat pengembalian
 *                dana ke pasien menjadi urusan yang jauh lebih sulit.
 * PERLU_TINJAUAN angkanya tidak cocok. Harus dilihat orang.
 */
export type StatusBagiHasil = "TERKUMPUL" | "DIBAYARKAN" | "DITAHAN" | "PERLU_TINJAUAN";

export const NAMA_STATUS_BAGI_HASIL: Record<StatusBagiHasil, string> = {
  TERKUMPUL: "Siap dibayarkan",
  DIBAYARKAN: "Sudah dibayarkan",
  DITAHAN: "Ditahan (sengketa)",
  PERLU_TINJAUAN: "Perlu ditinjau",
};

export type BahanPutusan = {
  /** Status pemesanan — hanya kunjungan SELESAI yang menghasilkan honor. */
  statusPesanan: string;
  /** Status pembayaran pemesanan — harus LUNAS. */
  statusBayar: string;
  sengketa: boolean;
  item: ItemPenawaran[];
  /**
   * Uang yang BENAR-BENAR tercatat diterima, dari tabel pembayaran — bukan
   * dihitung ulang dari rincian. Justru karena dihitung dari sumber yang
   * berbeda, selisih di antara keduanya bisa ketahuan.
   */
  dibayarIdr: number | null;
};

export type Putusan = {
  /** false berarti belum waktunya dicatat sama sekali. */
  siap: boolean;
  /** Kenapa belum siap — untuk dibaca manusia, bukan untuk dicocokkan kode. */
  belumSiap: string;
  status: StatusBagiHasil;
  /** Diisi kalau statusnya PERLU_TINJAUAN atau DITAHAN. */
  catatan: string;
  honor: Honor;
  totalTagihan: number;
};

export function putuskanBagiHasil(b: BahanPutusan): Putusan {
  const honor = honorDariItem(b.item);
  const totalTagihan = totalPenawaran(b.item);

  const belum = (alasan: string): Putusan => ({
    siap: false,
    belumSiap: alasan,
    status: "TERKUMPUL",
    catatan: "",
    honor,
    totalTagihan,
  });

  /**
   * Urutan dua pemeriksaan ini sengaja: kunjungan dulu, baru uang.
   * Keduanya bisa terjadi dalam urutan mana pun di dunia nyata — kabar
   * pembayaran bisa sampai setelah perawat pulang — jadi fungsi ini
   * dipanggil dari KEDUA tempat, dan yang datang belakangan yang
   * mencatatnya.
   */
  if (b.statusPesanan !== "SELESAI")
    return belum("Kunjungannya belum ditutup dengan laporan tindakan.");
  if (b.statusBayar !== "LUNAS") return belum("Pembayarannya belum masuk.");

  if (b.item.length === 0)
    return {
      siap: true,
      belumSiap: "",
      status: "PERLU_TINJAUAN",
      catatan:
        "Kunjungan ini tidak punya rincian penawaran sama sekali, jadi honornya tidak bisa dihitung.",
      honor,
      totalTagihan,
    };

  if (b.sengketa)
    return {
      siap: true,
      belumSiap: "",
      status: "DITAHAN",
      catatan:
        "Ada sengketa atas kunjungan ini. Honornya tetap dicatat supaya tidak hilang, tetapi tidak dibayarkan sampai sengketanya selesai.",
      honor,
      totalTagihan,
    };

  if (b.dibayarIdr === null)
    return {
      siap: true,
      belumSiap: "",
      status: "PERLU_TINJAUAN",
      catatan:
        "Pemesanan ini bertanda lunas tetapi tidak ada catatan pembayaran yang bisa dicocokkan.",
      honor,
      totalTagihan,
    };

  if (b.dibayarIdr !== totalTagihan)
    return {
      siap: true,
      belumSiap: "",
      status: "PERLU_TINJAUAN",
      catatan: `Rincian penawaran berjumlah ${rp(totalTagihan)}, tetapi yang tercatat diterima ${rp(
        b.dibayarIdr
      )} — selisih ${rp(Math.abs(totalTagihan - b.dibayarIdr))}. Honor tidak dibayarkan otomatis sebelum selisih ini dijelaskan.`,
      honor,
      totalTagihan,
    };

  return { siap: true, belumSiap: "", status: "TERKUMPUL", catatan: "", honor, totalTagihan };
}

/**
 * Apakah baris bagi hasil boleh ditandai sudah dibayarkan.
 *
 * Dipisah dari putusan di atas karena ini pertanyaan yang berbeda dan
 * ditanyakan belakangan, oleh orang yang berbeda: admin yang sudah
 * mentransfer dan sedang mencatatnya.
 */
export function penghalangPembayaranHonor(a: {
  status: StatusBagiHasil;
  bukti: string;
}): string | null {
  if (a.status === "DIBAYARKAN") return "Honor kunjungan ini sudah ditandai dibayarkan.";
  if (a.status === "DITAHAN")
    return "Honor ini ditahan karena ada sengketa. Selesaikan sengketanya dulu.";
  if (a.status === "PERLU_TINJAUAN")
    return "Angka honor ini belum cocok dan masih perlu ditinjau. Perbaiki dulu sebelum ditandai dibayarkan.";
  /**
   * Bukti transfer wajib. Tanpa itu, satu-satunya catatan bahwa uangnya
   * benar-benar pindah adalah ingatan orang yang menekan tombolnya — dan
   * itu yang selalu menjadi pangkal perselisihan honor.
   */
  if (String(a.bukti ?? "").trim().length < 4)
    return "Tulis bukti transfernya (nomor referensi bank, atau keterangan singkat yang bisa dicari kembali).";
  return null;
}
