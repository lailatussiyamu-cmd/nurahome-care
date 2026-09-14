/**
 * Siapa yang sedang memakai aplikasi.
 *
 * Sebelum berkas ini ada, tidak ada jawaban untuk pertanyaan itu. Portal
 * pasien memakai `bookings[0]` — pemesanan siapa pun yang paling baru. Portal
 * perawat memakai `providers[0]` — perawat pertama di basis data. Akibatnya
 * Ns. Hendra membuka aplikasi dan melihat nama, nomor STR, serta honor
 * Ns. Ratna; dan saat ia menandatangani catatan klinis, yang tercatat
 * menjaminkan isinya adalah STR orang lain. Untuk dokumen klinis itu bukan
 * sekadar salah tampil.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  INI PENYARINGAN, BUKAN OTENTIKASI.                                   │
 * │  Berkas ini menjawab "data siapa yang boleh tampil di layar", bukan   │
 * │  "benarkah orang ini siapa yang dia akui". Sebelum dipakai sungguhan  │
 * │  masih perlu login, kata sandi, dan sesi di sisi server. Yang sudah   │
 * │  siap: semua tempat kini bertanya ke SATU sumber, jadi menyambungkan  │
 * │  otentikasi nanti cukup mengganti isi berkas ini.                     │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { BISA_DIBATALKAN, S } from "./alur";
import { NAMA_VERIFIKASI, type StatusVerifikasi } from "./verifikasi";
export { BISA_DIBATALKAN };

export type Peran = "PATIENT" | "PROVIDER" | "ADMIN";

export type Sesi = {
  peran: Peran;
  /** id baris di tabel users */
  userId: number | null;
  /** nama sebagaimana tersimpan di bookings.patientName / providers.fullName */
  nama: string | null;
  /** id baris di tabel providers — hanya terisi untuk perawat */
  providerId: number | null;
};

export const SESI_KOSONG: Sesi = { peran: "PATIENT", userId: null, nama: null, providerId: null };

/**
 * DIHAPUS — jangan dipakai lagi.
 *
 * Fungsi ini dulu menyusun sesi dari data yang sudah dimuat di browser:
 * untuk peran perawat ia mengambil `providers[0]`, untuk pasien
 * `users.find(role === "PATIENT")`. Selama peran masih dipilih lewat tombol
 * peragaan, itu memadai. Begitu ada login sungguhan, ia menjadi salah dengan
 * cara yang berbahaya: Ns. Dwi masuk dengan akunnya sendiri dan seluruh
 * portal menampilkan nama, nomor STR, jumlah kunjungan, serta lencana
 * "Terverifikasi" milik Ns. Ratna.
 *
 * Sekarang identitas datang dari cookie sesi yang diperiksa di server —
 * lihat server/aktor.ts, dan `sesi` di api/platform yang ikut dikirim ke
 * layar. Berkas ini tinggal berisi PENYARINGAN, yang memang tugasnya.
 */

/* ------------------------------------------------------------------ */
/* Penyaringan. Dipakai di komponen supaya tidak ada lagi daftar yang   */
/* menampilkan seluruh isi basis data.                                  */
/* ------------------------------------------------------------------ */

/** Pemesanan milik pasien ini saja. */
export function pesananPasien(bookings: any[], sesi: Sesi): any[] {
  if (!sesi.nama) return [];
  return bookings.filter((b) => b.patientId === sesi.userId || b.patientName === sesi.nama);
}

/** Kunjungan yang ditugaskan ke perawat ini saja. */
export function pesananPerawat(bookings: any[], sesi: Sesi): any[] {
  if (sesi.providerId == null && !sesi.nama) return [];
  return bookings.filter(
    (b) => b.providerId === sesi.providerId || b.providerName === sesi.nama
  );
}

/**
 * Menyaring baris apa pun yang punya patientId / bookingId ke pemesanan yang
 * boleh dilihat. Dipakai untuk garis waktu penyembuhan, foto, dan catatan
 * klinis — semuanya tadinya ditampilkan apa adanya, seluruh isi tabel.
 */
export function milikPesanan<T extends { bookingId?: number | null; patientId?: number | null }>(
  baris: T[],
  pesananBoleh: any[],
  sesi: Sesi
): T[] {
  const idBoleh = new Set(pesananBoleh.map((b) => b.id));
  return baris.filter(
    (r) =>
      (r.bookingId != null && idBoleh.has(r.bookingId)) ||
      (r.patientId != null && sesi.userId != null && r.patientId === sesi.userId)
  );
}

/* ------------------------------------------------------------------ */
/* Pembatalan                                                          */
/* ------------------------------------------------------------------ */

/**
 * Batas pembatalan.
 *
 * Daftar status yang boleh dibatalkan sekarang tinggal di logic/alur.ts —
 * satu tempat untuk seluruh urutan alur, supaya daftar di sini tidak
 * diam-diam berbeda dari daftar yang dipakai API.
 */
export const BATAS_BATAL_JAM = 2;

/**
 * Wizard menjanjikan "batal gratis sampai 2 jam sebelum jadwal", tapi sampai
 * sekarang tidak ada satu pun aksi pembatalan di aplikasi maupun di API.
 * Janji yang tidak bisa ditepati lebih buruk daripada tidak berjanji.
 */
export function bolehBatal(booking: any, sekarang = new Date()): { boleh: boolean; alasan: string } {
  if (!booking) return { boleh: false, alasan: "Pemesanan tidak ditemukan." };
  if (!BISA_DIBATALKAN.includes(booking.status))
    return {
      boleh: false,
      alasan:
        booking.status === S.DIBATALKAN
          ? "Pemesanan ini sudah dibatalkan."
          : "Perawat sudah dalam perjalanan atau kunjungan sudah berjalan — hubungi perawat lewat pesan.",
    };

  const mulai = jadwalMulai(booking);
  if (mulai) {
    const selisihJam = (mulai.getTime() - sekarang.getTime()) / 3_600_000;
    if (selisihJam < BATAS_BATAL_JAM)
      return {
        boleh: false,
        alasan: `Batas pembatalan gratis ${BATAS_BATAL_JAM} jam sebelum jadwal sudah lewat.`,
      };
  }
  return { boleh: true, alasan: "" };
}

/** "2026-09-08" + "09:00 - 10:30 WIB" -> Date awal jendela kunjungan. */
export function jadwalMulai(booking: any): Date | null {
  const tgl = String(booking?.scheduledDate ?? "");
  const jam = String(booking?.scheduledTimeSlot ?? "").match(/(\d{1,2})[:.](\d{2})/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl) || !jam) return null;
  const d = new Date(`${tgl}T${jam[1].padStart(2, "0")}:${jam[2]}:00`);
  return isNaN(d.getTime()) ? null : d;
}

/* Nama status pindah ke logic/alur.ts bersama aturan urutannya —
   nama dan urutan status adalah satu hal yang sama, memisahkannya ke dua
   berkas membuat keduanya cepat tidak sinkron. */
export { namaStatus, NAMA_STATUS } from "./alur";

/**
 * Tanggal dalam bentuk yang dibaca orang Indonesia.
 *
 * Layar menampilkan "2026-05-15" apa adanya dari basis data. Itu bentuk
 * penyimpanan, bukan bentuk baca — dan di aplikasi yang dipakai keluarga
 * pasien, angka berderet begitu mudah tertukar hari dan bulannya.
 */
export function tanggalIndo(iso?: string | null): string {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return `${Number(m[3])} ${bulan[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/**
 * Status verifikasi perawat, dalam kata yang dimengerti pembaca.
 *
 * Daftarnya TIDAK ditulis ulang di sini. Sampai hari ini berkas ini
 * memegang salinannya sendiri dengan kunci berbahasa Inggris — VERIFIED,
 * PENDING, REJECTED, EXPIRED — sementara yang benar-benar tersimpan di
 * basis data adalah TERVERIFIKASI, MENUNGGU_TINJAUAN, PERLU_PERBAIKAN,
 * KEDALUWARSA, DIBEKUKAN. Tidak satu pun cocok, jadi setiap status jatuh
 * ke jalur cadangan dan layar admin menampilkan "terverifikasi" dengan
 * huruf kecil, hasil mengganti garis bawah dengan spasi.
 *
 * Dua daftar untuk satu hal selalu berakhir begini. Sekarang hanya ada
 * satu, di logic/verifikasi.ts, tempat statusnya memang didefinisikan.
 */
export function namaVerifikasi(status?: string | null): string {
  if (!status) return "—";
  return NAMA_VERIFIKASI[status as StatusVerifikasi] ?? status.replace(/_/g, " ").toLowerCase();
}

/** Nama peran dalam bahasa manusia, untuk jejak audit dan layar admin. */
export const NAMA_PERAN: Record<string, string> = {
  PATIENT: "Pasien",
  PROVIDER: "Perawat",
  ADMIN: "Admin",
  SISTEM: "Sistem",
};

export function namaPeran(peran?: string | null): string {
  if (!peran) return "—";
  return NAMA_PERAN[peran] ?? peran.toLowerCase();
}
