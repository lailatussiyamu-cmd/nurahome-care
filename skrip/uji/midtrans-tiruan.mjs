/**
 * Midtrans tiruan untuk tes.
 *
 * Menjawab seperti Snap API: menerima pembuatan transaksi dan
 * mengembalikan token. TIDAK menirukan pembayaran — kabar `settlement`
 * dikirim sendiri oleh tesnya, ditandatangani dengan kunci uji yang sama
 * yang dipakai aplikasi.
 *
 * Kenapa penyedia tiruan, bukan kode khusus-tes di dalam aplikasi:
 * jalur `buatTransaksi()` yang sungguhan ikut teruji — termasuk pemeriksaan
 * bahwa jumlah item sama dengan total, dan bentuk badan permintaannya.
 * Kode khusus-tes di dalam aplikasi justru melewati bagian yang paling
 * ingin diuji, dan menambah cabang yang hanya hidup saat diuji.
 */
import { createServer } from "node:http";

export function midtransTiruan(port = 3211) {
  const dibuat = [];
  const server = createServer((req, res) => {
    let badan = "";
    req.on("data", (c) => (badan += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");

      if (req.method === "POST" && req.url?.includes("/snap/v1/transactions")) {
        let isi = {};
        try { isi = JSON.parse(badan); } catch { /* biar ditangkap di bawah */ }
        const orderId = isi?.transaction_details?.order_id;
        const total = isi?.transaction_details?.gross_amount;

        if (!orderId || typeof total !== "number") {
          res.writeHead(400);
          return res.end(JSON.stringify({ error_messages: ["transaction_details tidak lengkap"] }));
        }
        // Midtrans menolak order_id yang sudah pernah dipakai — ditirukan,
        // karena penomoran percobaan di aplikasi dibuat justru karena ini.
        if (dibuat.some((d) => d.orderId === orderId)) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error_messages: ["order_id has already been taken"] }));
        }
        dibuat.push({ orderId, total });

        /**
         * Melunasi sendiri — HANYA kalau diminta lewat TIRUAN_AUTO_LUNAS,
         * dan itu hanya dipasang oleh `npm run coba` di komputer sendiri.
         *
         * Tes TIDAK memakainya: di sana kabar pembayaran dikirim oleh
         * tesnya sendiri, karena isi dan tanda tangannya justru bagian
         * yang diuji. Yang butuh ini adalah orang yang sedang mencoba
         * aplikasinya dengan tangan — tanpa ini ia mentok di halaman
         * bayar dan tidak pernah sampai ke kunjungan, laporan, dan bagi
         * hasil.
         */
        if (process.env.TIRUAN_AUTO_LUNAS === "1") {
          setTimeout(() => void lunasiSendiri(orderId, total), 2500);
        }

        res.writeHead(201);
        return res.end(JSON.stringify({
          token: `token-uji-${orderId}`,
          redirect_url: `http://127.0.0.1:${port}/bayar/${orderId}`,
        }));
      }

      if (req.method === "GET" && /\/v2\/.+\/status/.test(req.url ?? "")) {
        const orderId = decodeURIComponent(req.url.split("/v2/")[1].split("/status")[0]);
        const d = dibuat.find((x) => x.orderId === orderId);
        if (!d) { res.writeHead(404); return res.end(JSON.stringify({ status_code: "404" })); }
        res.writeHead(200);
        return res.end(JSON.stringify({
          order_id: orderId,
          transaction_status: "pending",
          gross_amount: `${d.total}.00`,
          status_code: "201",
        }));
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error_messages: ["tidak dikenal"] }));
    });
  });

  return new Promise((selesai) => server.listen(port, "127.0.0.1", () => selesai(server)));
}

/**
 * Mengirim kabar `settlement` ke aplikasi, ditandatangani dengan kunci uji
 * yang sama — persis seperti yang dilakukan Midtrans sungguhan beberapa
 * detik setelah orang membayar.
 */
async function lunasiSendiri(orderId, total) {
  const kunci = process.env.MIDTRANS_SERVER_KEY ?? "SB-Mid-server-KUNCIUJI0123456789";
  const basisApl = process.env.TIRUAN_APLIKASI ?? "http://127.0.0.1:3000";
  const statusCode = "200";
  const gross = `${total}.00`;
  const { createHash } = await import("node:crypto");
  const signature = createHash("sha512")
    .update(`${orderId}${statusCode}${gross}${kunci}`)
    .digest("hex");

  try {
    await fetch(`${basisApl}/api/pembayaran/kabar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: orderId,
        status_code: statusCode,
        gross_amount: gross,
        transaction_status: "settlement",
        fraud_status: "accept",
        payment_type: "qris",
        transaction_id: `TXN-${orderId}`,
        signature_key: signature,
      }),
    });
    console.log(`  ↳ ${orderId} ditandai LUNAS (pembayaran tiruan).`);
  } catch (e) {
    console.log(`  ↳ gagal melunaskan ${orderId}: ${e instanceof Error ? e.message : e}`);
  }
}

// Bisa dijalankan sendiri oleh skrip penjalan tes.
if (process.argv[1]?.endsWith("midtrans-tiruan.mjs")) {
  const port = Number(process.env.TIRUAN_PORT ?? 3211);
  await midtransTiruan(port);
  console.log(`Midtrans tiruan siap di http://127.0.0.1:${port}`);
}
