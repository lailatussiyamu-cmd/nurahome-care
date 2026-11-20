/**
 * Verifikasi perawat — memastikan orang yang datang ke rumah pasien memang
 * perawat yang berizin.
 *
 * Sampai berkas ini ada, nomor STR di aplikasi ini hanyalah teks. Diketik
 * sendiri oleh yang bersangkutan, ditampilkan besar-besar di profil supaya
 * pasien merasa tenang, dan tidak pernah sekali pun dicocokkan dengan
 * dokumen apa pun. `verified_status` bahkan berisi "VERIFIED" sejak data
 * contoh dibuat — tak seorang pun pernah memverifikasi apa-apa.
 *
 * Lencana "Terverifikasi" yang tidak berdasar lebih berbahaya daripada
 * tidak ada lencana sama sekali: pasien mengambil keputusan memasukkan
 * orang asing ke rumahnya berdasarkan lencana itu.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  DUA DOKUMEN, DUA FUNGSI YANG BERBEDA — sering tertukar:              │
 * │                                                                       │
 * │  STR (Surat Tanda Registrasi)                                         │
 * │      Bukti seseorang TERDAFTAR sebagai perawat. Diterbitkan konsil    │
 * │      di tingkat pusat. Sejak UU 17/2023 berlaku SEUMUR HIDUP — jadi   │
 * │      "STR masih berlaku" bukan lagi pertanyaan yang berarti.          │
 * │                                                                       │
 * │  SIP / SIPP (Surat Izin Praktik Perawat)                              │
 * │      Bukti seseorang BOLEH BERPRAKTIK, di tempat tertentu, dalam      │
 * │      masa tertentu. Diterbitkan pemerintah daerah. INI yang habis     │
 * │      masa berlakunya, dan ini yang sebenarnya menentukan boleh atau   │
 * │      tidaknya seseorang merawat pasien di Kota Malang.                │
 * │                                                                       │
 * │  Aplikasi sebelumnya hanya menyimpan STR. Artinya menyimpan yang      │
 * │  tidak pernah kedaluwarsa, dan tidak menyimpan yang bisa.             │
 * └──────────────────────────────────────────────────────────────────────┘
 */

/* ------------------------------------------------------------------ */
/* Status                                                             */
/* ------------------------------------------------------------------ */

export type StatusVerifikasi =
  | "BELUM_DIAJUKAN"
  | "MENUNGGU_TINJAUAN"
  | "PERLU_PERBAIKAN"
  | "TERVERIFIKASI"
  | "KEDALUWARSA"
  | "DIBEKUKAN";

export const NAMA_VERIFIKASI: Record<StatusVerifikasi, string> = {
  BELUM_DIAJUKAN: "Belum mengajukan",
  MENUNGGU_TINJAUAN: "Menunggu tinjauan admin",
  PERLU_PERBAIKAN: "Perlu diperbaiki",
  TERVERIFIKASI: "Terverifikasi",
  KEDALUWARSA: "SIP kedaluwarsa",
  DIBEKUKAN: "Dibekukan",
};

/**
 * Warna nada untuk layar. Sengaja hanya tiga: hijau berarti boleh bekerja,
 * kuning berarti sedang diproses, merah berarti tidak boleh bekerja.
 * Perawat tidak perlu menghafal enam warna untuk tahu apakah ia boleh
 * menerima kunjungan hari ini.
 */
export const NADA_VERIFIKASI: Record<StatusVerifikasi, "baik" | "tunggu" | "buruk"> = {
  BELUM_DIAJUKAN: "buruk",
  MENUNGGU_TINJAUAN: "tunggu",
  PERLU_PERBAIKAN: "tunggu",
  TERVERIFIKASI: "baik",
  KEDALUWARSA: "buruk",
  DIBEKUKAN: "buruk",
};

/* ------------------------------------------------------------------ */
/* Berkas yang diminta                                                 */
/* ------------------------------------------------------------------ */

export type JenisBerkas = "STR" | "SIP" | "KTP" | "FOTO" | "IJAZAH";

export const BERKAS_DIMINTA: {
  jenis: JenisBerkas;
  label: string;
  wajib: boolean;
  penjelasan: string;
}[] = [
  {
    jenis: "STR",
    label: "STR (Surat Tanda Registrasi)",
    wajib: true,
    penjelasan: "Bukti terdaftar sebagai perawat. Berlaku seumur hidup sejak UU 17/2023.",
  },
  {
    jenis: "SIP",
    label: "SIP / SIPP (Surat Izin Praktik)",
    wajib: true,
    penjelasan:
      "Izin berpraktik dari pemerintah daerah. Ada masa berlakunya — inilah yang menentukan Anda boleh menerima kunjungan.",
  },
  {
    jenis: "KTP",
    label: "KTP",
    wajib: true,
    penjelasan: "Untuk memastikan nama di STR dan SIP memang nama Anda.",
  },
  {
    jenis: "FOTO",
    label: "Foto wajah terbaru",
    wajib: true,
    penjelasan:
      "Ditunjukkan kepada pasien yang Anda kunjungi, supaya mereka bisa mengenali Anda di depan pintu. Admin mencocokkannya dengan foto KTP. Wajah terlihat jelas, tanpa masker atau kacamata hitam.",
  },
  {
    jenis: "IJAZAH",
    label: "Ijazah keperawatan",
    wajib: false,
    penjelasan: "Tidak wajib, tapi mempercepat tinjauan bila ada perbedaan penulisan nama.",
  },
];

/* ------------------------------------------------------------------ */
/* Bentuk nomor                                                        */
/* ------------------------------------------------------------------ */

/**
 * Pemeriksaan bentuk, BUKAN pemeriksaan keaslian.
 *
 * Ini hanya menangkap salah ketik yang kentara — kolom kosong, tiga digit,
 * ada hurufnya. Nomor yang lolos di sini belum berarti benar; yang
 * membuktikan benar tetap orang yang membuka dokumennya. Perbedaan itu
 * sengaja ditulis di sini supaya tidak ada yang mengira fungsi ini
 * "memverifikasi STR".
 */
export function bentukSTRWajar(nomor: string): boolean {
  const n = String(nomor ?? "").replace(/\s/g, "");
  return /^[0-9]{10,20}$/.test(n);
}

export function bentukSIPWajar(nomor: string): boolean {
  const n = String(nomor ?? "").trim();
  return n.length >= 6 && n.length <= 60;
}

/* ------------------------------------------------------------------ */
/* Masa berlaku SIP                                                    */
/* ------------------------------------------------------------------ */

/** Sejak berapa hari sebelum habis, perawat dan admin mulai diingatkan. */
export const PERINGATAN_SIP_HARI = 60;

export function sisaHariSIP(
  berlakuSampai: string | null | undefined,
  sekarang = new Date()
): number | null {
  const t = String(berlakuSampai ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const habis = new Date(`${t}T23:59:59`);
  if (isNaN(habis.getTime())) return null;
  return Math.ceil((habis.getTime() - sekarang.getTime()) / 86_400_000);
}

export function sipKedaluwarsa(berlakuSampai: string | null | undefined, sekarang = new Date()) {
  const sisa = sisaHariSIP(berlakuSampai, sekarang);
  return sisa != null && sisa < 0;
}

/* ------------------------------------------------------------------ */
/* Pertanyaan yang sebenarnya: boleh menerima kunjungan atau tidak     */
/* ------------------------------------------------------------------ */

export type Perawat = {
  verifiedStatus?: string | null;
  sipBerlakuSampai?: string | null;
  strNumber?: string | null;
  sipNumber?: string | null;
};

/**
 * Satu fungsi, dipakai UI maupun API.
 *
 * Kalau layar dan server menjawab pertanyaan ini dengan kodenya
 * masing-masing, cepat atau lambat keduanya berbeda — dan yang berbeda
 * biasanya sisi server yang lebih longgar. Maka jawabannya cuma ada di
 * sini.
 *
 * Perhatikan urutannya: SIP yang kedaluwarsa mengalahkan status
 * "TERVERIFIKASI" yang tersimpan. Verifikasi kemarin tidak membuat izin
 * yang habis hari ini menjadi berlaku.
 */
export function bolehMenerimaKunjungan(
  p: Perawat | null | undefined,
  sekarang = new Date()
): { boleh: boolean; alasan: string; status: StatusVerifikasi } {
  if (!p)
    return { boleh: false, alasan: "Data perawat tidak ditemukan.", status: "BELUM_DIAJUKAN" };

  const status = (p.verifiedStatus ?? "BELUM_DIAJUKAN") as StatusVerifikasi;

  if (status === "DIBEKUKAN")
    return { boleh: false, alasan: "Akun perawat sedang dibekukan admin.", status };

  if (sipKedaluwarsa(p.sipBerlakuSampai, sekarang))
    return {
      boleh: false,
      alasan: "SIP sudah lewat masa berlakunya. Unggah SIP yang baru untuk ditinjau admin.",
      status: "KEDALUWARSA",
    };

  if (status !== "TERVERIFIKASI")
    return {
      boleh: false,
      /**
       * Alasannya saja, tanpa mengulang "Belum boleh menerima kunjungan".
       * Layar sudah mengatakan kalimat itu sebagai judul; kalimat yang
       * mengulangi judulnya sendiri terbaca seperti kesalahan — dan memang
       * begitu tampilnya di tangkapan layar: "Belum boleh menerima
       * kunjungan. Belum boleh menerima kunjungan — Menunggu tinjauan
       * admin."
       */
      alasan:
        status === "MENUNGGU_TINJAUAN"
          ? "Berkas Anda sedang ditinjau admin."
          : status === "PERLU_PERBAIKAN"
            ? "Ada yang perlu diperbaiki pada berkas Anda — lihat catatan admin di bawah."
            : "Unggah STR dan SIP Anda untuk ditinjau admin.",
      status,
    };

  return { boleh: true, alasan: "", status };
}

/* ------------------------------------------------------------------ */
/* Penghalang saat perawat mengajukan berkas                           */
/* ------------------------------------------------------------------ */

export function penghalangAjuVerifikasi(a: {
  strNumber?: string | null;
  sipNumber?: string | null;
  sipBerlakuSampai?: string | null;
  berkas?: { jenis: string }[];
}): string | null {
  if (!bentukSTRWajar(a.strNumber ?? ""))
    return "Nomor STR belum benar — isi angkanya saja, 10–20 digit.";
  if (!bentukSIPWajar(a.sipNumber ?? "")) return "Nomor SIP / SIPP belum diisi.";

  const t = String(a.sipBerlakuSampai ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "Tanggal berakhir SIP belum diisi.";
  if (sipKedaluwarsa(t)) return "SIP yang diunggah sudah lewat masa berlakunya.";

  const ada = new Set((a.berkas ?? []).map((b) => b.jenis));
  const kurang = BERKAS_DIMINTA.filter((b) => b.wajib && !ada.has(b.jenis));
  if (kurang.length) return `Belum diunggah: ${kurang.map((k) => k.label).join(", ")}.`;

  return null;
}

/**
 * Penghalang saat ADMIN memutuskan.
 *
 * Menolak dan membekukan wajib beralasan. Alasannya bukan formalitas: yang
 * membacanya adalah perawat yang penghasilannya berhenti hari itu, dan
 * "ditolak" tanpa kalimat tidak memberitahunya apa yang harus diperbaiki.
 * Sama seperti aturan pada penyortiran kritik pasien — keputusan yang
 * merugikan seseorang harus bisa dijelaskan.
 */
export function penghalangPutusVerifikasi(a: {
  keputusan: string;
  alasan?: string | null;
  diperiksaDi?: string | null;
}): string | null {
  const sah = ["TERVERIFIKASI", "PERLU_PERBAIKAN", "DIBEKUKAN"];
  if (!sah.includes(a.keputusan)) return "Keputusan tidak dikenal.";

  const alasan = String(a.alasan ?? "").trim();
  if (a.keputusan !== "TERVERIFIKASI" && alasan.length < 10)
    return "Tulis alasannya minimal 10 karakter — perawat berhak tahu apa yang harus diperbaiki.";

  /**
   * Untuk MELULUSKAN, admin harus mencatat di mana ia memeriksa nomornya.
   *
   * Tanpa kolom ini, "terverifikasi" hanya berarti seseorang menekan tombol
   * hijau. Kolom ini memaksa pemeriksaannya benar-benar terjadi dan
   * meninggalkan jejak yang bisa ditunjukkan kalau suatu saat ada perkara.
   */
  if (a.keputusan === "TERVERIFIKASI" && String(a.diperiksaDi ?? "").trim().length < 4)
    return "Isi di mana nomor STR/SIP dicocokkan (mis. portal KTKI, surat Dinkes, telepon ke Dinkes).";

  return null;
}

/**
 * Tempat pencocokan yang lazim.
 *
 * SENGAJA TIDAK ADA PEMERIKSAAN OTOMATIS KE REGISTER PUSAT. Portal konsil
 * dibuat untuk dibaca orang, bukan untuk dipanggil program; tidak ada
 * layanan resmi yang bisa dipanggil aplikasi seperti ini. Menuliskan
 * "verifikasi otomatis" untuk sesuatu yang sebenarnya menebak-nebak isi
 * halaman web akan menghasilkan lencana yang salah persis seperti sekarang,
 * hanya dengan lapisan kode di atasnya. Yang jujur: seseorang benar-benar
 * memeriksa, dan aplikasi mencatat siapa, kapan, dan di mana.
 */
export const TEMPAT_PERIKSA = [
  "Portal KTKI / SATUSEHAT SDMK",
  "Surat/berkas SIP dari Dinkes",
  "Telepon ke Dinas Kesehatan",
  "Verifikasi tatap muka dengan dokumen asli",
];

/* ------------------------------------------------------------------ */
/* Yang ditampilkan ke pasien                                          */
/* ------------------------------------------------------------------ */

/**
 * Yang boleh dilihat pasien tentang perawatnya.
 *
 * Nomor SIP dipendekkan, dan nomor STR hanya dinyatakan ADA, tidak
 * ditampilkan utuh. Alasannya: nomor izin praktik lengkap yang terpampang
 * di halaman publik adalah bahan yang rapi untuk memalsukan identitas
 * perawat itu di tempat lain. Yang pasien butuhkan adalah kepastian bahwa
 * izinnya sudah diperiksa dan kapan diperiksanya — bukan nomornya.
 */
export function tampilanUntukPasien(p: {
  verifiedStatus?: string | null;
  sipNumber?: string | null;
  sipDiterbitkanOleh?: string | null;
  verifiedAt?: Date | string | null;
  sipBerlakuSampai?: string | null;
}) {
  const hasil = bolehMenerimaKunjungan(p as Perawat);

  /**
   * Nomor SIP TIDAK ditampilkan sama sekali ke pasien, bahkan disamarkan.
   *
   * Percobaan pertama menampilkan `503/••••026`. Tidak ada gunanya: awalan
   * "503/" sama untuk setiap SIP yang diterbitkan Dinkes Kota Malang, dan
   * tiga angka terakhirnya adalah tahunnya. Jadi yang tersamar justru
   * bagian yang membedakan, dan yang tampil justru bagian yang sama pada
   * semua orang — samaran yang tidak menyembunyikan apa pun sambil tetap
   * memberi bahan kepada yang ingin memalsukan.
   *
   * Yang pasien butuhkan bukan nomornya, melainkan: sudah diperiksa,
   * diperiksa kapan, dan izinnya dari mana.
   */
  return {
    terverifikasi: hasil.boleh,
    label: hasil.boleh ? "Izin praktik sudah diperiksa" : NAMA_VERIFIKASI[hasil.status],
    penerbitIzin: p.sipDiterbitkanOleh ?? null,
    diperiksaPada: tanggalISO(p.verifiedAt),
  };
}

/**
 * `String(new Date()).slice(0,10)` menghasilkan "Sat Aug 01" — bukan
 * tanggal, dan tanpa tahun. Ketahuan saat memeriksa jawaban API sungguhan,
 * bukan saat membaca kode.
 */
function tanggalISO(t: Date | string | null | undefined): string | null {
  if (!t) return null;
  const d = t instanceof Date ? t : new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
