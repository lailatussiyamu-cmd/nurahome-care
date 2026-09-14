/**
 * Mengirim pesan ke luar aplikasi — WhatsApp, SMS, atau surel.
 *
 * Setiap pesan SELALU dicatat dulu di tabel `outbox`, baru dicoba dikirim.
 * Bukan sebaliknya. Alasannya: pengiriman bisa gagal, dan yang menunggu
 * pesan yang gagal itu adalah orang yang tidak bisa masuk ke akunnya.
 * Tanpa catatan, kegagalannya hilang tanpa ada yang tahu.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  SELAMA PENYEDIA BELUM DIPASANG, PESANNYA TETAP TERCATAT DAN ADMIN   │
 * │  BISA MENYAMPAIKANNYA SENDIRI.                                        │
 * │                                                                       │
 * │  Itu persis yang dikerjakan admin hari ini — hanya sekarang terlacak, │
 * │  dan pasiennya tetap yang memilih kata sandi barunya sendiri.         │
 * │                                                                       │
 * │  TAPI dalam keadaan itu admin BISA MEMBACA kode pemulihan siapa pun,  │
 * │  termasuk kode perawat. Artinya admin bisa mengambil alih akun        │
 * │  perawat dan menandatangani catatan klinis atas namanya. Itu keadaan  │
 * │  sementara yang harus diakhiri dengan memasang penyedia — bukan       │
 * │  keadaan tetap. Begitu penyedianya ada, isi pesannya dihapus dari     │
 * │  kotak keluar segera setelah terkirim.                                │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outbox } from "@/db/schema";
import { telingaTelepon } from "@/logic/otentikasi";

export type Saluran = "WHATSAPP" | "SMS" | "SUREL";

export function penyediaSiap(): { siap: boolean; nama: string; alasan: string } {
  const kunci = process.env.WA_API_KEY;
  if (kunci && kunci.length > 8)
    return { siap: true, nama: process.env.WA_PENYEDIA ?? "FONNTE", alasan: "" };
  return {
    siap: false,
    nama: "(belum dipasang)",
    alasan:
      "WA_API_KEY belum dipasang. Pesan tetap tercatat di kotak keluar dan bisa disampaikan admin.",
  };
}

/* ------------------------------------------------------------------ */

/**
 * Mencatat lalu mencoba mengirim.
 *
 * Mengembalikan id barisnya, bukan isi pesannya. Pemanggilnya TIDAK boleh
 * pernah memegang isi pesan setelah ini — kalau isinya bisa dikembalikan,
 * cepat atau lambat ada yang menuliskannya ke jawaban HTTP, dan kode
 * pemulihan yang muncul di jawaban HTTP membatalkan seluruh gunanya.
 */
export async function kirimPesan(a: {
  saluran: Saluran;
  tujuan: string;
  jenis: string;
  isi: string;
}): Promise<{ id: number; terkirim: boolean }> {
  const [baris] = await db
    .insert(outbox)
    .values({
      saluran: a.saluran,
      tujuan: a.tujuan,
      jenis: a.jenis,
      isi: a.isi,
      status: "MENUNGGU",
    })
    .returning();

  const penyedia = penyediaSiap();
  if (!penyedia.siap) return { id: baris.id, terkirim: false };

  try {
    await kirimLewatPenyedia(a.saluran, a.tujuan, a.isi);
    await db
      .update(outbox)
      .set({
        status: "TERKIRIM",
        sentAt: new Date(),
        /**
         * Isinya dihapus begitu terkirim, untuk pesan yang memuat rahasia.
         * Kode pemulihan yang tertinggal di kotak keluar adalah kunci
         * cadangan ke akun orang.
         */
        isi: a.jenis === "KODE_PEMULIHAN" ? null : a.isi,
        isiDihapusPada: a.jenis === "KODE_PEMULIHAN" ? new Date() : null,
      })
      .where(eq(outbox.id, baris.id));
    return { id: baris.id, terkirim: true };
  } catch (e) {
    await db
      .update(outbox)
      .set({ status: "GAGAL", galat: e instanceof Error ? e.message : String(e) })
      .where(eq(outbox.id, baris.id));
    return { id: baris.id, terkirim: false };
  }
}

/**
 * Fonnte — penyedia WhatsApp yang lazim dipakai usaha kecil di Indonesia.
 *
 * Dipisah menjadi satu fungsi supaya kalau penyedianya berganti, yang
 * diganti hanya bagian ini.
 */
async function kirimLewatPenyedia(saluran: Saluran, tujuan: string, isi: string): Promise<void> {
  const kunci = process.env.WA_API_KEY!;
  const basis = process.env.WA_API_BASE ?? "https://api.fonnte.com";

  const res = await fetch(`${basis}/send`, {
    method: "POST",
    headers: { Authorization: kunci, "Content-Type": "application/json" },
    body: JSON.stringify({ target: tujuan, message: isi }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`Penyedia menjawab HTTP ${res.status}`);
  const jawab = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (jawab && jawab.status === false)
    throw new Error(String(jawab.reason ?? "Penyedia menolak pesan."));
  void saluran;
}

/* ------------------------------------------------------------------ */

export function pesanKodePemulihan(nama: string, kode: string): string {
  return [
    `Halo ${nama},`,
    "",
    `Kode untuk mengatur ulang kata sandi NuraHome Care Anda: ${kode}`,
    "",
    "Berlaku 15 menit dan hanya bisa dipakai sekali.",
    "Kalau bukan Anda yang meminta, abaikan pesan ini — kata sandi Anda tidak berubah.",
    "Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari NuraHome Care.",
  ].join("\n");
}

export function tujuanUntuk(telepon: string): string {
  return telingaTelepon(telepon);
}
