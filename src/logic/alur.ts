/**
 * Alur hidup satu permintaan kunjungan.
 *
 * Sebelum berkas ini ada, memesan berarti memilih layanan lalu membayar
 * harga yang sudah tertera. Untuk perawatan luka itu tidak bisa: harga
 * bahan baru diketahui setelah ada yang melihat lukanya. Jadi urutannya
 * sekarang:
 *
 *   pasien kirim permintaan + foto  →  perawat menilai & menawarkan  →
 *   pasien menyetujui tarif, jadwal, dan persetujuan tindakan  →  bayar  →
 *   perawat berangkat & konfirmasi tiba  →  foto sebelum/sesudah  →
 *   laporan tindakan  →  selesai
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  BERKAS INI MENENTUKAN URUTAN, BUKAN HAK AKSES.                       │
 * │  Ia menjawab "boleh tidak berpindah dari status A ke B, oleh peran    │
 * │  apa". Ia TIDAK menjawab "benarkah orang ini perawat yang dimaksud"  │
 * │  — itu tugas otentikasi, yang belum ada. Lihat sesi.ts.              │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { biayaJarak, rp, PORSI_PERAWAT } from "./biaya";

export const S = {
  MENUNGGU_TINJAUAN: "MENUNGGU_TINJAUAN",
  DITINJAU: "DITINJAU",
  DITAWARKAN: "DITAWARKAN",
  DITOLAK_PASIEN: "DITOLAK_PASIEN",
  DISETUJUI: "DISETUJUI",
  DIBAYAR: "DIBAYAR",
  PERAWAT_BERANGKAT: "PERAWAT_BERANGKAT",
  PERAWAT_TIBA: "PERAWAT_TIBA",
  DIKERJAKAN: "DIKERJAKAN",
  SELESAI: "SELESAI",
  DIBATALKAN: "DIBATALKAN",
} as const;

export type Status = (typeof S)[keyof typeof S];

/** Nama yang dibaca orang. Dipakai pasien, perawat, dan jejak audit. */
export const NAMA_STATUS: Record<string, string> = {
  [S.MENUNGGU_TINJAUAN]: "Menunggu ditinjau perawat",
  [S.DITINJAU]: "Sedang ditinjau perawat",
  [S.DITAWARKAN]: "Menunggu persetujuan Anda",
  [S.DITOLAK_PASIEN]: "Dicarikan perawat lain",
  [S.DISETUJUI]: "Menunggu pembayaran",
  [S.DIBAYAR]: "Sudah dibayar — menunggu perawat berangkat",
  [S.PERAWAT_BERANGKAT]: "Perawat dalam perjalanan",
  [S.PERAWAT_TIBA]: "Perawat sudah tiba",
  [S.DIKERJAKAN]: "Sedang ditangani",
  [S.SELESAI]: "Selesai",
  [S.DIBATALKAN]: "Dibatalkan",
};

/** Penjelasan satu kalimat untuk pasien: apa yang sedang terjadi. */
export const PENJELASAN_STATUS: Record<string, string> = {
  [S.MENUNGGU_TINJAUAN]:
    "Foto dan keterangan Anda sudah masuk. Perawat akan menilai dan mengirim rincian biaya — biasanya dalam beberapa jam.",
  [S.DITINJAU]: "Perawat sedang melihat foto luka dan menyusun rincian biaya.",
  [S.DITAWARKAN]:
    "Rincian bahan, biaya, dan jadwal sudah siap. Belum ada yang ditagihkan sampai Anda menyetujuinya.",
  [S.DITOLAK_PASIEN]:
    "Penawaran sebelumnya Anda tolak. Permintaan ini sedang dicarikan perawat lain.",
  [S.DISETUJUI]:
    "Anda sudah menyetujui biaya dan jadwal. Perawat berangkat setelah pembayaran masuk.",
  [S.DIBAYAR]: "Pembayaran diterima. Perawat akan berangkat sesuai jadwal.",
  [S.PERAWAT_BERANGKAT]: "Perawat sedang menuju alamat Anda.",
  [S.PERAWAT_TIBA]: "Perawat sudah sampai di rumah Anda.",
  [S.DIKERJAKAN]: "Tindakan sedang dikerjakan.",
  [S.SELESAI]: "Kunjungan selesai. Laporan tindakan bisa Anda baca di bawah.",
  [S.DIBATALKAN]: "Permintaan ini dibatalkan.",
};

export function namaStatus(status?: string | null): string {
  if (!status) return "—";
  return NAMA_STATUS[status] ?? status.replace(/_/g, " ").toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Perpindahan status                                                  */
/* ------------------------------------------------------------------ */

export type Peran = "PATIENT" | "PROVIDER" | "ADMIN";

/**
 * Dari status apa, ke status apa, oleh peran apa.
 *
 * Ditulis satu tempat supaya tidak ada tombol di layar yang diam-diam
 * memindahkan status ke tempat yang tidak masuk akal — misalnya perawat
 * menandai "selesai" untuk kunjungan yang belum dibayar, atau pasien
 * menyetujui penawaran yang belum pernah dikirim.
 */
const IZIN: { dari: string; ke: string; oleh: Peran[] }[] = [
  { dari: S.MENUNGGU_TINJAUAN, ke: S.DITINJAU, oleh: ["PROVIDER"] },
  { dari: S.MENUNGGU_TINJAUAN, ke: S.DIBATALKAN, oleh: ["PATIENT", "ADMIN"] },
  { dari: S.DITINJAU, ke: S.DITAWARKAN, oleh: ["PROVIDER"] },
  { dari: S.DITINJAU, ke: S.DIBATALKAN, oleh: ["PATIENT", "ADMIN"] },
  { dari: S.DITAWARKAN, ke: S.DISETUJUI, oleh: ["PATIENT"] },
  { dari: S.DITAWARKAN, ke: S.DITOLAK_PASIEN, oleh: ["PATIENT"] },
  { dari: S.DITAWARKAN, ke: S.DIBATALKAN, oleh: ["PATIENT", "ADMIN"] },
  // Ditolak = kembali ke antrean supaya perawat lain bisa menilai ulang.
  { dari: S.DITOLAK_PASIEN, ke: S.DITINJAU, oleh: ["PROVIDER"] },
  { dari: S.DITOLAK_PASIEN, ke: S.DIBATALKAN, oleh: ["PATIENT", "ADMIN"] },
  { dari: S.DISETUJUI, ke: S.DIBAYAR, oleh: ["PATIENT", "ADMIN"] },
  { dari: S.DISETUJUI, ke: S.DIBATALKAN, oleh: ["PATIENT", "ADMIN"] },
  { dari: S.DIBAYAR, ke: S.PERAWAT_BERANGKAT, oleh: ["PROVIDER"] },
  { dari: S.DIBAYAR, ke: S.DIBATALKAN, oleh: ["PATIENT", "ADMIN"] },
  { dari: S.PERAWAT_BERANGKAT, ke: S.PERAWAT_TIBA, oleh: ["PROVIDER"] },
  { dari: S.PERAWAT_TIBA, ke: S.DIKERJAKAN, oleh: ["PROVIDER"] },
  { dari: S.DIKERJAKAN, ke: S.SELESAI, oleh: ["PROVIDER"] },
];

export function bolehPindah(
  dari: string | null | undefined,
  ke: string,
  oleh: Peran
): { boleh: boolean; alasan: string } {
  if (!dari) return { boleh: false, alasan: "Pemesanan tidak ditemukan." };
  if (dari === ke) return { boleh: false, alasan: "Status tidak berubah." };
  const cocok = IZIN.find((i) => i.dari === dari && i.ke === ke);
  if (!cocok)
    return {
      boleh: false,
      alasan: `Tidak bisa berpindah dari "${namaStatus(dari)}" ke "${namaStatus(ke)}".`,
    };
  if (!cocok.oleh.includes(oleh))
    return {
      boleh: false,
      alasan: `Perpindahan ini bukan wewenang ${
        oleh === "PATIENT" ? "pasien" : oleh === "PROVIDER" ? "perawat" : "admin"
      }.`,
    };
  return { boleh: true, alasan: "" };
}

/** Status yang masih boleh dibatalkan pasien tanpa biaya. */
export const BISA_DIBATALKAN: string[] = [
  S.MENUNGGU_TINJAUAN,
  S.DITINJAU,
  S.DITAWARKAN,
  S.DITOLAK_PASIEN,
  S.DISETUJUI,
  S.DIBAYAR,
];

export const SUDAH_TUTUP: string[] = [S.SELESAI, S.DIBATALKAN];

/* ------------------------------------------------------------------ */
/* Penawaran                                                           */
/* ------------------------------------------------------------------ */

export type JenisItem = "JASA" | "BAHAN" | "JARAK" | "LUAR_JAM";

export type ItemPenawaran = {
  id?: number;
  kind: JenisItem;
  label: string;
  qty: number;
  unitPriceIdr: number;
  fromCatalog: boolean;
  originalUnitPriceIdr?: number | null;
  reason?: string | null;
};

export const NAMA_JENIS: Record<JenisItem, string> = {
  JASA: "Jasa tindakan",
  BAHAN: "Bahan habis pakai",
  JARAK: "Biaya perjalanan",
  LUAR_JAM: "Di luar jam kerja",
};

/**
 * Penawaran awal yang diisi app.
 *
 * Perawat tidak mulai dari halaman kosong: app sudah menghitung jasa
 * tindakan dari katalog, biaya bahan bawaan layanan, dan biaya jarak dari
 * koordinat alamat. Perawat tinggal menyesuaikan setelah melihat foto —
 * dan setiap penyesuaian wajib diberi alasan (lihat `itemBerubah`).
 */
export function susunPenawaranAwal(opsi: {
  layanan: { name?: string; basePriceIdr?: number | null; suppliesFeeIdr?: number | null };
  tujuan?: { lat?: number | null; lng?: number | null } | null;
  diLuarJamKerja?: boolean;
}): ItemPenawaran[] {
  const item: ItemPenawaran[] = [];

  item.push({
    kind: "JASA",
    label: opsi.layanan.name ?? "Jasa tindakan",
    qty: 1,
    unitPriceIdr: opsi.layanan.basePriceIdr ?? 0,
    fromCatalog: true,
  });

  const bahan = opsi.layanan.suppliesFeeIdr ?? 0;
  if (bahan > 0) {
    item.push({
      kind: "BAHAN",
      label: "Paket bahan habis pakai (set standar layanan)",
      qty: 1,
      unitPriceIdr: bahan,
      fromCatalog: true,
    });
  }

  const jarak = biayaJarak(opsi.tujuan);
  item.push({
    kind: "JARAK",
    label: `Perjalanan — ${jarak.label}${jarak.km ? ` (${jarak.km.toFixed(1)} km)` : ""}`,
    qty: 1,
    unitPriceIdr: jarak.biaya,
    fromCatalog: true,
  });

  if (opsi.diLuarJamKerja) {
    item.push({
      kind: "LUAR_JAM",
      label: "Kunjungan di luar jam kerja",
      qty: 1,
      unitPriceIdr: 75000,
      fromCatalog: true,
    });
  }

  return item;
}

/** Bahan tambahan yang paling sering dipakai, supaya perawat tidak mengetik. */
export const KATALOG_BAHAN: { label: string; hargaIdr: number }[] = [
  { label: "Balutan foam silikon 10x10 cm", hargaIdr: 65000 },
  { label: "Balutan hidrokoloid 10x10 cm", hargaIdr: 55000 },
  { label: "Balutan perak antimikroba", hargaIdr: 95000 },
  { label: "Alginat kalsium", hargaIdr: 70000 },
  { label: "NaCl 0,9% 500 ml", hargaIdr: 18000 },
  { label: "Kasa steril (per pak)", hargaIdr: 12000 },
  { label: "Set ganti balut steril", hargaIdr: 45000 },
  { label: "Krim pelindung kulit sekitar luka", hargaIdr: 40000 },
  { label: "Perban elastis", hargaIdr: 25000 },
];

export function subtotalItem(i: ItemPenawaran): number {
  return Math.max(0, Math.round(i.qty * i.unitPriceIdr));
}

export function totalPenawaran(item: ItemPenawaran[]): number {
  return item.reduce((t, i) => t + subtotalItem(i), 0);
}

/** Item yang angkanya diubah perawat dari bawaan app. */
export function itemBerubah(item: ItemPenawaran[]): ItemPenawaran[] {
  return item.filter(
    (i) =>
      !i.fromCatalog ||
      (i.originalUnitPriceIdr != null && i.originalUnitPriceIdr !== i.unitPriceIdr)
  );
}

/**
 * Apa yang menghalangi penawaran dikirim.
 *
 * Aturannya sederhana tapi penting: setiap angka yang menyimpang dari
 * hitungan app harus punya alasan tertulis. Kalau tidak, "harga menyesuaikan
 * kondisi" berubah jadi kotak hitam yang tidak bisa ditinjau siapa pun.
 */
export function penghalangKirimPenawaran(
  item: ItemPenawaran[],
  temuan: string,
  jadwalTanggal: string,
  jadwalJam: string
): string | null {
  if (!temuan.trim())
    return "Tulis dulu hasil penilaian luka — pasien berhak tahu dasar penawarannya.";
  if (item.length === 0) return "Belum ada satu pun item biaya.";
  if (totalPenawaran(item) <= 0) return "Total penawaran masih nol.";
  if (!jadwalTanggal) return "Tanggal kunjungan belum diisi.";
  if (!jadwalJam.trim()) return "Jam kunjungan belum diisi.";

  const tanpaAlasan = itemBerubah(item).filter((i) => !i.reason?.trim());
  if (tanpaAlasan.length)
    return `Beri alasan untuk item yang Anda ubah atau tambahkan: ${tanpaAlasan
      .map((i) => `"${i.label}"`)
      .join(", ")}.`;

  return null;
}

/* ------------------------------------------------------------------ */
/* Bagi hasil — 70/30, disetujui 7 September 2026                      */
/* ------------------------------------------------------------------ */

export type Honor = {
  jasa: number;
  porsiPerawat: number;
  potonganPlatform: number;
  bahan: number;
  jarak: number;
  luarJam: number;
  diterima: number;
};

/**
 * Honor perawat dihitung dari item penawaran, bukan dari total.
 *
 * Yang dibagi 70/30 hanya JASA tindakan. Bahan adalah penggantian barang
 * yang benar-benar terpakai — membaginya sama saja menyuruh perawat
 * menombok sebagian bahannya sendiri. Jarak utuh ke perawat karena dia yang
 * menempuh jalannya, dan biaya di luar jam kerja utuh ke perawat karena
 * dialah yang kehilangan waktu istirahatnya.
 */
export function honorDariItem(item: ItemPenawaran[]): Honor {
  const jml = (k: JenisItem) =>
    item.filter((i) => i.kind === k).reduce((t, i) => t + subtotalItem(i), 0);

  const jasa = jml("JASA");
  const bahan = jml("BAHAN");
  const jarak = jml("JARAK");
  const luarJam = jml("LUAR_JAM");
  const porsiPerawat = Math.round(jasa * PORSI_PERAWAT);

  return {
    jasa,
    porsiPerawat,
    potonganPlatform: jasa - porsiPerawat,
    bahan,
    jarak,
    luarJam,
    diterima: porsiPerawat + bahan + jarak + luarJam,
  };
}

/** Rincian penawaran sebagai teks — disimpan apa adanya di catatan persetujuan. */
export function penawaranSebagaiTeks(item: ItemPenawaran[]): string {
  const baris = item.map(
    (i) =>
      `- [${NAMA_JENIS[i.kind]}] ${i.label} — ${i.qty} x ${rp(
        i.unitPriceIdr
      )} = ${rp(subtotalItem(i))}${i.reason ? `  (alasan: ${i.reason})` : ""}`
  );
  baris.push(`TOTAL: ${rp(totalPenawaran(item))}`);
  return baris.join("\n");
}

/* ------------------------------------------------------------------ */
/* Jadwal                                                              */
/* ------------------------------------------------------------------ */

/** Jam kerja normal; di luar ini kena biaya tambahan. */
export const JAM_KERJA = { mulai: 7, selesai: 20 };

export function diLuarJamKerja(slot: string): boolean {
  const m = String(slot).match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return false;
  const jam = Number(m[1]);
  return jam < JAM_KERJA.mulai || jam >= JAM_KERJA.selesai;
}

/* ------------------------------------------------------------------ */
/* Kemajuan untuk ditampilkan sebagai jenjang di layar pasien          */
/* ------------------------------------------------------------------ */

/**
 * Lima tahap yang dilihat pasien.
 *
 * Sebelumnya jenjang ini ditulis mati di layar: selalu menyorot tahap 3
 * dan selalu terisi 3/5, apa pun status sesungguhnya. Kunjungan yang sudah
 * selesai bertahun-tahun lalu pun tampil sebagai "perawat berangkat" —
 * lengkap dengan "perkiraan tiba 14 menit" yang juga ditulis mati.
 */
export const TAHAP: { label: string; status: string[] }[] = [
  { label: "Dikirim", status: [S.MENUNGGU_TINJAUAN, S.DITINJAU, S.DITOLAK_PASIEN] },
  { label: "Ditawar", status: [S.DITAWARKAN] },
  { label: "Disetujui", status: [S.DISETUJUI] },
  { label: "Dibayar", status: [S.DIBAYAR, S.PERAWAT_BERANGKAT] },
  { label: "Dikerjakan", status: [S.PERAWAT_TIBA, S.DIKERJAKAN] },
  { label: "Selesai", status: [S.SELESAI] },
];

/** Nomor tahap saat ini (0-based). -1 untuk pemesanan yang dibatalkan. */
export function tahapSekarang(status?: string | null): number {
  if (!status || status === S.DIBATALKAN) return -1;
  return TAHAP.findIndex((t) => t.status.includes(status));
}

/** Inisial untuk lencana perawat — sebelumnya "RD" ditulis mati. */
export function inisial(nama?: string | null): string {
  if (!nama) return "?";
  const bersih = nama.replace(/^(Ns\.|dr\.|Dr\.)\s*/i, "").trim();
  const kata = bersih.split(/\s+/).filter((k) => /^[A-Za-z]/.test(k));
  return (kata[0]?.[0] ?? "") + (kata[1]?.[0] ?? "") || "?";
}
