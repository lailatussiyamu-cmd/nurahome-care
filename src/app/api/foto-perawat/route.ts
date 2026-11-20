/**
 * Foto wajah perawat — hanya untuk yang memang perlu mengenali wajahnya.
 *
 * Foto ini ada supaya pasien bisa memastikan orang di depan pintunya adalah
 * perawat yang ditugaskan. Itu tujuan yang sempit, jadi aksesnya juga
 * sempit:
 *
 *   - ADMIN (yang mencocokkannya dengan KTP),
 *   - perawatnya sendiri,
 *   - PASIEN yang punya kunjungan dengan perawat ini yang SUDAH DIBAYAR —
 *     artinya kunjungannya pasti terjadi dan perawat akan datang.
 *
 * Tidak untuk tamu, tidak untuk perawat lain, tidak untuk pasien yang baru
 * melihat-lihat. Wajah, nama, dan jadwal seseorang yang datang sendirian ke
 * rumah orang asing bukan bahan katalog.
 *
 * Foto yang tampil hanya yang sudah diluluskan admin (kolom avatar_url diisi
 * saat PUTUS_VERIFIKASI), bukan sembarang foto yang diunggah perawat.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, providers } from "@/db/schema";
import { aktorDariPermintaan } from "@/server/aktor";
import { S } from "@/logic/alur";

export const dynamic = "force-dynamic";

/** Status yang berarti perawat ini PASTI datang atau sudah datang. */
const KUNJUNGAN_PASTI = [S.DIBAYAR, S.PERAWAT_BERANGKAT, S.PERAWAT_TIBA, S.DIKERJAKAN, S.SELESAI];

export async function GET(req: NextRequest) {
  const aktor = await aktorDariPermintaan();
  if (!aktor.masuk) return NextResponse.json({ error: aktor.pesan }, { status: 401 });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "Perawat tidak dikenal." }, { status: 400 });

  let boleh = aktor.peran === "ADMIN" || (aktor.peran === "PROVIDER" && aktor.providerId === id);
  if (!boleh && aktor.peran === "PATIENT") {
    const [ada] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.patientId, aktor.userId!),
          eq(bookings.providerId, id),
          inArray(bookings.status, KUNJUNGAN_PASTI)
        )
      )
      .limit(1);
    boleh = Boolean(ada);
  }
  if (!boleh)
    return NextResponse.json(
      { error: "Foto perawat hanya untuk pasien yang akan dikunjunginya." },
      { status: 403 }
    );

  const [p] = await db.select({ foto: providers.avatarUrl }).from(providers).where(eq(providers.id, id));
  const cocok = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(p?.foto ?? ""));
  if (!cocok) return NextResponse.json({ error: "Foto belum tersedia." }, { status: 404 });

  return new NextResponse(Buffer.from(cocok[2], "base64"), {
    headers: {
      "Content-Type": cocok[1],
      // Wajah orang: jangan disimpan di cache ponsel yang mungkin dipinjam.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
