/**
 * Sambungan ke model bahasa (AI) — opsional, dan selalu sebagai LAPISAN KEDUA.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  TIGA HAL YANG TIDAK PERNAH DISERAHKAN KE MODEL                       │
 * │                                                                       │
 * │  1. KEPUTUSAN TANDA BAHAYA. Daftar kata di logic/asisten.ts diperiksa │
 * │     LEBIH DULU dan menang. Model hanya boleh MENAMBAH tanda bahaya    │
 * │     yang tidak dikenali daftar, tidak pernah mencabutnya. Alasannya:  │
 * │     jawaban model bisa berubah-ubah untuk kalimat yang sama, dan      │
 * │     "apakah orang ini perlu ke IGD" bukan pertanyaan yang boleh       │
 * │     dijawab berbeda hari ini dan besok.                               │
 * │                                                                       │
 * │  2. ISI REKAM MEDIS. Perapi catatan SOAP tidak menyentuh berkas ini   │
 * │     sama sekali. Rekam medis harus memuat apa yang benar-benar        │
 * │     dikerjakan (Permenkes 24/2022 Pasal 26); model bahasa menulis     │
 * │     kalimat yang MASUK AKAL, dan itu justru bahayanya.                 │
 * │                                                                       │
 * │  3. HARGA DAN NAMA LAYANAN. Model hanya boleh memilih satu dari       │
 * │     daftar slug yang diberikan. Nama dan tarifnya dibaca ulang dari   │
 * │     tabel layanan di server.                                          │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * KALAU KUNCINYA TIDAK DIPASANG, SELURUH APLIKASI TETAP BEKERJA seperti
 * sebelum berkas ini ada. Model adalah tambahan, bukan penopang. Kalau
 * penyedianya mati, lambat, atau menjawab ngawur, jawabannya kembali ke
 * jalur pencocokan kata — bukan layar kosong.
 */

import { NextResponse } from "next/server";

export type Penyedia = "GEMINI" | "OPENAI" | "ANTHROPIC";

export type KesiapanModel = {
  siap: boolean;
  penyedia: Penyedia | null;
  model: string;
  /** Diisi kalau belum siap — kalimat untuk dibaca admin, bukan kode galat. */
  alasan: string;
};

/**
 * Batas waktu 8 detik.
 *
 * Yang menunggu adalah orang yang sedang cemas memandangi luka. Jawaban
 * bagus yang datang 30 detik lagi lebih buruk daripada jawaban sederhana
 * sekarang — ia sudah menutup aplikasinya.
 */
const BATAS_MS = 8_000;

export function modelSiap(): KesiapanModel {
  const penyedia = String(process.env.AI_PENYEDIA ?? "").toUpperCase() as Penyedia;
  const kunci = process.env.AI_API_KEY ?? "";

  if (!penyedia)
    return {
      siap: false,
      penyedia: null,
      model: "",
      alasan: "AI_PENYEDIA belum dipasang. Asisten berjalan dengan pencocokan kata saja.",
    };
  if (!["GEMINI", "OPENAI", "ANTHROPIC"].includes(penyedia))
    return {
      siap: false,
      penyedia: null,
      model: "",
      alasan: `AI_PENYEDIA "${penyedia}" tidak dikenali. Pilih GEMINI, OPENAI, atau ANTHROPIC.`,
    };
  if (kunci.length < 10)
    return {
      siap: false,
      penyedia,
      model: "",
      alasan: "AI_API_KEY belum dipasang atau terlalu pendek.",
    };

  return { siap: true, penyedia, model: namaModel(penyedia), alasan: "" };
}

function namaModel(penyedia: Penyedia): string {
  const dipilih = process.env.AI_MODEL;
  if (dipilih) return dipilih;
  /**
   * Bawaan sengaja model yang paling murah dan paling cepat di tiap
   * penyedia. Pekerjaannya di sini ringan: membaca satu kalimat keluhan,
   * memilih satu layanan dari lima, dan menyusun tiga pertanyaan. Itu
   * tidak butuh model besar, dan model besar membuat orang menunggu lebih
   * lama untuk hasil yang sama.
   */
  if (penyedia === "GEMINI") return "gemini-2.5-flash";
  if (penyedia === "OPENAI") return "gpt-4o-mini";
  return "claude-haiku-4-5";
}

/* ------------------------------------------------------------------ */
/* Apa yang boleh dikirim keluar                                       */
/* ------------------------------------------------------------------ */

/**
 * Yang dikirim ke penyedia HANYA kalimat keluhan yang diketik orangnya.
 *
 * Tidak ada nama, alamat, nomor telepon, nomor pemesanan, dan tidak ada
 * satu pun foto luka. Ini bukan kehati-hatian berlebihan: keluhan
 * kesehatan adalah data pribadi spesifik menurut UU 27/2022 Pasal 4 ayat
 * (2), dan penyedia modelnya ada di luar negeri.
 *
 * Fungsi ini menutup lubang yang paling mungkin terjadi: orang mengetik
 * nomor teleponnya sendiri di dalam keluhan ("tolong hubungi saya di
 * 0812..."), dan nomor itu ikut terkirim tanpa ada yang berniat
 * mengirimnya.
 */
export function samarkanUntukModel(teks: string): string {
  return String(teks ?? "")
    .replace(/\b(?:\+62|62|0)8\d{7,12}\b/g, "[nomor]")
    .replace(/\b\d{10,}\b/g, "[angka panjang]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, "[surel]")
    .replace(/\bNHC-\d{4}-\d+\b/gi, "[kode pesanan]")
    .slice(0, 1200);
}

/* ------------------------------------------------------------------ */
/* Memanggil model                                                     */
/* ------------------------------------------------------------------ */

export type JawabanModel = {
  /** Model HANYA boleh menaikkan ini menjadi true, tidak pernah menurunkan. */
  gawat: boolean;
  alasanGawat: string;
  /** Harus salah satu slug dari daftar yang diberikan, atau null. */
  slugLayanan: string | null;
  /** Satu-dua kalimat untuk dibaca pasien. Tanpa diagnosis, tanpa obat. */
  balasan: string;
  pertanyaan: string[];
};

/**
 * Mengembalikan null untuk SETIAP kegagalan — kunci salah, penyedia mati,
 * jawaban bukan JSON, kelewat batas waktu. Pemanggilnya lalu memakai jalur
 * pencocokan kata. Tidak ada satu pun keadaan di mana kegagalan model
 * membuat pasien melihat layar kosong.
 */
export async function tanyaModel(
  keluhan: string,
  layanan: { slug: string; name: string }[]
): Promise<JawabanModel | null> {
  const siap = modelSiap();
  if (!siap.siap || !siap.penyedia) return null;

  const daftar = layanan.map((l) => `- ${l.slug}: ${l.name}`).join("\n");

  const perintah = `Anda membantu layanan perawatan luka dan sunat di rumah, di Malang, Indonesia.
Tugas Anda HANYA: memahami keluhan yang ditulis calon pasien, memilih layanan yang paling sesuai, dan menyusun pertanyaan yang perlu diketahui perawat sebelum berangkat.

ATURAN KERAS:
- Anda BUKAN dokter. Jangan memberi diagnosis, jangan menyebut nama penyakit sebagai kesimpulan, jangan menyarankan obat atau dosis.
- Jangan mengarang fakta tentang lukanya. Anda hanya membaca kalimat orang itu; Anda tidak melihat lukanya.
- Kalau keluhannya terdengar gawat (perdarahan tidak berhenti, demam tinggi, jaringan menghitam/berbau, kesadaran menurun, sesak napas, kemerahan menjalar cepat, tidak bisa buang air kecil setelah sunat, atau keadaan lain yang sebanding), setel "gawat": true.
- Kalau keluhannya belum jelas, setel "slugLayanan": null dan ajukan pertanyaan. Jangan menebak.
- Jangan menyebut harga sama sekali.
- Jawab dalam bahasa Indonesia yang sederhana dan hangat. "balasan" maksimal 2 kalimat.
- Maksimal 3 pertanyaan, masing-masing satu kalimat.

Layanan yang tersedia (pilih slug-nya, atau null):
${daftar}

Jawab HANYA dengan JSON, tanpa penjelasan dan tanpa pagar kode:
{"gawat": boolean, "alasanGawat": string, "slugLayanan": string|null, "balasan": string, "pertanyaan": string[]}`;

  const isi = samarkanUntukModel(keluhan);

  try {
    const mentah = await panggil(siap.penyedia, siap.model, perintah, isi);
    if (!mentah) return null;
    return bacaJawaban(mentah, layanan.map((l) => l.slug));
  } catch {
    return null;
  }
}

/**
 * Model kadang membungkus JSON-nya dengan ```json … ``` walau diminta
 * tidak. Itu bukan kegagalan yang pantas membuat pasien kehilangan
 * jawaban, jadi pembungkusnya dilepas di sini.
 */
function bacaJawaban(mentah: string, slugSah: string[]): JawabanModel | null {
  const bersih = mentah
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let j: Record<string, unknown>;
  try {
    j = JSON.parse(bersih);
  } catch {
    const m = bersih.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      j = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }

  const slug = typeof j.slugLayanan === "string" ? j.slugLayanan : null;

  return {
    gawat: j.gawat === true,
    alasanGawat: String(j.alasanGawat ?? "").slice(0, 300),
    /**
     * Slug yang tidak ada di daftar dibuang, bukan dipercaya. Model yang
     * mengarang nama layanan akan membuat tombol "Lihat & pesan" menunjuk
     * ke layanan yang tidak ada.
     */
    slugLayanan: slug && slugSah.includes(slug) ? slug : null,
    balasan: String(j.balasan ?? "").slice(0, 600),
    pertanyaan: Array.isArray(j.pertanyaan)
      ? j.pertanyaan.filter((q) => typeof q === "string" && q.trim()).slice(0, 3).map((q) => String(q).slice(0, 200))
      : [],
  };
}

/* ------------------------------------------------------------------ */
/* Tiga penyedia, satu bentuk panggilan                                */
/* ------------------------------------------------------------------ */

async function panggil(
  penyedia: Penyedia,
  model: string,
  perintah: string,
  isi: string
): Promise<string | null> {
  const kunci = process.env.AI_API_KEY!;
  const batas = AbortSignal.timeout(BATAS_MS);

  if (penyedia === "GEMINI") {
    const basis = process.env.AI_API_BASE ?? "https://generativelanguage.googleapis.com";
    const res = await fetch(
      `${basis}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": kunci },
        signal: batas,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: perintah }] },
          contents: [{ role: "user", parts: [{ text: isi }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 600, responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) return null;
    const d = await res.json();
    return d?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  }

  if (penyedia === "OPENAI") {
    const basis = process.env.AI_API_BASE ?? "https://api.openai.com";
    const res = await fetch(`${basis}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${kunci}` },
      signal: batas,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: perintah },
          { role: "user", content: isi },
        ],
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.choices?.[0]?.message?.content ?? null;
  }

  const basis = process.env.AI_API_BASE ?? "https://api.anthropic.com";
  const res = await fetch(`${basis}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": kunci,
      "anthropic-version": "2023-06-01",
    },
    signal: batas,
    body: JSON.stringify({
      model,
      max_tokens: 600,
      temperature: 0.2,
      system: perintah,
      messages: [{ role: "user", content: isi }],
    }),
  });
  if (!res.ok) return null;
  const d = await res.json();
  return d?.content?.[0]?.text ?? null;
}

/** Dipakai layar admin untuk menampilkan keadaan sambungan apa adanya. */
export function ringkasanModel() {
  const s = modelSiap();
  return NextResponse.json({
    siap: s.siap,
    penyedia: s.penyedia,
    model: s.model,
    alasan: s.alasan,
  });
}
