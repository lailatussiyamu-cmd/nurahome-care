/**
 * Sambungan ke Midtrans.
 *
 * Satu-satunya berkas yang tahu bentuk API Midtrans. Sisanya berbicara
 * lewat `buatTransaksi()` dan tipe `KabarMidtrans` di bawah, supaya kalau
 * suatu hari penyedianya berganti, yang diganti berkas ini saja.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  SERVER KEY TIDAK PERNAH SAMPAI KE BROWSER.                           │
 * │  Ia dipakai untuk dua hal: memanggil API Midtrans dari server, dan    │
 * │  memeriksa tanda tangan kabar yang masuk. Keduanya di sisi server.    │
 * │  Yang boleh sampai ke browser hanya CLIENT KEY dan token Snap.        │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { rupiahBulat } from "@/logic/pembayaran";

export type ModeMidtrans = "SANDBOX" | "PRODUKSI";

export function modeMidtrans(): ModeMidtrans {
  return process.env.MIDTRANS_MODE === "PRODUKSI" ? "PRODUKSI" : "SANDBOX";
}

export function serverKey(): string {
  return process.env.MIDTRANS_SERVER_KEY ?? "";
}

export function clientKey(): string {
  return process.env.MIDTRANS_CLIENT_KEY ?? "";
}

/**
 * Apakah pembayaran sungguhan bisa dijalankan.
 *
 * Dipisah menjadi fungsi sendiri supaya layar bisa mengatakan dengan jujur
 * "pembayaran belum tersambung" — bukan menampilkan tombol Bayar yang
 * gagal tanpa penjelasan, dan tentu bukan menandai lunas seperti dulu.
 */
export function midtransSiap(): { siap: boolean; alasan: string } {
  if (!serverKey()) return { siap: false, alasan: "MIDTRANS_SERVER_KEY belum dipasang." };
  if (!clientKey()) return { siap: false, alasan: "MIDTRANS_CLIENT_KEY belum dipasang." };
  if (modeMidtrans() === "PRODUKSI" && serverKey().startsWith("SB-"))
    return {
      siap: false,
      /**
       * Kunci sandbox di mode produksi adalah kekeliruan yang paling mahal
       * di seluruh pemasangan: aplikasinya berjalan mulus, halaman
       * pembayarannya muncul, pasien "membayar" — dan tidak ada satu rupiah
       * pun yang benar-benar berpindah. Baru ketahuan saat rekening dicek.
       */
      alasan: "Mode PRODUKSI tapi memakai kunci sandbox (SB-). Tidak ada uang yang akan berpindah.",
    };
  return { siap: true, alasan: "" };
}

/**
 * Alamat API Midtrans.
 *
 * Bisa ditimpa lewat MIDTRANS_API_BASE — TAPI TIDAK PERNAH DI MODE
 * PRODUKSI. Penimpaan ini ada supaya tes bisa menjalankan jalur pembuatan
 * transaksi yang sungguhan terhadap penyedia tiruan di localhost, bukan
 * melewatinya dengan kode khusus-tes di dalam aplikasi.
 *
 * Kenapa penjagaan produksinya penting: satu variabel lingkungan yang
 * salah tersalin ke server sungguhan akan mengarahkan pembayaran pasien ke
 * alamat yang bukan Midtrans, dan aplikasinya tetap tampak berjalan
 * normal. Di mode PRODUKSI alamatnya dikunci, apa pun isi variabelnya.
 */
function basisApi(): string {
  if (modeMidtrans() !== "PRODUKSI" && process.env.MIDTRANS_API_BASE)
    return `${process.env.MIDTRANS_API_BASE}/snap/v1/transactions`;
  return modeMidtrans() === "PRODUKSI"
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
}

/** Alamat berkas snap.js untuk layar — berbeda antara sandbox dan produksi. */
export function alamatSnapJs(): string {
  return modeMidtrans() === "PRODUKSI"
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";
}

/* ------------------------------------------------------------------ */
/* Membuat transaksi                                                   */
/* ------------------------------------------------------------------ */

export type ItemMidtrans = { id: string; price: number; quantity: number; name: string };

export async function buatTransaksi(a: {
  orderId: string;
  nominal: number;
  kedaluwarsa: Date;
  pelanggan: { nama: string; telepon?: string | null; surel?: string | null };
  item: ItemMidtrans[];
}): Promise<{ ok: true; token: string; redirectUrl: string } | { ok: false; galat: string }> {
  const siap = midtransSiap();
  if (!siap.siap) return { ok: false, galat: siap.alasan };

  const nominal = rupiahBulat(a.nominal);

  /**
   * Midtrans menolak transaksi kalau jumlah `item_details` tidak sama
   * persis dengan `gross_amount`. Karena keduanya di sini berasal dari
   * perhitungan yang sama, selisih hanya bisa muncul dari pembulatan —
   * jadi selisihnya diperiksa di sini, bukan dibiarkan menjadi galat
   * "transaction_details.gross_amount is not equal to sum of item_details"
   * yang muncul di layar pasien.
   */
  const jumlahItem = a.item.reduce((j, i) => j + rupiahBulat(i.price) * i.quantity, 0);
  if (jumlahItem !== nominal)
    return {
      ok: false,
      galat: `Rincian (${jumlahItem}) tidak sama dengan total (${nominal}).`,
    };

  const badan = {
    transaction_details: { order_id: a.orderId, gross_amount: nominal },
    item_details: a.item.map((i) => ({
      id: i.id,
      price: rupiahBulat(i.price),
      quantity: i.quantity,
      /** Midtrans memotong nama item di 50 karakter; dipotong di sini supaya terkendali. */
      name: String(i.name).slice(0, 50),
    })),
    customer_details: {
      first_name: String(a.pelanggan.nama).slice(0, 60),
      phone: a.pelanggan.telepon ?? undefined,
      email: a.pelanggan.surel ?? undefined,
    },
    expiry: {
      unit: "hour",
      duration: Math.max(
        1,
        Math.round((a.kedaluwarsa.getTime() - Date.now()) / 3_600_000)
      ),
    },
    /**
     * Kartu kredit sengaja TIDAK diaktifkan.
     *
     * Untuk layanan kunjungan rumah yang nilainya ratusan ribu, QRIS dan
     * transfer virtual account sudah mencakup hampir semua pasien, biayanya
     * jauh lebih murah, dan tidak ada risiko tagihan balik (chargeback)
     * berbulan-bulan kemudian atas kunjungan yang sudah dikerjakan dan
     * honornya sudah dibayarkan ke perawat.
     */
    enabled_payments: ["qris", "gopay", "shopeepay", "bank_transfer", "permata_va", "bca_va", "bni_va", "bri_va", "other_va"],
  };

  try {
    const res = await fetch(basisApi(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // Midtrans memakai HTTP Basic: server key sebagai nama pengguna, sandi kosong.
        Authorization: `Basic ${Buffer.from(`${serverKey()}:`).toString("base64")}`,
      },
      body: JSON.stringify(badan),
      signal: AbortSignal.timeout(15_000),
    });

    const jawab = await res.json().catch(() => ({}) as any);
    if (!res.ok) {
      const pesan = Array.isArray(jawab?.error_messages)
        ? jawab.error_messages.join("; ")
        : (jawab?.status_message ?? `HTTP ${res.status}`);
      return { ok: false, galat: String(pesan) };
    }
    if (!jawab?.token) return { ok: false, galat: "Midtrans tidak mengembalikan token." };
    return { ok: true, token: String(jawab.token), redirectUrl: String(jawab.redirect_url ?? "") };
  } catch (e) {
    /**
     * Kegagalan menghubungi Midtrans TIDAK boleh terbaca sebagai
     * pembayaran gagal. Pasiennya belum mencoba membayar apa pun.
     */
    return { ok: false, galat: `Tidak bisa menghubungi Midtrans: ${(e as Error).message}` };
  }
}

/* ------------------------------------------------------------------ */
/* Bentuk kabar yang masuk                                             */
/* ------------------------------------------------------------------ */

export type KabarMidtrans = {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
  payment_type?: string;
  transaction_id?: string;
  transaction_time?: string;
};

/* ------------------------------------------------------------------ */
/* Menanyakan langsung ke Midtrans                                     */
/* ------------------------------------------------------------------ */

/**
 * Bertanya keadaan sebuah transaksi langsung ke Midtrans.
 *
 * Ini jaring pengaman untuk kabar yang tidak pernah sampai — jaringan
 * putus, server sedang di-deploy, webhook salah alamat. Tanpa ini, satu
 * kabar yang hilang berarti pasien sudah membayar tetapi kunjungannya
 * dibatalkan otomatis setelah 24 jam karena tercatat belum dibayar.
 *
 * Jawaban dari sini boleh dipercaya tanpa memeriksa tanda tangan: yang
 * bertanya adalah server, ke alamat Midtrans, dengan server key-nya
 * sendiri. Berbeda dengan webhook, yang alamatnya bisa dipanggil siapa pun.
 */
export async function tanyaStatus(
  orderId: string
): Promise<{ ok: true; kabar: KabarMidtrans } | { ok: false; galat: string }> {
  const siap = midtransSiap();
  if (!siap.siap) return { ok: false, galat: siap.alasan };

  const basis =
    modeMidtrans() !== "PRODUKSI" && process.env.MIDTRANS_API_BASE
      ? `${process.env.MIDTRANS_API_BASE}/v2`
      : modeMidtrans() === "PRODUKSI"
        ? "https://api.midtrans.com/v2"
        : "https://api.sandbox.midtrans.com/v2";

  try {
    const res = await fetch(`${basis}/${encodeURIComponent(orderId)}/status`, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${serverKey()}:`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const jawab = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, galat: `HTTP ${res.status}` };
    return { ok: true, kabar: jawab as KabarMidtrans };
  } catch (e) {
    return { ok: false, galat: (e as Error).message };
  }
}
