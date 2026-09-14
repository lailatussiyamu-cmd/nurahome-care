/**
 * Satu-satunya tempat yang berhak menjawab "siapa yang mengirim permintaan
 * ini".
 *
 * Sebelum berkas ini ada, jawabannya diambil dari badan permintaan:
 *
 *     const { actorRole, actorUserId } = body;
 *     if (actorRole !== "ADMIN") return NextResponse.json({ error: ... });
 *
 * Yang mengisi `actorRole` adalah browser. Artinya penjagaan itu bertanya
 * kepada penyerang apakah ia penyerang. Satu baris di Developer Tools —
 * `fetch('/api/platform',{method:'POST',body:'{"actorRole":"ADMIN",…}'})` —
 * cukup untuk membaca dan mengubah data seluruh pasien.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ATURAN: tidak satu pun penanganan aksi boleh membaca actorRole,      │
 * │  actorUserId, atau actorProviderId dari `body`. Semuanya memanggil    │
 * │  aktorDariPermintaan(). Ada uji yang menggagalkan build kalau nama    │
 * │  itu muncul lagi — lihat skrip periksa-aktor.mjs.                     │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, providers } from "@/db/schema";
import {
  NAMA_COOKIE,
  PESAN_TOLAK,
  periksaSesi,
  sidikToken,
  umurUntuk,
  type AlasanTolak,
} from "@/logic/otentikasi";

export type Aktor = {
  masuk: boolean;
  peran: "PATIENT" | "PROVIDER" | "ADMIN";
  userId: number | null;
  providerId: number | null;
  nama: string | null;
  sessionId: number | null;
  /** Terisi hanya bila masuk === false. */
  alasan: AlasanTolak | "";
  pesan: string;
};

export const TAMU: Aktor = {
  masuk: false,
  peran: "PATIENT",
  userId: null,
  providerId: null,
  nama: null,
  sessionId: null,
  alasan: "TIDAK_ADA",
  pesan: PESAN_TOLAK.TIDAK_ADA,
};

function ditolak(alasan: AlasanTolak): Aktor {
  return { ...TAMU, alasan, pesan: PESAN_TOLAK[alasan] };
}

/**
 * Membaca cookie, mencari sesinya, memastikan masih berlaku.
 *
 * Sekaligus memperbarui `last_seen_at`, karena batas "terlalu lama diam"
 * hanya berarti kalau ada yang mencatat kapan terakhir dipakai. Pembaruan
 * itu dibatasi sekali per menit — tanpa itu, setiap pemuatan halaman
 * menulis satu baris ke basis data hanya untuk memajukan penanda waktu
 * beberapa detik.
 */
export async function aktorDariPermintaan(): Promise<Aktor> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(NAMA_COOKIE)?.value;
  } catch {
    return ditolak("TIDAK_ADA");
  }
  if (!token) return ditolak("TIDAK_ADA");

  const sidik = sidikToken(token);
  const [sesi] = await db.select().from(sessions).where(eq(sessions.tokenHash, sidik)).limit(1);
  if (!sesi) return ditolak("TIDAK_ADA");

  const [pemakai] = await db.select().from(users).where(eq(users.id, sesi.userId)).limit(1);
  const aktif = !!pemakai && pemakai.accountStatus !== "NONAKTIF";

  const sekarang = new Date();
  const periksa = periksaSesi(sesi, aktif, sekarang);
  if (!periksa.boleh) return ditolak(periksa.alasan as AlasanTolak);

  const jarak = sekarang.getTime() - new Date(sesi.lastSeenAt).getTime();
  if (jarak > 60_000) {
    await db.update(sessions).set({ lastSeenAt: sekarang }).where(eq(sessions.id, sesi.id));
  }

  /**
   * Peran diambil dari BARIS SESI, bukan dari baris users.
   *
   * Kalau peran seseorang diturunkan — misalnya admin yang berhenti — sesi
   * yang sedang berjalan harus dicabut secara sadar, bukan diam-diam ikut
   * berubah di tengah permintaan. Yang diam-diam berubah sulit diaudit:
   * jejaknya menunjukkan admin melakukan sesuatu yang saat itu ia sudah
   * bukan admin lagi.
   */
  return {
    masuk: true,
    peran: sesi.role as Aktor["peran"],
    userId: sesi.userId,
    providerId: sesi.providerId ?? null,
    nama: pemakai?.name ?? null,
    sessionId: sesi.id,
    alasan: "",
    pesan: "",
  };
}

/* ------------------------------------------------------------------ */
/* Membuat dan mencabut sesi                                           */
/* ------------------------------------------------------------------ */

export async function buatSesi(a: {
  tokenHash: string;
  userId: number;
  role: string;
  providerId: number | null;
  deviceLabel: string | null;
  ipHash: string | null;
}): Promise<number> {
  const sekarang = new Date();
  const [baris] = await db
    .insert(sessions)
    .values({
      tokenHash: a.tokenHash,
      userId: a.userId,
      role: a.role,
      providerId: a.providerId,
      createdAt: sekarang,
      lastSeenAt: sekarang,
      expiresAt: new Date(sekarang.getTime() + umurUntuk(a.role).totalJam * 3_600_000),
      deviceLabel: a.deviceLabel,
      ipHash: a.ipHash,
    })
    .returning();
  return baris.id;
}

export async function cabutSesi(id: number, alasan: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: alasan })
    .where(eq(sessions.id, id));
}

/**
 * Mencabut SEMUA sesi seorang pemakai.
 *
 * Dipanggil saat kata sandi diganti dan saat akun dinonaktifkan. Mengganti
 * kata sandi tanpa mencabut sesi lama tidak menyelesaikan apa pun bagi
 * orang yang menggantinya justru karena curiga ada yang masuk ke akunnya —
 * sesi penyerang tetap hidup.
 */
export async function cabutSemuaSesi(userId: number, alasan: string, kecuali?: number) {
  const daftar = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId)));
  for (const s of daftar) {
    if (s.revokedAt || s.id === kecuali) continue;
    await cabutSesi(s.id, alasan);
  }
}

/* ------------------------------------------------------------------ */
/* Penolong untuk penanganan aksi                                      */
/* ------------------------------------------------------------------ */

export function harusMasuk(a: Aktor): string | null {
  return a.masuk ? null : a.pesan;
}

export function harusAdmin(a: Aktor): string | null {
  if (!a.masuk) return a.pesan;
  return a.peran === "ADMIN" ? null : "Hanya admin yang boleh melakukan ini.";
}

export function harusPerawat(a: Aktor): string | null {
  if (!a.masuk) return a.pesan;
  if (a.peran === "ADMIN") return null;
  if (a.peran !== "PROVIDER" || a.providerId == null)
    return "Hanya perawat yang boleh melakukan ini.";
  return null;
}

/**
 * "Pemesanan ini milik Anda?"
 *
 * Pencocokannya HANYA lewat id, tidak pernah lewat nama. Dua pasien
 * bernama sama bukan hal yang jarang, dan nama bisa diubah pemakainya
 * sendiri di halaman profil — penjagaan yang bertumpu pada nama bisa
 * dilewati dengan mengetik nama orang lain di kolom nama.
 */
export function pesananMilikPasien(a: Aktor, pesanan: { patientId?: number | null }): boolean {
  return a.masuk && a.userId != null && pesanan?.patientId === a.userId;
}

export function pesananDipegangPerawat(a: Aktor, pesanan: { providerId?: number | null }): boolean {
  return a.masuk && a.providerId != null && pesanan?.providerId === a.providerId;
}

/** Data perawat untuk aktor ini — dipakai saat menandatangani dokumen klinis. */
export async function perawatDariAktor(a: Aktor) {
  if (a.providerId == null) return null;
  const [p] = await db.select().from(providers).where(eq(providers.id, a.providerId)).limit(1);
  return p ?? null;
}
