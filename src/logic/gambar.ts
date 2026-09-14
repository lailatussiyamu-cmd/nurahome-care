/**
 * Aturan ukuran foto luka.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  DIUKUR PADA APLIKASI YANG BERJALAN, 9 September 2026:                │
 * │                                                                       │
 * │  Foto disimpan apa adanya sebagai data URL di dalam basis data,       │
 * │  tanpa dikecilkan dan — di wizard pasien — tanpa batas ukuran sama    │
 * │  sekali. Satu foto kamera ponsel jadi 5,3 MB setelah base64 (+33%).   │
 * │                                                                       │
 * │  Akibatnya bukan "agak berat". Pada 85 kunjungan, jawaban server      │
 * │  melewati batas panjang string V8 (±512 MB) dan seluruh aplikasi      │
 * │  berhenti bekerja untuk admin — permanen:                             │
 * │                                                                       │
 * │      RangeError: Invalid string length                                │
 * │                                                                       │
 * │  Dengan foto kamera penuh, dindingnya di 16 kunjungan. Pada 3         │
 * │  kunjungan sehari itu kurang dari sebulan beroperasi.                 │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Berkas ini memindahkan foto ke ukuran yang masuk akal untuk keperluannya.
 * Ini penundaan, bukan penyelesaian — foto tetap tinggal di basis data.
 * Yang menyelesaikan adalah memindahkannya ke penyimpanan objek.
 */

/* ------------------------------------------------------------------ */
/* Sasaran ukuran                                                      */
/* ------------------------------------------------------------------ */

/**
 * Sisi terpanjang 1600 piksel.
 *
 * Dipilih dari keperluannya, bukan dari angka bulat. Foto luka diambil
 * dari jarak sekitar 30 cm dan lukanya biasanya 2–10 cm. Pada 1600 piksel
 * untuk bidang selebar ±30 cm, satu sentimeter luka terwakili ±53 piksel —
 * cukup untuk menilai tepi luka, warna dasar luka, dan tanda kemerahan di
 * sekitarnya. Menyimpan 4032 piksel berarti menyimpan tekstur pori kulit
 * yang tidak dipakai siapa pun untuk mengambil keputusan.
 *
 * Foto yang sudah lebih kecil dari ini TIDAK diperbesar.
 */
export const SISI_MAKS = 1600;

/**
 * Mutu JPEG 0,82.
 *
 * Di bawah 0,75 tepi luka mulai berbayang dan warna dasar luka bergeser —
 * dua hal yang justru dipakai menilai. Di atas 0,9 ukurannya naik tajam
 * tanpa perbedaan yang terlihat pada gambar setinggi 1600 piksel.
 */
export const MUTU = 0.82;

/** Batas keras per foto SETELAH dikecilkan, dalam byte data URL-nya. */
export const BATAS_FOTO_BYTE = 1_200_000; // ±1,2 MB

/** Batas jumlah foto yang boleh disertakan pasien saat mengajukan permintaan. */
export const BATAS_FOTO_PERMINTAAN = 4;

/** Jenis berkas yang diterima. */
export const JENIS_DITERIMA = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/* ------------------------------------------------------------------ */
/* Membaca data URL tanpa mendekodenya                                 */
/* ------------------------------------------------------------------ */

export type BacaanDataUrl = { jenis: string; byte: number; sah: boolean };

/**
 * Ukuran sebenarnya dihitung dari panjang base64, bukan dari panjang
 * seluruh string.
 *
 * Selisihnya bukan hal sepele: base64 menambah 33%. Memakai panjang string
 * apa adanya sebagai "ukuran berkas" akan menolak foto yang sebenarnya
 * masih di bawah batas, dan pesannya akan menyebut angka yang tidak
 * dikenali orangnya ("foto Anda 1,3 MB" padahal di galeri tertulis 1,0 MB).
 */
export function bacaDataUrl(nilai: string): BacaanDataUrl {
  const s = String(nilai ?? "");
  const cocok = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]*)$/i.exec(s);
  if (!cocok) return { jenis: "", byte: 0, sah: false };

  const jenis = cocok[1].toLowerCase();
  const b64 = cocok[2];
  const bantalan = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const byte = Math.max(0, Math.floor((b64.length * 3) / 4) - bantalan);

  return { jenis, byte, sah: byte > 0 };
}

export function mb(byte: number): string {
  return `${(byte / 1024 / 1024).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/* Penjagaan di sisi server                                            */
/* ------------------------------------------------------------------ */

/**
 * Diperiksa ULANG di server, meskipun browser sudah mengecilkannya.
 *
 * Pengecilan di browser adalah kemudahan, bukan penjagaan: siapa pun bisa
 * memanggil API-nya langsung tanpa membuka layar sama sekali. Kalau
 * batasnya hanya ada di browser, ia tidak ada.
 */
export function penghalangFoto(
  daftar: unknown,
  batasJumlah = BATAS_FOTO_PERMINTAAN
): string | null {
  if (daftar == null) return null;
  if (!Array.isArray(daftar)) return "Bentuk daftar foto tidak dikenali.";
  if (daftar.length > batasJumlah)
    return `Maksimal ${batasJumlah} foto. Anda mengirim ${daftar.length}.`;

  for (const [i, f] of daftar.entries()) {
    const b = bacaDataUrl(String(f));
    if (!b.sah) return `Foto ke-${i + 1} bukan gambar yang bisa dibaca.`;
    if (!JENIS_DITERIMA.includes(b.jenis))
      return `Foto ke-${i + 1} berjenis ${b.jenis}, yang tidak diterima.`;
    if (b.byte > BATAS_FOTO_BYTE)
      return `Foto ke-${i + 1} berukuran ${mb(b.byte)}; batasnya ${mb(BATAS_FOTO_BYTE)}. Kecilkan dulu, atau kirim ulang lewat aplikasi.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Pengecilan di peramban                                              */
/* ------------------------------------------------------------------ */

/**
 * Mengecilkan satu berkas gambar menjadi data URL JPEG.
 *
 * Berjalan di peramban (memakai canvas), jadi:
 *   - foto besar tidak pernah dikirim lewat jaringan sama sekali — penting
 *     di kuota seluler, dan itulah keadaan sebagian besar pasien;
 *   - server tidak perlu memasang pustaka pengolah gambar.
 *
 * Kalau pengecilannya gagal karena apa pun, fungsi ini MELEMPAR — bukan
 * diam-diam mengembalikan berkas aslinya. Diam-diam mengembalikan yang asli
 * berarti batas ukurannya lolos di sini lalu ditolak server, dan pasien
 * melihat penolakan tanpa tahu sebabnya.
 */
export async function kecilkanGambar(
  berkas: File,
  opsi: { sisiMaks?: number; mutu?: number } = {}
): Promise<{ dataUrl: string; byte: number; asalByte: number }> {
  const sisiMaks = opsi.sisiMaks ?? SISI_MAKS;
  const mutu = opsi.mutu ?? MUTU;

  const gambar = await muatGambar(berkas);
  const { width: w0, height: h0 } = gambar;

  const skala = Math.min(1, sisiMaks / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * skala));
  const h = Math.max(1, Math.round(h0 * skala));

  const kanvas = document.createElement("canvas");
  kanvas.width = w;
  kanvas.height = h;
  const ctx = kanvas.getContext("2d");
  if (!ctx) throw new Error("Peramban ini tidak bisa mengolah gambar.");

  /**
   * Latar putih dipasang lebih dulu.
   *
   * PNG dan HEIC bisa punya bagian tembus pandang. Digambar langsung ke
   * JPEG, bagian itu menjadi HITAM — dan foto luka dengan bercak hitam
   * besar tidak bisa dinilai.
   */
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(gambar, 0, 0, w, h);
  if ("close" in gambar && typeof gambar.close === "function") gambar.close();

  const dataUrl = kanvas.toDataURL("image/jpeg", mutu);
  const byte = bacaDataUrl(dataUrl).byte;

  /**
   * Kalau setelah dikecilkan masih di atas batas — bisa terjadi pada foto
   * yang sangat ramai — dicoba sekali lagi dengan mutu lebih rendah.
   * Lebih baik gambar yang sedikit lebih kasar daripada pasien tidak bisa
   * mengirim apa pun.
   */
  if (byte > BATAS_FOTO_BYTE) {
    const lagi = kanvas.toDataURL("image/jpeg", 0.7);
    const byteLagi = bacaDataUrl(lagi).byte;
    if (byteLagi <= BATAS_FOTO_BYTE)
      return { dataUrl: lagi, byte: byteLagi, asalByte: berkas.size };
    throw new Error("Foto ini terlalu besar meskipun sudah dikecilkan. Coba foto ulang dari jarak sedikit lebih jauh.");
  }

  return { dataUrl, byte, asalByte: berkas.size };
}

/**
 * createImageBitmap lebih hemat memori daripada <img> + object URL, dan
 * satu-satunya yang menangani HEIC di sebagian peramban ponsel. Kalau tidak
 * ada, jatuh ke <img>.
 */
async function muatGambar(berkas: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(berkas);
    } catch {
      /* jatuh ke cara di bawah */
    }
  }
  return new Promise((selesai, gagal) => {
    const alamat = URL.createObjectURL(berkas);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(alamat);
      selesai(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(alamat);
      gagal(new Error("Berkas ini tidak bisa dibaca sebagai gambar."));
    };
    img.src = alamat;
  });
}

/** Batas berkas MENTAH yang boleh dipilih, sebelum dikecilkan. */
export const BATAS_BERKAS_MENTAH = 25 * 1024 * 1024;

export function penghalangBerkas(berkas: File): string | null {
  if (!berkas.type.startsWith("image/")) return "Pilih berkas gambar (JPG, PNG, atau HEIC).";
  if (berkas.size > BATAS_BERKAS_MENTAH)
    return `Berkas ini ${mb(berkas.size)} — terlalu besar bahkan untuk dikecilkan.`;
  return null;
}
