# NuraHome Care

Platform perawatan luka dan sirkumsisi di rumah untuk **Kota Malang, Kota
Batu, Singosari, dan Kepanjen**.

Pasien mengirim foto lukanya, perawat bersertifikat menilai dan mengirim
penawaran, pasien menyetujui dan membayar, perawat datang, dan seluruhnya
tercatat sebagai rekam medis yang sah.

Next.js 16 · PostgreSQL · Drizzle ORM.

---

## Menjalankan di komputer sendiri

```bash
npm install
npm run coba
```

Buka **http://localhost:3000**. Perintahnya membuat basis data coba-coba
sendiri, menjalankan migrasi, dan mencetak akun untuk masuk.

Langkah demi langkah beserta daftar periksa apa saja yang harus dicoba:
**[PANDUAN-COBA.md](PANDUAN-COBA.md)**.

## Tes

```bash
npm run uji
```

138 tes lewat HTTP, sekitar satu menit. Basis data uji dibuat ulang dari
kosong setiap kali. Penjelasannya: **[UJI.md](UJI.md)**.

---

## Dokumen

| Berkas | Isi |
|---|---|
| [PANDUAN-COBA.md](PANDUAN-COBA.md) | Cara mencoba sendiri + daftar periksa 8 bagian |
| [UJI.md](UJI.md) | Tes otomatis — apa yang dijaganya dan apa yang tidak |
| [KEAMANAN.md](KEAMANAN.md) | Sesi, kata sandi, peran, dan apa yang boleh dilihat siapa |
| [PEMBAYARAN.md](PEMBAYARAN.md) | Midtrans, kabar pembayaran, dan bagi hasil 70/30 |
| [ASISTEN.md](ASISTEN.md) | Asisten tanya-jawab dan lapisan model AI yang opsional |
| [CADANGAN.md](CADANGAN.md) | Cadangan dan pemulihan basis data |
| [TUGAS-TERJADWAL.md](TUGAS-TERJADWAL.md) | Pekerjaan yang dijalankan server sendiri |
| [TINJAUAN-LEGAL-KEAMANAN.md](TINJAUAN-LEGAL-KEAMANAN.md) | Kewajiban hukum dan apa yang belum beres |

---

## Tiga hal yang menentukan bentuk aplikasi ini

**Rekam medis tidak boleh mengarang.** Formulir catatan klinis mulai kosong,
skala nyeri wajib diisi (0 adalah jawaban yang sah), dan penyusun catatan
hanya memindahkan kalimat perawat sendiri. Permenkes 24/2022 Pasal 26:
rekam medis memuat apa yang benar-benar dikerjakan.

**Yang menyatakan pembayaran lunas hanya kabar bertanda tangan dari
Midtrans** — bukan browser, bukan tombol. Status lunas itulah yang membuat
perawat berangkat dan membeli bahan dengan uangnya sendiri.

**Tanda bahaya diputuskan daftar kata di server, bukan model AI.** Model
boleh menambah, tidak pernah mencabut. Keputusan apakah seseorang perlu ke
IGD tidak boleh berubah-ubah untuk kalimat yang sama.

---

## Sebelum pasien sungguhan pertama

Lihat bagian A di [TINJAUAN-LEGAL-KEAMANAN.md](TINJAUAN-LEGAL-KEAMANAN.md).
Yang belum beres ditulis di sana apa adanya, termasuk yang sengaja
diputuskan untuk tidak diadakan.

Foto luka dan rekam medis disimpan **25 tahun sejak kunjungan terakhir
pasien** (Permenkes 24/2022 Pasal 39 ayat 1), di server di dalam negeri
(Pasal 22).
