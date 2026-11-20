# Tes

```bash
npm run uji
```

Satu perintah: basis data uji dibuat ulang dari kosong, migrasi dijalankan,
server dinyalakan, penyedia pembayaran dan model tiruan dinyalakan, 161 tes
dijalankan, semuanya dibereskan. Sekitar satu menit.

Butuh PostgreSQL (`psql` di PATH) dan Linux, macOS, atau WSL. Skripnya
memakai `setsid` dan `/proc`, jadi tidak jalan di Git Bash Windows biasa.

**Di GitHub, tes ini berjalan sendiri** di setiap push ke `main` dan setiap
pull request (`.github/workflows/uji.yml`): typecheck, lint, pemeriksaan aktor
& status, lalu skrip yang sama dengan PostgreSQL 16 sekali pakai. Tidak ada
secret yang dipakai; semua kunci di skrip uji kunci palsu.

---

## Kenapa tesnya di batas HTTP, bukan memanggil fungsi

Aplikasi ini akan dirombak. `api/platform` masih satu berkas 1.500 baris
berisi 20-an aksi berderet, dan foto luka masih disimpan sebagai data URL di
dalam basis data. Dua-duanya harus berubah.

Tes yang menempel ke isi kode ikut mati saat kodenya dirombak — dan yang
terjadi berikutnya bukan tesnya diperbaiki, melainkan tesnya dihapus.

Kalimat **"pasien A tidak bisa menandai pemesanan pasien B lunas"** tetap
benar apa pun bentuk kodenya: satu berkas, dua puluh berkas, penyedia
pembayaran diganti. Justru tes seperti itu yang dibutuhkan sebagai pegangan
**saat** merombak.

Jadi tidak satu pun tes di sini mengimpor kode aplikasi. Semuanya berbicara
lewat HTTP, persis seperti browser pasien.

---

## Ini bukan tes buatan

Setiap tes di sini adalah serangan yang **sungguh-sungguh pernah dijalankan**
ke aplikasi ini, dan sebagian besar dulu **berhasil**:

| Dulu berhasil | Sekarang |
|---|---|
| `curl /api/platform` mengembalikan seluruh basis data ke siapa pun | tamu hanya menerima katalog layanan |
| `{"actorRole":"ADMIN"}` di badan permintaan menjadikan siapa pun admin | 401 / 403 |
| Pasien mengirim pesan yang tampil sebagai dari perawat | tersimpan sebagai dirinya |
| Menekan "Bayar" menandai lunas dari browser | aksinya dicabut, 410 |
| Perawat mana pun menulis catatan klinis atas nama perawat lain | 403 |
| Lencana "Terverifikasi" tanpa ada yang pernah memverifikasi | perawat belum lolos tidak melihat satu pun permintaan |

---

## Isinya

| Berkas | Menjaga |
|---|---|
| `identitas.test.mjs` | masuk, penguncian, cookie, pemalsuan peran, siapa boleh melihat apa, kepemilikan pemesanan |
| `pembayaran.test.mjs` | tanda tangan webhook, nominal, kabar ganda & tertinggal, browser tidak bisa melunaskan |
| `alur.test.mjs` | urutan status tidak bisa dilangkahi, verifikasi izin praktik, penyortiran kritik |
| `gambar.test.mjs` | batas ukuran foto, jenis berkas, dan `Cache-Control: no-store` |
| `celah.test.mjs` | celah audit 20 Nov 2026: uang masuk setelah batal atau dua kali, batal setelah lunas, perawat yang izinnya dicabut, tiba tanpa foto, foto bukti di luar waktunya, tanda bahaya dari isi pengkajian, rebutan dua perawat, tombol bantuan perawat |

Penyedia pembayaran tiruan (`midtrans-tiruan.mjs`) menjawab seperti Snap
API di localhost, dengan kunci uji. Jalur `buatTransaksi()` yang sungguhan
ikut teruji — termasuk pemeriksaan bahwa jumlah rincian sama dengan total.
Tidak ada kode khusus-tes di dalam aplikasi; yang ada hanya penimpaan
alamat API lewat `MIDTRANS_API_BASE`, **dan itu diabaikan di mode
PRODUKSI**.

---

## Apakah tesnya benar-benar menangkap sesuatu

Tes yang tidak pernah gagal tidak membuktikan apa pun. Dua lubang sengaja
dibuka kembali, lalu tesnya dijalankan:

**Lubang 1 — webhook berhenti memeriksa tanda tangan** (`const sah = true`):

```
61 tes → 7 GAGAL
  ✖ kabar palsu ditolak — tanpa tanda tangan sama sekali
  ✖ kabar palsu ditolak — tanda tangan asal-asalan
  ✖ kabar palsu ditolak — tanda tangan kosong
  ✖ kabar palsu ditolak — tanda tangan dari kunci tebakan
  ✖ kabar palsu ditolak — tanda tangan sah tapi untuk nominal lain
  ✖ kabar palsu tetap dicatat, supaya percobaannya terlihat
  ✖ aksi BAYAR lama sudah dicabut — browser tidak bisa menandai lunas
```

**Lubang 2 — tamu kembali menerima seluruh basis data**:

```
61 tes → 1 GAGAL
  ✖ tamu tidak menerima satu pun baris milik pasien
```

Setelah dipulihkan: 61 lulus, 0 gagal.

---

## Galat yang ditemukan justru saat menyiapkan tesnya

**1. Server dev yang tertinggal membuat setengah tes merah tanpa ada yang
rusak.** Next 16 menolak dua server dev di folder yang sama, tapi
**meneruskan** permintaan ke yang sudah berjalan. Akibatnya tes tetap
dijawab — oleh server lain, dengan variabel lingkungan lain, sehingga
pembayaran diarahkan ke Midtrans sungguhan dan gagal. Sekarang skripnya
mematikan servernya per kelompok proses, dan menolak berjalan kalau masih
ada server lain di folder ini.

**2. Satu tes menuntut kode status yang salah.** Tes menuntut `409` untuk
lompatan urutan, padahal aplikasi menjawab `403` lebih dulu — penjagaan
kepemilikan berjalan sebelum penjagaan urutan. Dua-duanya menolak; mana
yang lebih dulu adalah urusan dalam kode. Tesnya diperbaiki untuk menegaskan
**keadaannya** (statusnya tidak bergeser), bukan kode statusnya — kalau
dikunci, merapikan kode nanti akan memerahkan tes tanpa ada yang rusak.

**3. Tes yang menghitung data milik semua orang berkedip.** `node --test`
menjalankan berkas tes secara paralel. Tes "kabar yang sama tiga kali hanya
berakibat sekali" dulu menghitung *semua* pemberitahuan admin, padahal berkas
lain (Woundex MERAH, misalnya) ikut menambahnya di saat yang sama. Hasilnya
hijau di satu putaran CI dan merah (261 ≠ 262) di putaran berikutnya untuk
kode yang sama. Sekarang tes itu hanya menghitung pemberitahuan yang menyebut
kode pesanannya sendiri. Aturan umumnya: tes hanya boleh menghitung data
yang ia buat sendiri.

---

## Yang belum diuji

- **Tampilan.** Semua tes di sini menguji API. Layar diperiksa dengan tangan
  (peramban sungguhan, 360/390/768/1280px).
- **Tugas terjadwal.** Diuji manual dengan data yang sengaja dibuat
  kedaluwarsa; belum masuk berkas tes.
- **Beban.** Belum pernah diuji dengan banyak permintaan sekaligus.
- **Midtrans sungguhan.** Yang diuji penyedia tiruan. Sekali di sandbox
  Midtrans dengan kunci asli tetap perlu dicoba sebelum menerima uang.
