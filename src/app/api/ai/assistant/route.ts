/**
 * Asisten tanya-jawab sebelum memesan, dan perapi catatan perawat.
 *
 * Seluruh pertimbangannya ada di logic/asisten.ts. Berkas ini hanya
 * menjaga pintunya: siapa boleh memanggil apa, dan seberapa sering.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  DUA HAL YANG DULU TIDAK DIJAGA SAMA SEKALI DI SINI                   │
 * │                                                                       │
 * │  1. Mode SOAP bisa dipanggil SIAPA PUN tanpa masuk. Itu alat untuk    │
 * │     menulis rekam medis; tidak ada urusannya dengan tamu.             │
 * │  2. Tidak ada batas permintaan. Satu skrip bisa memanggilnya ribuan   │
 * │     kali dan membebani basis data yang sama yang dipakai pasien       │
 * │     sungguhan.                                                        │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { services } from "@/db/schema";
import { aktorDariPermintaan } from "@/server/aktor";
import {
  KOSONG_SOAP,
  PESAN_BAHAYA,
  SANGKALAN,
  SANGKALAN_MODEL,
  SANGKALAN_SOAP,
  gabungkan,
  periksaTandaBahaya,
  rapikanSoap,
  sarankanLayanan,
} from "@/logic/asisten";
import { modelSiap, tanyaModel } from "@/server/model-ai";

export const dynamic = "force-dynamic";

/**
 * Dipanggil laci tanya-jawab saat dibuka, supaya kalimat pembukanya bisa
 * mengatakan apa adanya: apakah yang Anda ketik akan dikirim ke layanan AI
 * di luar NuraHome Care atau tidak. Memberi tahu SETELAH orang mengetik
 * keluhannya bukan pemberitahuan, itu pengumuman.
 */
export async function GET() {
  const m = modelSiap();
  return NextResponse.json({ pakaiModel: m.siap });
}

/* ------------------------------------------------------------------ */
/* Batas permintaan                                                    */
/* ------------------------------------------------------------------ */

/**
 * Penghitung di dalam proses, bukan di basis data.
 *
 * Sengaja sederhana: yang dijaga di sini hanya beban, bukan uang dan
 * bukan rahasia. Kalau servernya dijalankan lebih dari satu, batasnya
 * menjadi per-server — dan itu masih jauh lebih baik daripada tidak ada
 * batas sama sekali, yang merupakan keadaannya sampai hari ini.
 */
const JENDELA_MS = 60_000;

/**
 * 60 per menit, bukan 20.
 *
 * Angka ini dinaikkan setelah tesnya sendiri kena batas: 20 terlalu rapat.
 * Bukan karena tesnya cerewet — karena satu alamat IP di sini sering
 * berarti BANYAK ORANG. Satu rumah dengan satu router, satu warnet, satu
 * ruang tunggu klinik dengan wifi bersama. Membatasi terlalu ketat berarti
 * orang kedua yang bertanya dari rumah yang sama ditolak tanpa sebab yang
 * ia mengerti.
 *
 * 60 masih jauh di bawah yang bisa dilakukan skrip, dan jauh di atas yang
 * bisa diketik manusia.
 */
const BATAS_PER_MENIT = 60;
const hitung = new Map<string, { n: number; sampai: number }>();

function terlaluSering(sidik: string): boolean {
  const sekarang = Date.now();
  const ada = hitung.get(sidik);
  if (!ada || ada.sampai < sekarang) {
    hitung.set(sidik, { n: 1, sampai: sekarang + JENDELA_MS });
    /** Bersih-bersih sekalian supaya peta ini tidak tumbuh selamanya. */
    if (hitung.size > 5_000)
      for (const [k, v] of hitung) if (v.sampai < sekarang) hitung.delete(k);
    return false;
  }
  ada.n += 1;
  return ada.n > BATAS_PER_MENIT;
}

const GARAM_IP = process.env.IP_HASH_SALT || process.env.CRON_SECRET || "nurahome-garam-lokal";

/**
 * Alamat diambil dari x-forwarded-for, yang di belakang proxy diisi oleh
 * proxy-nya. Kalau aplikasi ini suatu saat dijalankan TANPA proxy di
 * depannya, kepala itu bisa dipalsukan pemanggil dan batas ini bisa
 * dilewati. Itu diterima di sini dengan sadar: yang dijaga cuma beban
 * server, bukan uang dan bukan rahasia. Untuk keduanya, penjagaannya ada
 * di tempat lain dan tidak bergantung pada kepala permintaan.
 */
function sidikIp(req: NextRequest): string {
  const f = req.headers.get("x-forwarded-for");
  const ip = f ? f.split(",")[0].trim() : (req.headers.get("x-real-ip") ?? "0.0.0.0");
  return createHash("sha256").update(`${GARAM_IP}:${ip}`).digest("hex").slice(0, 32);
}

/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const mode = String((body as { mode?: unknown })?.mode ?? "INTAKE");

    if (terlaluSering(sidikIp(req)))
      return NextResponse.json(
        { error: "Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi." },
        { status: 429 }
      );

    /* ---------------- Merapikan catatan perawat ---------------- */
    if (mode === "SOAP_STRUCTURER") {
      /**
       * Hanya perawat. Ini alat penulis rekam medis, dan rekam medis
       * bukan bacaan umum — lihat UU 17/2023 Pasal 263 dan Permenkes
       * 24/2022. Sebelum ini, tamu mana pun bisa memanggilnya.
       */
      const aktor = await aktorDariPermintaan();
      if (!aktor.masuk || aktor.peran !== "PROVIDER")
        return NextResponse.json(
          { error: "Hanya perawat yang sudah masuk yang bisa memakai perapi catatan." },
          { status: 403 }
        );

      const catatan = String((body as { roughNotes?: unknown })?.roughNotes ?? "");
      if (!catatan.trim())
        return NextResponse.json(
          {
            error:
              "Tulis dulu catatan kasarnya. Alat ini merapikan apa yang Anda tulis — ia tidak punya apa pun untuk ditulis sendiri.",
          },
          { status: 400 }
        );

      const soap = rapikanSoap(catatan);
      return NextResponse.json({
        soap,
        kosong: KOSONG_SOAP,
        /** Dikirim balik supaya perawat bisa membandingkan dengan aslinya. */
        catatanAsli: catatan,
        sangkalan: SANGKALAN_SOAP,
      });
    }

    /* ---------------- Tanya-jawab sebelum memesan ---------------- */
    const pertanyaan = String((body as { prompt?: unknown })?.prompt ?? "");

    /**
     * Tanda bahaya diperiksa LEBIH DULU, sebelum apa pun yang lain.
     *
     * Kalau rekomendasi layanan ikut dikirim bersama peringatan darurat,
     * yang dilihat orang adalah tombol "pesan sekarang" — dan itu persis
     * yang tidak boleh ia lakukan saat itu.
     */
    const periksa = periksaTandaBahaya(pertanyaan);
    if (periksa.bahaya)
      return NextResponse.json({
        bahaya: true,
        judul: PESAN_BAHAYA.judul,
        temuan: periksa.temuan,
        tindakan: PESAN_BAHAYA.tindakan,
        sangkalan: PESAN_BAHAYA.jujur,
        layanan: null,
        pertanyaan: [],
      });

    /**
     * Daftar layanan dibaca dari basis data, bukan ditulis mati di sini.
     * Nama dan harga yang dilihat pasien di percakapan harus sama persis
     * dengan yang ia lihat saat memesan.
     */
    const daftar = await db.select().from(services);
    const saran = sarankanLayanan(pertanyaan, daftar);

    /**
     * Model baru ditanya DI SINI — setelah tanda bahaya dinyatakan aman
     * oleh daftar kata, dan setelah jalur pencocokan kata sudah punya
     * jawabannya sendiri.
     *
     * Urutan ini yang membuat seluruh susunannya aman: kalau penyedianya
     * mati, lambat, kunci habis, atau menjawab ngawur, `tanyaModel`
     * mengembalikan null dan pasien tetap menerima jawaban yang lengkap.
     * Model menambah kualitas; ia tidak pernah menjadi syarat.
     */
    const jawabModel = pertanyaan.trim() ? await tanyaModel(pertanyaan, daftar) : null;
    const gabung = gabungkan({ kata: periksa, saran, model: jawabModel });

    /** Model menaikkan tanda bahaya yang tidak dikenali daftar kata. */
    if (gabung.bahaya)
      return NextResponse.json({
        bahaya: true,
        judul: PESAN_BAHAYA.judul,
        temuan: gabung.temuan,
        tindakan: PESAN_BAHAYA.tindakan,
        sangkalan: PESAN_BAHAYA.jujur,
        layanan: null,
        pertanyaan: [],
        dibantuModel: gabung.dariModel,
      });

    const layanan = gabung.slugLayanan
      ? (daftar.find((l) => l.slug === gabung.slugLayanan) ?? null)
      : null;

    return NextResponse.json({
      bahaya: false,
      teks: gabung.balasan || undefined,
      layanan: layanan
        ? {
            id: layanan.id,
            slug: layanan.slug,
            name: layanan.name,
            /** Nama dan tarif SELALU dari tabel, tidak pernah dari model. */
            basePriceIdr: layanan.basePriceIdr,
            alasan: saran.layanan?.slug === layanan.slug ? saran.alasan : "",
          }
        : null,
      pertanyaan: gabung.pertanyaan,
      sangkalan: jawabModel ? SANGKALAN_MODEL : SANGKALAN,
      dibantuModel: Boolean(jawabModel),
    });
  } catch (e) {
    console.error("POST /api/ai/assistant:", e);
    return NextResponse.json(
      { error: "Asistennya sedang tidak bisa menjawab. Anda tetap bisa memesan langsung." },
      { status: 500 }
    );
  }
}
