/**
 * Alat bantu untuk tes.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  SEMUA TES DI SINI MENGUJI LEWAT HTTP, BUKAN MEMANGGIL FUNGSI.        │
 * │                                                                       │
 * │  Itu bukan kemalasan, itu keputusan. Tes yang memanggil fungsi di     │
 * │  dalam kode ikut mati begitu kodenya dirombak — dan aplikasi ini      │
 * │  memang akan dirombak (api/platform masih satu berkas 1.500 baris     │
 * │  berisi 20-an aksi berderet).                                         │
 * │                                                                       │
 * │  Kalimat "pasien A tidak bisa menandai pemesanan pasien B lunas"      │
 * │  tetap benar apa pun bentuk kodenya: satu berkas, dua puluh berkas,   │
 * │  penyedia pembayaran diganti. Tes seperti itu justru yang dibutuhkan  │
 * │  sebagai pegangan SAAT merombak.                                      │
 * │                                                                       │
 * │  Ini bukan tes buatan. Setiap satu di antaranya adalah serangan yang  │
 * │  sungguh-sungguh pernah dijalankan ke aplikasi ini, dan sebagian      │
 * │  besar dulu BERHASIL.                                                 │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { createHash } from "node:crypto";
import assert from "node:assert/strict";

export const BASIS = process.env.UJI_BASIS ?? "http://127.0.0.1:3210";
export const KUNCI_MIDTRANS = process.env.MIDTRANS_SERVER_KEY ?? "SB-Mid-server-KUNCIUJI0123456789";
export const SANDI = process.env.SEED_PASSWORD ?? "nurahome123";

/** Akun contoh yang dibuat seed. */
export const AKUN = {
  pasien: "0812-3456-7890",
  perawat: "0813-8899-1122",
  perawat2: "0815-7766-3344",
  perawatBelumVerif: "0856-2211-8080",
  admin: "admin@nurahomecare.id",
};

/* ------------------------------------------------------------------ */
/* Sesi                                                                */
/* ------------------------------------------------------------------ */

/**
 * Cookie disimpan per-"peramban", bukan global.
 *
 * Tanpa pemisahan ini, satu tes yang masuk sebagai admin diam-diam
 * membuat tes berikutnya berjalan sebagai admin juga — dan tes
 * "pasien tidak boleh melakukan X" lulus karena alasan yang salah.
 */
export function peramban() {
  let cookie = null;
  return {
    get cookie() {
      return cookie;
    },
    lupakan() {
      cookie = null;
    },
    async minta(jalur, opsi = {}) {
      const kepala = { ...(opsi.headers ?? {}) };
      if (cookie) kepala.Cookie = cookie;
      if (opsi.body && !kepala["Content-Type"]) kepala["Content-Type"] = "application/json";

      const res = await fetch(`${BASIS}${jalur}`, {
        ...opsi,
        headers: kepala,
        body: opsi.body ? JSON.stringify(opsi.body) : undefined,
        redirect: "manual",
      });

      const setCookie = res.headers.getSetCookie?.() ?? [];
      for (const c of setCookie) {
        if (c.startsWith("nh_sesi=")) {
          const nilai = c.split(";")[0];
          cookie = nilai.endsWith("=") ? null : nilai;
        }
      }

      const teks = await res.text();
      let isi = null;
      try {
        isi = JSON.parse(teks);
      } catch {
        isi = teks;
      }
      return { status: res.status, isi, kepala: res.headers, mentahCookie: setCookie };
    },
    ambil(jalur) {
      return this.minta(jalur);
    },
    kirim(jalur, body) {
      return this.minta(jalur, { method: "POST", body });
    },
    aksi(body) {
      return this.minta("/api/platform", { method: "POST", body });
    },
  };
}

export async function masuk(pengenal, sandi = SANDI) {
  const p = peramban();
  const r = await p.kirim("/api/auth", { aksi: "MASUK", pengenal, sandi });
  assert.equal(r.status, 200, `gagal masuk sebagai ${pengenal}: ${JSON.stringify(r.isi)}`);
  return p;
}

export const tamu = () => peramban();

/* ------------------------------------------------------------------ */
/* Penegasan yang menjelaskan dirinya                                  */
/* ------------------------------------------------------------------ */

/**
 * Pesan gagalnya sengaja memuat jawaban server apa adanya.
 *
 * Tes yang gagal dengan "expected 403 to equal 200" memaksa orang membuka
 * kode untuk tahu apa yang terjadi. Tes yang gagal dengan jawaban
 * servernya sekalian sering sudah cukup untuk tahu sebabnya.
 */
export function ditolak(hasil, status, keterangan) {
  assert.equal(
    hasil.status,
    status,
    `${keterangan}\n    diharapkan ${status}, dapat ${hasil.status}: ${JSON.stringify(hasil.isi).slice(0, 200)}`
  );
}

export function diterima(hasil, keterangan) {
  assert.ok(
    hasil.status >= 200 && hasil.status < 300,
    `${keterangan}\n    diharapkan berhasil, dapat ${hasil.status}: ${JSON.stringify(hasil.isi).slice(0, 200)}`
  );
  return hasil.isi;
}

/* ------------------------------------------------------------------ */
/* Midtrans palsu                                                      */
/* ------------------------------------------------------------------ */

export function tandaTangan(orderId, statusCode, grossAmount, kunci = KUNCI_MIDTRANS) {
  return createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${kunci}`)
    .digest("hex");
}

/** Kabar Midtrans yang bentuknya benar; bagian mana pun bisa ditimpa. */
export function kabar(orderId, ubah = {}) {
  const statusCode = ubah.status_code ?? "200";
  const grossAmount = ubah.gross_amount ?? "460000.00";
  return {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    transaction_status: "settlement",
    fraud_status: "accept",
    payment_type: "qris",
    transaction_id: `TXN-${orderId}`,
    signature_key: tandaTangan(orderId, statusCode, grossAmount),
    ...ubah,
  };
}

export function kirimKabar(isi) {
  return tamu().kirim("/api/pembayaran/kabar", isi);
}

/* ------------------------------------------------------------------ */
/* Menyiapkan pemesanan sampai tahap tertentu                          */
/* ------------------------------------------------------------------ */

export const TAHAP = {
  DIMINTA: "MENUNGGU_TINJAUAN",
  DITINJAU: "DITINJAU",
  DITAWARKAN: "DITAWARKAN",
  DISETUJUI: "DISETUJUI",
};

/**
 * Membuat satu pemesanan dan membawanya sampai tahap yang diminta.
 *
 * Dipakai hampir semua tes. Sengaja memakai jalur HTTP yang sama dengan
 * pasien sungguhan — bukan menyisipkan baris langsung ke basis data —
 * supaya kalau alurnya rusak, tesnya ikut memberi tahu.
 */
export async function siapkanPemesanan(sampai = TAHAP.DISETUJUI) {
  const pasien = await masuk(AKUN.pasien);
  const perawat = await masuk(AKUN.perawat);

  const buat = diterima(
    await pasien.aksi({
      action: "CREATE_BOOKING",
      serviceId: 1,
      serviceName: "Perawatan luka",
      serviceCategory: "WOUND_CARE",
      addressId: 1,
      addressText: "Jl. Bunga Coklat No. 18, Jatimulyo, Lowokwaru, Kota Malang",
      scheduledDate: tanggalNanti(12),
      scheduledTimeSlot: "09:00 - 10:00",
      woundAssessment: { woundLocation: "Betis kanan" },
    }),
    "membuat permintaan"
  );
  const id = buat.booking.id;
  const kode = buat.booking.bookingCode;
  if (sampai === TAHAP.DIMINTA) return { id, kode, pasien, perawat };

  diterima(await perawat.aksi({ action: "MULAI_TINJAUAN", bookingId: id }), "mulai tinjauan");
  if (sampai === TAHAP.DITINJAU) return { id, kode, pasien, perawat };

  diterima(
    await perawat.aksi({
      action: "KIRIM_PENAWARAN",
      bookingId: id,
      temuan: "Luka bersih, granulasi baik, perlu ganti balut foam.",
      item: [
        { kind: "JASA", label: "Jasa ganti balut", qty: 1, unitPriceIdr: 350000, fromCatalog: true },
        { kind: "BAHAN", label: "Foam antimikroba", qty: 2, unitPriceIdr: 55000, fromCatalog: true },
      ],
      scheduledDate: tanggalNanti(12),
      scheduledTimeSlot: "09:00 - 10:00",
    }),
    "kirim penawaran"
  );
  if (sampai === TAHAP.DITAWARKAN) return { id, kode, pasien, perawat };

  diterima(
    await pasien.aksi({
      action: "PUTUSKAN_PENAWARAN",
      bookingId: id,
      setuju: true,
      namaTandaTangan: "Budi Santoso",
      hubungan: "Diri sendiri",
      persetujuanFoto: true,
    }),
    "menyetujui penawaran"
  );
  return { id, kode, pasien, perawat };
}

/** JPEG kecil untuk foto bukti di tes — isinya tidak penting. */
export const FOTO_KECIL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJ";

/**
 * Membawa kunjungan yang sudah DIBAYAR maju lewat jalan yang sama dengan
 * perawat sungguhan: berangkat, FOTO kedatangan (satu-satunya cara
 * menandai tiba), lalu mulai tindakan.
 */
export async function majukanKunjungan(perawat, id, sampai = "DIKERJAKAN") {
  diterima(
    await perawat.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status: "PERAWAT_BERANGKAT" }),
    "perawat berangkat"
  );
  if (sampai === "PERAWAT_BERANGKAT") return;
  diterima(
    await perawat.aksi({
      action: "UPLOAD_TASK_PHOTO",
      bookingId: id,
      photoType: "ARRIVAL_CONFIRMATION",
      imageUrl: FOTO_KECIL,
      caption: "tiba",
    }),
    "foto kedatangan"
  );
  if (sampai === "PERAWAT_TIBA") return;
  diterima(
    await perawat.aksi({ action: "UPDATE_BOOKING_STATUS", bookingId: id, status: "DIKERJAKAN" }),
    "mulai tindakan"
  );
}

export function tanggalNanti(hari) {
  const d = new Date();
  d.setDate(d.getDate() + hari);
  return d.toISOString().slice(0, 10);
}

/** Mengambil satu pemesanan dari sudut pandang seseorang. */
export async function lihatPemesanan(sesi, id) {
  const r = await sesi.ambil("/api/platform");
  return (r.isi.bookings ?? []).find((b) => b.id === id) ?? null;
}
