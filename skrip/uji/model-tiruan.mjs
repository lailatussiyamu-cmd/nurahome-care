/**
 * Penyedia model (AI) tiruan untuk tes.
 *
 * Menjawab seperti Gemini `generateContent`, dan mencatat SETIAP permintaan
 * yang masuk. Catatan itu yang dipakai tes untuk membuktikan dua hal yang
 * tidak bisa dibuktikan dari jawabannya saja:
 *
 *   1. keluhan yang sudah dinyatakan gawat oleh daftar kata TIDAK PERNAH
 *      dikirim ke penyedia — bukan "dikirim tapi jawabannya diabaikan";
 *   2. nomor telepon dan surel yang ikut diketik orang di dalam keluhannya
 *      TIDAK ikut keluar.
 *
 * Kenapa penyedia tiruan dan bukan kode khusus-tes di dalam aplikasi:
 * jalur `tanyaModel()` yang sungguhan ikut teruji — bentuk badan
 * permintaannya, pembacaan jawabannya, penyamaran datanya, dan perilakunya
 * saat penyedia menjawab ngawur atau mati.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MODEL_TIRUAN_PORT ?? 3212);

/** Permintaan yang pernah masuk — dibaca tes lewat GET /_catatan. */
const catatan = [];

/**
 * Jawaban berikutnya. Bawaannya sengaja "tidak berpendapat": tidak gawat,
 * tidak memilih layanan, tidak menulis apa pun. Dengan begitu seluruh tes
 * asisten yang sudah ada tetap menguji jalur pencocokan kata, dan hanya
 * tes yang memang ingin melibatkan model yang mengaturnya.
 */
let berikutnya = {
  jenis: "JSON",
  isi: { gawat: false, alasanGawat: "", slugLayanan: null, balasan: "", pertanyaan: [] },
};

const server = createServer((req, res) => {
  let badan = "";
  req.on("data", (c) => (badan += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && req.url?.startsWith("/_catatan")) {
      res.writeHead(200);
      return res.end(JSON.stringify(catatan));
    }

    if (req.method === "POST" && req.url?.startsWith("/_atur")) {
      try {
        berikutnya = JSON.parse(badan);
      } catch {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: "badan bukan JSON" }));
      }
      res.writeHead(200);
      return res.end(JSON.stringify({ ok: true }));
    }

    if (req.method === "POST" && req.url?.startsWith("/_bersihkan")) {
      catatan.length = 0;
      berikutnya = {
        jenis: "JSON",
        isi: { gawat: false, alasanGawat: "", slugLayanan: null, balasan: "", pertanyaan: [] },
      };
      res.writeHead(200);
      return res.end(JSON.stringify({ ok: true }));
    }

    if (req.method === "POST" && req.url?.includes(":generateContent")) {
      let isi = {};
      try {
        isi = JSON.parse(badan);
      } catch {
        /* dicatat apa adanya di bawah */
      }
      const teks = isi?.contents?.[0]?.parts?.[0]?.text ?? "";
      catatan.push({ teks, pada: Date.now() });

      /** Penyedia yang MATI. */
      if (berikutnya.jenis === "GALAT") {
        res.writeHead(berikutnya.status ?? 500);
        return res.end(JSON.stringify({ error: { message: "penyedia sedang bermasalah" } }));
      }

      /** Penyedia yang menjawab bukan JSON — benar-benar terjadi di dunia nyata. */
      if (berikutnya.jenis === "NGAWUR") {
        res.writeHead(200);
        return res.end(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "Tentu! Berikut sarannya: ..." }] } }],
          })
        );
      }

      /** Penyedia yang LAMBAT — jawabannya tidak pernah datang tepat waktu. */
      if (berikutnya.jenis === "LAMBAT") {
        setTimeout(() => {
          res.writeHead(200);
          res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }));
        }, 15_000);
        return;
      }

      /**
       * Jawaban normal, dibungkus pagar kode ```json seperti yang sering
       * dilakukan model sungguhan walau diminta tidak.
       */
      const keluar = berikutnya.pagar
        ? "```json\n" + JSON.stringify(berikutnya.isi) + "\n```"
        : JSON.stringify(berikutnya.isi);

      res.writeHead(200);
      return res.end(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: keluar }] } }] })
      );
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "tidak dikenal" }));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Model tiruan siap di http://127.0.0.1:${PORT}`);
});
