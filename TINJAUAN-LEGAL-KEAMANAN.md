# NuraHome Care — Tinjauan Aspek Legal & Keamanan

Disusun 7 September 2026, setelah alur baru (permintaan → penawaran → persetujuan → pembayaran → kunjungan → laporan) dijalankan dan diuji.
Diperbarui 8 September 2026, setelah otentikasi, penyaringan di sisi server, verifikasi izin praktik, cadangan basis data, dan pembayaran sungguhan dikerjakan — semuanya diuji dengan cara menyerang aplikasinya sendiri.
Diperbarui 9 September 2026: serangan-serangan itu sekarang tersimpan sebagai **61 tes yang bisa dijalankan ulang** (`npm run uji`), dan skema dipasang lewat **migrasi**, bukan `push --force`. Lihat `UJI.md`.

> **Ini bukan nasihat hukum.** Saya menyusunnya dari sumber terbuka yang dicantumkan di bawah. Sebelum aplikasi ini menerima pasien sungguhan, mintalah pengacara atau bagian hukum meninjaunya — terutama bagian kewenangan perawat dan penanganan foto luka.

---

## 1. Yang menghentikan peluncuran

### 1.1 ~~Tidak ada otentikasi sama sekali~~ — **SELESAI 8 September 2026**

**Keadaan sebelumnya.** `GET /api/platform` mengembalikan **isi setiap tabel** kepada browser mana pun, tanpa login, tanpa token, tanpa apa pun:

| Yang terkirim ke setiap browser | Isi |
|---|---|
| `taskPhotos` | foto luka pasien |
| `consents` | teks persetujuan lengkap + nama penanda tangan |
| `users` | nama, nomor telepon, alergi, riwayat penyakit |
| `addresses` | alamat rumah + koordinat GPS |
| `clinicalNotes`, `visitReports` | catatan klinis dan laporan tindakan |
| `quoteItems` | rincian tarif semua pasien |

Penyaringan per-peran bekerja **di browser**, setelah semuanya terkirim.

Lebih buruk lagi — ini baru ketahuan saat mengerjakan perbaikannya: **setiap penjagaan di API membaca peran pemakai dari badan permintaan.**

```js
const { actorRole } = body;
if (actorRole !== "ADMIN") return 403;
```

Yang mengisi `actorRole` adalah browser. Penjagaan itu bertanya kepada penyerang apakah ia penyerang, dan jawabannya selalu dipercaya. Satu baris di Developer Tools cukup untuk menjadi admin.

Menurut **UU 27/2022 Pasal 4 ayat (2)**, data kesehatan termasuk data pribadi yang bersifat spesifik. Menyiarkannya tanpa dasar pemrosesan yang sah bukan sekadar cacat teknis — itu pelanggaran.

**Yang sekarang berlaku:**

| Bagian | Isi |
|---|---|
| Kata sandi | scrypt (N=2¹⁵), parameter ikut disimpan supaya bisa dinaikkan tanpa mengunci semua orang keluar |
| Sesi | baris di tabel `sessions`; yang disimpan hanya **sidik jari SHA-256** token-nya, bukan token-nya |
| Cookie | `HttpOnly`, `SameSite=Lax`, `Secure` di produksi |
| Umur sesi | dua batas — diam & mutlak — berbeda menurut peran: admin 2 j / 12 j, perawat 12 j / 7 hari, pasien 7 hari / 30 hari |
| Penguncian | bertingkat (5×→1 mnt, 8×→5 mnt, 11×→30 mnt, 15×→2 j), bukan blokir permanen yang bisa dipakai mengunci akun orang lain |
| Batas per-IP | 30 kegagalan / 15 menit, menahan satu sandi umum yang dicoba ke ribuan nomor |
| Penyaringan | pindah ke server — `src/server/tampilan.ts` |
| Identitas aksi | dari cookie sesi — `src/server/aktor.ts`; `actorRole` dari badan permintaan tidak lagi dibaca di mana pun |
| Penjaga | `skrip/periksa-aktor.mjs` menggagalkan `npm run build` kalau polanya kembali |

**Hasil menyerang aplikasinya sendiri** (semuanya dijalankan sungguhan, bukan dibaca dari kode):

| Percobaan | Hasil |
|---|---|
| `GET /api/platform` tanpa akun | hanya katalog layanan, kartu perawat, dan testimoni yang sudah ditayangkan — **0 pemesanan, 0 foto, 0 baris `users`** |
| `POST` mengaku `"actorRole":"ADMIN"` tanpa masuk | `401` |
| Pasien mengaku admin lewat `actorRole` | `403` |
| Pasien menulis catatan klinis dengan `actorRole:"PROVIDER"` | `403` |
| Pasien mengirim pesan mengatasnamakan perawat | tersimpan sebagai dirinya sendiri, peran `PATIENT` |
| Pasien membuat pemesanan atas nama orang lain | pemiliknya diambil dari sesi |
| Pasien lain membayar / membatalkan / menestimoni kunjungan orang lain | `403` × 4 |
| Perawat menutup kunjungan perawat lain | `403` |
| Pasien baru mendaftar lalu memuat data | 0 baris milik orang lain, hanya dirinya sendiri |
| Nomor terdaftar vs tidak terdaftar saat gagal masuk | kalimat sama, **206 ms vs 203 ms** — tidak bisa dipakai memeriksa siapa pelanggan di sini |
| 6× salah sandi | terkunci; sandi benar pun ditolak selama masa kunci |
| Ganti kata sandi | perangkat lain dikeluarkan seketika, perangkat yang menggantinya tetap masuk |
| Admin membekukan perawat | sesinya mati pada permintaan berikutnya |

Yang perawat lihat di antrean permintaan bersama juga dipangkas: **inisial saja, kecamatan saja** — nama lengkap, alamat, dan nomor telepon baru terbuka setelah ia benar-benar mengambil kunjungannya. Satu permintaan dilihat semua perawat yang bertugas; mengirim alamat rumah pasien ke semuanya berarti membagikannya kepada orang-orang yang tidak akan pernah datang ke sana.

**Yang masih tersisa dari butir ini:** foto luka masih dikirim sebagai data URL di dalam JSON. Sebaiknya pindah ke penyimpanan terpisah dengan tautan bertanda tangan yang kedaluwarsa — sekarang sudah hanya sampai ke orang yang berhak, tapi ukurannya membuat setiap pemuatan halaman berat.

### 1.4 ~~Lencana "Terverifikasi" tanpa dasar~~ — **SELESAI 8 September 2026**

**Keadaan sebelumnya.** Nomor STR hanya teks yang diketik sendiri, ditampilkan besar-besar dengan lencana "Terverifikasi", dan tidak pernah sekali pun dicocokkan dengan dokumen apa pun. Kolom `verified_status` bahkan bernilai `"VERIFIED"` sejak data contoh dibuat — tak seorang pun pernah memverifikasi apa-apa. Pasien memutuskan memasukkan orang asing ke rumahnya berdasarkan lencana itu.

Ada satu kesalahan pemahaman yang ikut diperbaiki: aplikasi hanya menyimpan **STR**, dan tidak menyimpan **SIP** sama sekali.

- **STR** membuktikan seseorang *terdaftar* sebagai perawat. Sejak **UU 17/2023** berlaku **seumur hidup** — jadi "STR masih berlaku" bukan lagi pertanyaan yang berarti.
- **SIP / SIPP** membuktikan ia *boleh berpraktik*, di tempat tertentu, dalam masa tertentu, diterbitkan pemerintah daerah. **Inilah** yang menentukan boleh-tidaknya seseorang merawat pasien di Kota Malang.

Aplikasi lama menyimpan yang tidak pernah kedaluwarsa, dan tidak menyimpan yang bisa.

**Yang sekarang berlaku:**

- Nilai bawaan `verified_status` adalah `BELUM_DIAJUKAN`, bukan `TERVERIFIKASI`.
- Perawat mengunggah STR, SIP, dan KTP; dokumennya masuk tabel `provider_documents` sebagai **riwayat** — SIP lama ditandai *diganti*, tidak dihapus, supaya pertanyaan "apakah izinnya berlaku pada tanggal kunjungan itu" masih bisa dijawab bertahun-tahun kemudian.
- **Meluluskan wajib menyebutkan di mana nomornya dicocokkan** (portal KTKI, surat Dinkes, telepon, tatap muka). Tanpa kolom itu "terverifikasi" hanya berarti seseorang menekan tombol hijau.
- **Menolak dan membekukan wajib beralasan** minimal 10 karakter — yang membacanya adalah perawat yang penghasilannya berhenti hari itu.
- Setiap keputusan tersimpan di `verification_reviews`: siapa, kapan, atas dasar apa.
- **SIP yang kedaluwarsa mengalahkan status "TERVERIFIKASI"** yang tersimpan. Verifikasi kemarin tidak membuat izin yang habis hari ini menjadi berlaku.
- Peringatan mulai **60 hari** sebelum SIP habis, kepada perawat dan admin — mengurus perpanjangan butuh berminggu-minggu.
- Perawat yang belum lolos **tidak menerima satu pun permintaan**, dan tidak melihat satu pun foto luka di antrean. Penjagaannya di server, bukan hanya tombol yang gagal ditekan.
- Membekukan **langsung mencabut semua sesinya**.
- Nomor SIP **tidak** ditampilkan ke pasien, bahkan tersamar. Percobaan pertama menampilkan `503/••••026`; ternyata awalan "503/" sama untuk setiap SIP terbitan Dinkes Kota Malang dan tiga angka terakhirnya adalah tahunnya — yang tersamar justru bagian yang membedakan. Yang pasien lihat: sudah diperiksa, kapan, dan izinnya dari mana.

**Tidak ada pemeriksaan otomatis ke register pusat, dan itu disengaja.** Portal konsil dibuat untuk dibaca orang, bukan dipanggil program; tidak ada layanan resmi yang bisa dipanggil aplikasi seperti ini. Menuliskan "verifikasi otomatis" untuk sesuatu yang sebenarnya menebak isi halaman web akan menghasilkan lencana yang salah persis seperti sebelumnya, hanya dengan lapisan kode di atasnya. Yang jujur: seseorang benar-benar memeriksa, dan aplikasi mencatat siapa, kapan, dan di mana.

### 1.6 Foto luka di dalam basis data — **SEBAGIAN DIPERBAIKI 9 September 2026**

**Diukur pada aplikasi yang berjalan**, dengan foto seukuran kamera ponsel sungguhan:

| Kunjungan | Basis data | Jawaban ke admin | Waktu |
|---|---|---|---|
| 10 | 71 MB | 60 MB | 2,9 dtk |
| 50 | 322 MB | 301 MB | 12,7 dtk |
| 80 | 512 MB | 482 MB | 17,3 dtk |
| **85** | 542 MB | **HTTP 500** | **gagal permanen** |

Pada 85 kunjungan, jawaban server melewati batas panjang string V8 (±512 MB) dan aplikasi **berhenti bekerja permanen** untuk admin: `RangeError: Invalid string length`. Bukan lambat — mustahil. 98,4% isi basis data adalah foto.

Wizard pasien saat itu **tidak punya batas ukuran sama sekali**: satu kiriman berisi 4 foto kamera penuh (21,3 MB) diterima HTTP 200 tanpa keluhan. Dengan foto apa adanya, dindingnya di **16 kunjungan** — kurang dari sebulan pada 3 kunjungan sehari.

Ditemukan juga: jawaban yang membawa foto luka dikirim **tanpa satu pun kepala cache**, sehingga peramban boleh menyimpannya di cache disk menurut perkiraannya sendiri. Untuk ponsel keluarga yang dipakai bergantian dan ponsel perawat yang suatu saat dijual atau diservis, itu kebocoran yang nyata.

**Yang sudah dikerjakan (fase 1 — penundaan, bukan penyelesaian):**

| Perbaikan | Akibat terukur |
|---|---|
| Foto dikecilkan di ponsel ke sisi terpanjang 1600 px, JPEG q0,82 | 6,0 MB → **1,5 MB per kunjungan** |
| Batas keras di server: 1,2 MB/foto, maks 4 foto, hanya jenis gambar | kiriman 21 MB kini `413`, bukan `200` |
| `Cache-Control: no-store, private` | foto luka tidak lagi boleh mengendap di cache peramban |
| 7 tes baru di `npm run uji` | ketiganya terjaga |

**Dinding bergeser dari 85 ke ±350 kunjungan** (diukur ulang: 300 kunjungan = 445 MB / 17 dtk masih jalan; 600 gagal). Praktisnya masih berat jauh sebelum itu.

**Yang belum: memindahkan foto keluar dari basis data** ke penyimpanan objek, dengan tautan bertanda tangan yang kedaluwarsa. Selama foto masih ikut di dalam jawaban JSON, dindingnya hanya bergeser, tidak hilang.

### 1.5 ~~Tidak ada cadangan sama sekali~~ — **SELESAI 8 September 2026**

Satu `DROP TABLE` yang salah ketik, satu disk mati, atau satu server yang tidak diperpanjang, dan seluruh rekam kunjungan hilang tanpa jalan kembali. Teks persetujuan juga menjanjikan foto luka disimpan 5 tahun — janji yang tidak bisa ditepati tanpa cadangan.

Sekarang ada `skrip/cadangan.sh` (pg_dump → GPG AES-256 → **dibuka kembali dan diperiksa isinya** → baru yang lama dibersihkan) dan `skrip/pulihkan.sh`. Cadangan **selalu** terenkripsi; tanpa kunci skripnya berhenti, bukan menyimpan versi polos. Latihan memulihkan ke basis data kosong sudah dijalankan sungguhan — 0 galat, seluruh jumlah baris cocok. Rinciannya, termasuk tiga galat yang hanya ketahuan karena skripnya benar-benar dijalankan, ada di `CADANGAN.md`.

### 1.2 Kewenangan perawat untuk sirkumsisi

Ini yang paling perlu Anda periksa sendiri, karena menyangkut Anda secara pribadi sebagai perawat.

**UU 17/2023 Pasal 263 ayat (1)**: setiap perawat yang berpraktik di fasilitas pelayanan kesehatan wajib memiliki Surat Izin Praktik. Ayat (2) menyerahkan syarat dan tata caranya ke Peraturan Pemerintah.

Untuk sirkumsisi khususnya, kajian hukum yang ada menyimpulkan bahwa tindakan ini berada di wilayah abu-abu: sebagian menempatkannya sebagai tindakan medis yang memerlukan **pelimpahan wewenang delegatif tertulis dari dokter**, sebagian lain menempatkannya sebagai tindakan yang boleh dikerjakan perawat sepanjang sesuai kompetensi dan SPO. Yang disepakati: **bila terjadi kelalaian tanpa pelimpahan resmi, tanggung jawab pidana dan perdata sepenuhnya jatuh ke perawat.**

**Saran:**
- Sediakan surat pelimpahan wewenang delegatif tertulis dari dokter penanggung jawab untuk setiap perawat yang mengerjakan sirkumsisi, dan simpan salinannya di sistem.
- Tambahkan kolom `delegationLetterId` pada tabel `providers`, dan tolak penugasan sirkumsisi bila kolomnya kosong.
- Tampilkan nama dokter penanggung jawab pada persetujuan tindakan sirkumsisi.

Ini **belum** saya bangun — keputusannya ada pada Anda dan penasihat hukum Anda, bukan pada saya.

### 1.3 ~~Pembayaran masih peragaan~~ — **SELESAI 8 September 2026**

**Keadaan sebelumnya.** Menekan "Bayar" memanggil satu aksi, dan aksi itu menulis `paymentStatus: "LUNAS"`. Tidak ada penyedia pembayaran, tidak ada uang yang berpindah. Yang menyatakan pembayaran sudah terjadi adalah **browser pasien** — yang bisa memanggil API itu langsung tanpa membayar apa pun.

Akibatnya bukan sekadar salah catat. Status LUNAS itulah yang membuat perawat berangkat, membeli bahan habis pakai dengan uangnya sendiri, dan mengerjakan tindakan. **Yang menanggung perawat.**

**Yang sekarang berlaku** — penyedia: Midtrans; pasien membayar setelah menyetujui, sebelum perawat berangkat:

| Aturan | Isi |
|---|---|
| Nominal | Dihitung ulang di server dari `quote_items`. Browser tidak pernah menyebut angka. |
| Yang boleh menulis LUNAS | **Hanya** `/api/pembayaran/kabar`, dan hanya untuk kabar yang tanda tangannya cocok — SHA512(order_id + status_code + gross_amount + ServerKey) |
| Aksi `BAYAR` lama | Dihapus; menjawab `410` |
| Kiriman ganda | Disidik-jari; kabar yang sama tidak berakibat dua kali |
| Kabar tertinggal | Dikenali dan diabaikan, tidak menarik mundur keadaan yang sudah selesai |
| Nominal tidak cocok | Ditahan — tidak dilunaskan, tidak digagalkan; admin dipanggil, pemesanan ditandai bersengketa |
| Kabar yang hilang | Tugas terjadwal `cocokkan-pembayaran` bertanya langsung ke Midtrans tiap jam, **sebelum** `belum-dibayar` berjalan |

Rincian, termasuk hasil pengujiannya, ada di `PEMBAYARAN.md`.

**Yang masih manual:** pengembalian dana lewat dasbor Midtrans, dan pembayaran bagi hasil 70/30 ke perawat — angkanya dihitung dan tampil, tapi pemindahan uangnya belum otomatis.

### 1.4 ~~Lencana "Terverifikasi" tanpa dasar~~ — **SELESAI 8 September 2026**

**Keadaan sebelumnya.** Nomor STR hanya teks yang diketik sendiri, ditampilkan besar-besar dengan lencana "Terverifikasi", dan tidak pernah sekali pun dicocokkan dengan dokumen apa pun. Kolom `verified_status` bahkan bernilai `"VERIFIED"` sejak data contoh dibuat — tak seorang pun pernah memverifikasi apa-apa. Pasien memutuskan memasukkan orang asing ke rumahnya berdasarkan lencana itu.

Ada satu kesalahan pemahaman yang ikut diperbaiki: aplikasi hanya menyimpan **STR**, dan tidak menyimpan **SIP** sama sekali.

- **STR** membuktikan seseorang *terdaftar* sebagai perawat. Sejak **UU 17/2023** berlaku **seumur hidup** — jadi "STR masih berlaku" bukan lagi pertanyaan yang berarti.
- **SIP / SIPP** membuktikan ia *boleh berpraktik*, di tempat tertentu, dalam masa tertentu, diterbitkan pemerintah daerah. **Inilah** yang menentukan boleh-tidaknya seseorang merawat pasien di Kota Malang.

Aplikasi lama menyimpan yang tidak pernah kedaluwarsa, dan tidak menyimpan yang bisa.

**Yang sekarang berlaku:**

- Nilai bawaan `verified_status` adalah `BELUM_DIAJUKAN`, bukan `TERVERIFIKASI`.
- Perawat mengunggah STR, SIP, dan KTP; dokumennya masuk tabel `provider_documents` sebagai **riwayat** — SIP lama ditandai *diganti*, tidak dihapus, supaya pertanyaan "apakah izinnya berlaku pada tanggal kunjungan itu" masih bisa dijawab bertahun-tahun kemudian.
- **Meluluskan wajib menyebutkan di mana nomornya dicocokkan** (portal KTKI, surat Dinkes, telepon, tatap muka). Tanpa kolom itu "terverifikasi" hanya berarti seseorang menekan tombol hijau.
- **Menolak dan membekukan wajib beralasan** minimal 10 karakter — yang membacanya adalah perawat yang penghasilannya berhenti hari itu.
- Setiap keputusan tersimpan di `verification_reviews`: siapa, kapan, atas dasar apa.
- **SIP yang kedaluwarsa mengalahkan status "TERVERIFIKASI"** yang tersimpan. Verifikasi kemarin tidak membuat izin yang habis hari ini menjadi berlaku.
- Peringatan mulai **60 hari** sebelum SIP habis, kepada perawat dan admin — mengurus perpanjangan butuh berminggu-minggu.
- Perawat yang belum lolos **tidak menerima satu pun permintaan**, dan tidak melihat satu pun foto luka di antrean. Penjagaannya di server, bukan hanya tombol yang gagal ditekan.
- Membekukan **langsung mencabut semua sesinya**.
- Nomor SIP **tidak** ditampilkan ke pasien, bahkan tersamar. Percobaan pertama menampilkan `503/••••026`; ternyata awalan "503/" sama untuk setiap SIP terbitan Dinkes Kota Malang dan tiga angka terakhirnya adalah tahunnya — yang tersamar justru bagian yang membedakan. Yang pasien lihat: sudah diperiksa, kapan, dan izinnya dari mana.

**Tidak ada pemeriksaan otomatis ke register pusat, dan itu disengaja.** Portal konsil dibuat untuk dibaca orang, bukan dipanggil program; tidak ada layanan resmi yang bisa dipanggil aplikasi seperti ini. Menuliskan "verifikasi otomatis" untuk sesuatu yang sebenarnya menebak isi halaman web akan menghasilkan lencana yang salah persis seperti sebelumnya, hanya dengan lapisan kode di atasnya. Yang jujur: seseorang benar-benar memeriksa, dan aplikasi mencatat siapa, kapan, dan di mana.

### 1.5 ~~Tidak ada cadangan sama sekali~~ — **SELESAI 8 September 2026**

Satu `DROP TABLE` yang salah ketik, satu disk mati, atau satu server yang tidak diperpanjang, dan seluruh rekam kunjungan hilang tanpa jalan kembali. Teks persetujuan juga menjanjikan foto luka disimpan 5 tahun — janji yang tidak bisa ditepati tanpa cadangan.

Sekarang ada `skrip/cadangan.sh` (pg_dump → GPG AES-256 → **dibuka kembali dan diperiksa isinya** → baru yang lama dibersihkan) dan `skrip/pulihkan.sh`. Cadangan **selalu** terenkripsi; tanpa kunci skripnya berhenti, bukan menyimpan versi polos. Latihan memulihkan ke basis data kosong sudah dijalankan sungguhan — 0 galat, seluruh jumlah baris cocok. Rinciannya, termasuk tiga galat yang hanya ketahuan karena skripnya benar-benar dijalankan, ada di `CADANGAN.md`.

### 1.2 Kewenangan perawat untuk sirkumsisi

Ini yang paling perlu Anda periksa sendiri, karena menyangkut Anda secara pribadi sebagai perawat.

**UU 17/2023 Pasal 263 ayat (1)**: setiap perawat yang berpraktik di fasilitas pelayanan kesehatan wajib memiliki Surat Izin Praktik. Ayat (2) menyerahkan syarat dan tata caranya ke Peraturan Pemerintah.

Untuk sirkumsisi khususnya, kajian hukum yang ada menyimpulkan bahwa tindakan ini berada di wilayah abu-abu: sebagian menempatkannya sebagai tindakan medis yang memerlukan **pelimpahan wewenang delegatif tertulis dari dokter**, sebagian lain menempatkannya sebagai tindakan yang boleh dikerjakan perawat sepanjang sesuai kompetensi dan SPO. Yang disepakati: **bila terjadi kelalaian tanpa pelimpahan resmi, tanggung jawab pidana dan perdata sepenuhnya jatuh ke perawat.**

**Saran:**
- Sediakan surat pelimpahan wewenang delegatif tertulis dari dokter penanggung jawab untuk setiap perawat yang mengerjakan sirkumsisi, dan simpan salinannya di sistem.
- Tambahkan kolom `delegationLetterId` pada tabel `providers`, dan tolak penugasan sirkumsisi bila kolomnya kosong.
- Tampilkan nama dokter penanggung jawab pada persetujuan tindakan sirkumsisi.

Ini **belum** saya bangun — keputusannya ada pada Anda dan penasihat hukum Anda, bukan pada saya.

### 1.3 Pembayaran masih peragaan

Menekan "Bayar" langsung menandai lunas. Tidak ada penyedia pembayaran, dan penandaan lunas datang dari browser pasien — yang bisa memanggil API itu langsung tanpa membayar apa pun.

**Sebelum menerima uang sungguhan:** sambungkan ke penyedia (QRIS/VA), dan pindahkan penandaan lunas ke *webhook* dari penyedia, bukan dari browser.

---

### 1.7 ~~Masa simpan bertentangan dengan Permenkes~~ — **DIPUTUSKAN 25 TAHUN, 9 September 2026**

**Permenkes 24/2022 Pasal 39 ayat (1):** *"Penyimpanan data Rekam Medis Elektronik di Fasilitas Pelayanan Kesehatan dilakukan paling singkat 25 (dua puluh lima) tahun sejak tanggal kunjungan terakhir Pasien."*

Sebelumnya aplikasi menjanjikan **5 tahun** kepada pasien dan tugas terjadwal benar-benar menghapusnya. Keputusan Anda: ikuti 25 tahun.

**Yang berubah:**

| Bagian | Sebelum | Sesudah |
|---|---|---|
| `TENGGAT.simpanFotoTahun` | 5 | **25** |
| Dihitung dari | tanggal pemesanan itu | **kunjungan TERAKHIR pasien** |
| Teks persetujuan foto | "5 (lima) tahun" | "25 (dua puluh lima) tahun", menyebut dasar hukumnya |
| Wizard pemesanan | "Disimpan 5 tahun" | "Disimpan 25 tahun sesuai kewajiban rekam medis" |
| Layar hasil kunjungan | "masa simpan 5 tahun" | mengikuti konstanta, tidak lagi ditulis mati |
| Hak hapus di teks persetujuan | "bisa saya minta hapus kapan saja" | dikatakan terus terang bahwa selama 25 tahun permintaan hapus tidak selalu bisa dipenuhi |

**Dua cacat yang ikut ketemu saat mengerjakannya:**

1. **Masa simpan dihitung per pemesanan, bukan per pasien.** Pasalnya berbunyi "sejak kunjungan terakhir *Pasien*". Pasien yang dirawat 2026 lalu datang lagi 2040: dengan perhitungan lama, rekam 2026 dihapus pada 2051 — padahal harus disimpan sampai 2065. Sekarang dihitung dari kunjungan terakhir pasien di seluruh pemesanannya, dan kalau angka itu belum dihitung, penghapusannya **ditahan** (bukan jatuh ke nilai bawaan yang menghapus terlalu cepat).

2. **Teks persetujuan foto tidak pernah disimpan** — yang tersimpan hanya `photoConsent: true/false`, satu bit. Padahal justru teks itu yang memuat janji perlindungan datanya. Terbukti merugikan hari ini juga: untuk pasien yang menyetujui sebelum perubahan ini, tidak ada catatan apa pun tentang apa yang mereka baca. Teks persetujuan tindakan sudah disimpan utuh sejak awal dengan alasan yang persis sama; sekarang pasangannya ikut disimpan (`consents.photo_consent_text`).

**Dijaga oleh tes:** ada tes yang membaca teks persetujuan yang benar-benar tersimpan dan menuntut angkanya sama dengan kebijakan penghapusan. Dibuktikan menangkap: teks dikembalikan ke "5 tahun" → merah.

**Catatan penyimpanan:** dengan 25 tahun dan foto yang sudah dikecilkan, 3 kunjungan/hari selama 25 tahun ≈ **40 GB**. Tanpa pengecilan angkanya 160 GB.

### 1.8 Lokasi penyimpanan data

**Permenkes 24/2022 Pasal 22:** penyimpanan rekam medis elektronik lewat kerja sama pihak ketiga *"dapat dilakukan melalui kerja sama dengan Penyelenggara Sistem Elektronik yang memiliki fasilitas penyimpanan data di dalam negeri."*

Artinya, saat foto dipindahkan keluar dari basis data nanti, penyimpanannya harus di **penyedia yang pusat datanya di Indonesia** — bukan Cloudflare R2, AWS S3, atau Supabase yang wilayahnya di luar negeri.

---

## 2. Yang sudah dikerjakan

### 2.1 Persetujuan tindakan (informed consent)

| Yang dituntut | Status |
|---|---|
| Penjelasan tindakan, risiko, dan pilihan lain | ✅ `src/logic/consent.ts` — risiko dirinci per jenis tindakan, dalam bahasa awam |
| Biaya disebutkan sebelum menyetujui | ✅ rincian per item ikut tercetak di dalam teks persetujuan |
| Identitas dan nomor STR pelaksana | ✅ tercetak di angka 1 |
| Ditegaskan yang mengerjakan perawat, bukan dokter | ✅ tertulis eksplisit |
| Hak menolak dan menghentikan tindakan | ✅ angka 5 dan 7 |
| Penanda tangan bisa wali/orang tua | ✅ kolom `signerRelation` |
| Bukti tersimpan setelah kalimatnya berubah | ✅ **seluruh teks** disimpan apa adanya di `consents.textSnapshot`, bukan nomor versinya saja |

Dua hal yang membuatnya bukan sekadar centang:

- **Tombol setuju terkunci sampai teksnya benar-benar digulir ke bawah.** Persetujuan yang isinya tak pernah terlihat bukan *informed consent*.
- **Teks disusun di server dari data yang tersimpan**, bukan dikirim dari browser. Kalau browser yang mengirimkannya, yang tercatat sebagai bukti adalah kalimat apa pun yang dikirim.

### 2.2 Foto luka sebagai data pribadi spesifik

**UU 27/2022 Pasal 4 ayat (2)** memasukkan data kesehatan sebagai data pribadi bersifat spesifik; **Pasal 20 ayat (2) huruf a** menuntut persetujuan eksplisit untuk tujuan tertentu; **Pasal 21 ayat (1)** menuntut sederet keterangan disampaikan lebih dulu.

| Tuntutan Pasal 21 ayat (1) | Status |
|---|---|
| Tujuan pemrosesan | ✅ tiga tujuan disebut satu per satu |
| Jenis dan relevansi data | ✅ disebut sebagai foto luka = data kesehatan |
| Jangka waktu penyimpanan | ✅ 5 tahun sejak kunjungan terakhir |
| Hak subjek data | ✅ salinan, hapus, tarik persetujuan, menolak |
| Persetujuan eksplisit & terpisah | ✅ kotak centang sendiri, **bukan** digabung ke persetujuan tindakan |

Menolak memberi foto **tidak** membatalkan pemesanan — memaksakannya berarti menukar layanan kesehatan dengan penyerahan data kesehatan.

> **Diperbaiki 7 Sep 2026:** penghapusan otomatis setelah 5 tahun sekarang ada pelaksananya — tugas terjadwal `hapus-foto-kedaluwarsa`, dijalankan harian lewat `/api/cron`. Sudah diuji dengan data kedaluwarsa: gambar diganti penanda, barisnya tetap sebagai rekam, dan foto pemesanan bersengketa ditahan. Lihat `TUGAS-TERJADWAL.md`.

### 2.3 Kesepakatan tarif yang bisa ditinjau

- Setiap item biaya tersimpan sebagai barisnya sendiri (`quote_items`), bukan satu angka total — kalau ada sengketa, yang bisa dibuktikan bukan hanya berapa, melainkan apa saja.
- **Setiap angka yang menyimpang dari hitungan app wajib diberi alasan tertulis**, dan alasan itu ditampilkan ke pasien, bukan hanya disimpan. Tanpa aturan ini, "harga menyesuaikan kondisi" berubah jadi kotak hitam.
- Persetujuan menyatakan tidak ada biaya lain di luar rincian; bahan tambahan di lapangan wajib disetujui pasien lebih dulu.
- Rincian tarif ikut dibekukan di `consents.quoteSnapshot`.

### 2.4 Testimoni: apa yang boleh dan tidak boleh disentuh admin

Ditambahkan 7 September 2026. Testimoni di layanan kesehatan bukan sekadar bintang dan komentar — kalau bisa ditulis ulang bebas lalu ditayangkan sebagai suara pasien, itu ulasan palsu, dan yang menanggung akibatnya pemilik layanan.

| Aturan | Cara dijaga |
|---|---|
| Tulisan asli pasien tidak pernah berubah | `isiAsli` hanya ditulis sekali; **tidak ada satu pun jalan di API** untuk mengubahnya |
| Bintang milik pasien | Tidak ada kodenya di aksi admin. Percobaan mengirim `bintang` diabaikan diam-diam |
| Izin tayang keputusan pasien | Admin hanya bisa menayangkan dari yang sudah diizinkan; `JANGAN_TAYANG` ditolak 409 |
| Merapikan ≠ menulis ulang | Wajib beralasan, dan versi tayang tidak boleh jauh lebih panjang dari aslinya |
| Pasien tahu kalau tulisannya dirapikan | Kedua versi + alasannya tampil di portalnya |
| Pembaca tahu | Testimoni yang diedit ditandai "Diringkas oleh admin" di halaman depan |
| Nama disamarkan | Inisial + kelurahan saja; nomor rumah tidak pernah ikut |

Sembilan percobaan menembus lewat API langsung — semuanya ditolak, termasuk menayangkan yang pasiennya larang, mengubah isi tanpa alasan, dan menulis ulang jadi iklan.

**Angka bintang di halaman depan dihitung dari SELURUH testimoni**, bukan hanya yang tayang. Kalau hanya yang tayang yang dihitung, angkanya naik karena admin memilih mana yang tampil — benar secara aritmetika, menyesatkan sebagai informasi. Admin boleh memilih cerita mana yang tampil; angkanya tidak.

Dua statistik karangan juga dibuang dari portal admin: `+24,8% vs last month` yang ditulis mati dan tidak pernah dihitung dari apa pun, dan total pendapatan yang menjumlahkan **semua** pemesanan termasuk yang batal dan belum dibayar. Sekarang hanya yang berstatus lunas.

### 2.5 Penyortiran kritik sebelum sampai ke perawat

Ditambahkan 8 September 2026. Kritik tidak langsung sampai ke perawat — admin menyortirnya dulu. Yang dikendalikan admin adalah **kapan** dan **dengan pengantar apa**, bukan apakah perawat boleh tahu.

| Aturan | Cara dijaga |
|---|---|
| Perawat selalu membaca kalimat ASLI pasien | Pengantar admin diletakkan di atasnya, tidak menggantikannya |
| Menahan wajib beralasan | 409 tanpa alasan; alasannya tercatat di jejak audit |
| Keluhan **keselamatan** tidak bisa ditahan | Langsung `DITERUSKAN` saat dibuat; tombol "Tahan" tidak dirender, dan API menolak 409 |
| Perawat tak bisa membalas yang belum diteruskan | 409 |
| Nilai bintang menghitung SEMUA | Yang ditahan hanya kalimatnya; jumlahnya dikatakan terang-terangan ke perawat |
| Tidak ada yang terlupakan | Tugas `testimoni-belum-disortir` mengingatkan admin setelah 3 hari |

**Mengapa keluhan keselamatan tidak bisa ditahan.** Tuduhan atas praktik seseorang harus sampai ke orangnya. Perawat yang baru tahu berbulan-bulan kemudian sudah kehilangan kesempatan menjelaskan dan kehilangan bukti yang mungkin ada di ingatannya sendiri. Admin tetap boleh menambahkan pengantar — yang tidak boleh adalah menahannya.

**Yang menentukan sebuah keluhan menyangkut keselamatan adalah PASIEN**, lewat pertanyaan lanjutan setelah kotak "ini keluhan" dicentang. Bukan ditebak sistem dari kata-katanya: tebakan yang meleset di sini berat sebelah — keluhan bahaya yang tidak terdeteksi ikut tertahan di meja admin.

**Tugas terjadwal sengaja hanya mengingatkan, tidak meneruskan otomatis.** Meneruskan kritik yang belum diverifikasi bisa merugikan perawat yang ternyata tidak bersalah.

### 2.6 Bukti pekerjaan

Foto luka **sebelum dan sesudah** wajib sebelum kunjungan bisa ditutup — diperiksa di layar *dan* di server. Ini melindungi kedua pihak; yang paling dirugikan kalau bukti tidak ada justru perawat yang benar-benar bekerja.

Laporan tindakan ditandatangani dengan nomor STR dan tidak bisa diubah setelah dikirim.

### 2.7 Urutan alur tidak bisa dilangkahi

Seluruh perpindahan status lewat satu tabel izin di `src/logic/alur.ts`. Delapan percobaan melangkahi urutan lewat API langsung — semuanya ditolak:

| Percobaan | Hasil |
|---|---|
| Lompat dari "menunggu ditinjau" langsung ke "selesai" | 409 ditolak |
| Bayar tanpa persetujuan tertandatangani | 409 ditolak |
| Setujui penawaran milik orang lain | 403 ditolak |
| Setuju tanpa nama tanda tangan | 400 ditolak |
| Kirim penawaran tanpa penilaian & tanpa item | 409 ditolak |
| Tutup kunjungan tanpa foto luka | 409 ditolak |
| Tutup kunjungan dengan laporan kosong | 400 ditolak |
| Perawat lain menutup kunjungan bukan miliknya | 403 ditolak |
| Pasien mengunggah foto bukti kerja | 403 ditolak |
| Memesan dengan tanda bahaya tercentang | 409 ditolak |

### 2.8 Tanda bahaya

Perdarahan hebat atau demam tinggi menghentikan pemesanan, menampilkan tombol 119 dan IGD, dan ditahan lagi di server. Nomor 119 tetap sejangkauan di kepala halaman setelah spanduk daruratnya tergulir.

---

## 3. Cacat yang ditemukan saat pengujian ini

Semuanya sudah diperbaiki, tapi perlu Anda ketahui karena menunjukkan jenis kesalahan yang mudah terulang:

| Temuan | Akibatnya |
|---|---|
| Pemesanan menyimpan alamat sebagai **teks bebas**, koordinatnya dicari dengan mencocokkan teks itu ke tabel alamat | Teksnya tidak pernah sama persis, jadi pencocokan **selalu** gagal dan biaya jarak setiap pemesanan diam-diam jatuh ke tarif tengah. Salah harga di setiap kunjungan, tanpa satu pun pesan galat. Diperbaiki dengan kolom `addressId`. |
| `CREATE_BOOKING` menandai `paymentStatus: "PAID"` | Pembayaran yang tidak pernah terjadi, tercatat sebagai sudah terjadi |
| `consentGiven: true` ditulis saat pemesanan dibuat | Persetujuan tercatat sebelum pasien membaca apa pun |
| Foto bukti selalu tercatat atas nama "Ns. Ratna Dewi" | Foto yang diunggah perawat lain tercatat atas nama orang lain — membatalkan seluruh gunanya sebagai bukti |
| Tombol "Berangkat" muncul pada permintaan yang belum ditinjau, ditawar, dan dibayar | Urutan alur bisa dilangkahi lewat satu klik |
| Dua kotak unggah "Foto luka" dalam satu wizard, satu di antaranya tanpa persetujuan pemakaian data | Data kesehatan tersimpan tanpa dasar |

---

## 3b. Audit alur 20 November 2026

Seluruh aksi API dibaca ulang dari sisi tiga orang: pasien, perawat, dan uang.
Setiap celah di bawah **dibuktikan dulu** ke server yang berjalan (12 tes di
`skrip/uji/celah.test.mjs` gagal), baru diperbaiki (12 lulus, 161 tes
seluruhnya lulus).

| Celah | Akibat sebelum diperbaiki | Sekarang |
|---|---|---|
| Uang masuk untuk pemesanan yang sudah dibatalkan (tagihan masih terbuka 24 jam) | Pasien diberi tahu "perawat akan berangkat" untuk kunjungan batal; tak seorang pun diminta mengembalikan uangnya | Admin diminta mengembalikan, pasien diberi tahu uangnya kembali, pemesanan dibekukan (sengketa) |
| Uang masuk dua kali lewat dua nomor pesanan | Keduanya tercatat lunas tanpa ada yang tahu | Pembayaran kedua ditandai perlu ditinjau, admin diminta mengembalikan; honor perawat tidak ikut tertahan |
| Membatalkan kunjungan yang sudah lunas | Admin tidak tahu harus mengembalikan uang; perawat tidak tahu kunjungannya batal | Admin, pasien, dan perawat diberi tahu — dari pembatalan pasien, admin, maupun otomatis |
| Pembatalan dan kabar lunas tiba bersamaan | Hasil akhir bergantung siapa yang terakhir menulis | Pemindahan status bersyarat; tepat satu yang menang |
| Izin perawat dicabut/dibekukan/SIP habis **setelah** mengambil kunjungan | Ia tetap bisa menawar, berangkat, dan masuk ke rumah pasien | Ditolak di setiap langkah menuju pasien; admin diberi daftar kunjungan yang perlu dialihkan |
| "Sudah tiba" lewat ubah status biasa | Tiba tanpa bukti apa pun (layar memakai foto, API tidak) | Hanya lewat foto kedatangan |
| Admin menandai "dibayar" lewat ubah status | Perawat berangkat tanpa uang masuk; honornya tidak pernah tercatat | Dibayar hanya dari kabar pembayaran |
| Foto bukti sebelum berangkat, jenis karangan, atau **setelah laporan ditandatangani** | Bukti sengketa bisa ditambah setelah perkaranya muncul | Jenis dibatasi; hanya saat di rumah pasien; terkunci setelah ditutup |
| Tanda bahaya hanya dipercaya dari browser | Permintaan berisi demam/perdarahan hebat lolos jadi kunjungan rumah | Dihitung ulang dari isi pengkajian |
| Dua perawat mengambil permintaan yang sama bersamaan | Keduanya berhasil | Hanya satu |
| Klik ganda "Setuju" / "Tanda tangani" | Persetujuan atau laporan tersimpan dua kali | Yang kedua ditolak sebelum menyimpan apa pun |
| Perawat sendirian di rumah orang asing | Tidak ada cara meminta bantuan; tidak ada yang memperhatikan bila ia tak kunjung kabar | Tombol **Saya butuh bantuan** (admin menerima alamat lewat aplikasi + kotak keluar WhatsApp, pasien tidak diberi tahu) dan tugas `perawat-belum-kabar` (3 jam setelah tiba tanpa ditutup → admin diminta menelepon) |
| `cocokkan-pembayaran` tidak dijadwalkan di Vercel | Pasien yang sudah bayar tapi kabarnya hilang dibatalkan otomatis | Dijadwalkan sebelum `belum-dibayar` |

**Yang perlu diketahui pemasangnya:** `perawat-belum-kabar` perlu berjalan
tiap 30 menit (`jadwal.crontab`). Vercel paket Hobby hanya mengizinkan cron
harian, jadi di Vercel tugas ini **tidak** dijadwalkan — pakai crontab server
atau layanan pemanggil terjadwal dari luar. Pesan WhatsApp ke admin baru
benar-benar terkirim setelah penyedia WhatsApp dipasang; sampai itu ia
tercatat di kotak keluar.

**Masih terbuka (bukan celah kode, tapi keputusan):**
- Pasien belum punya cara memastikan orang di depan pintu adalah perawat yang
  ditugaskan (mis. kode kunjungan yang dicocokkan, foto perawat di layar).
- Pengembalian dana masih manual lewat dasbor Midtrans; aplikasi kini
  memberi tahu kapan harus, tapi belum mencatat bahwa sudah dilakukan.

## 4. Yang belum dikerjakan

Dikelompokkan menurut **kapan** perlunya, bukan menurut besarnya.

### A. Sebelum pasien sungguhan pertama

| | Kenapa |
|---|---|
| ~~**Surat pelimpahan wewenang delegatif untuk sirkumsisi**~~ (§1.2) | **Diputuskan 12 September 2026: tidak diadakan untuk sekarang.** Ini keputusan sadar pemilik, bukan hal yang terlewat. Yang perlu diketahui dengan jelas: selama tidak ada surat itu, bila terjadi kelalaian dalam tindakan sirkumsisi, tanggung jawab pidana dan perdatanya jatuh **sepenuhnya kepada perawat yang mengerjakan** — termasuk Anda sendiri kalau Anda yang mengerjakannya. Catatan ini ditulis supaya keputusan itu bisa ditinjau ulang kapan saja, bukan supaya terlupakan. |
| **Coba sekali alur bayar di sandbox Midtrans dengan kunci asli** | Yang sudah diuji penyedia tiruan. Jalur suksesnya belum pernah benar-benar dijalani. **Ditunda ke tahap uji coba atas permintaan pemilik (12 September 2026)** — tetap harus dilakukan sebelum pasien sungguhan pertama. |
| **Jalankan cadangan sekali, lalu latihan pulihkan sendiri** | Supaya Anda pernah melakukannya sebelum harus melakukannya dalam keadaan panik. |
| **Isi `SEED_PASSWORD`, ganti sandi admin dari dalam aplikasi** | Tanpa itu akun contoh tidak punya sandi sama sekali di produksi (memang disengaja). |

### B. Segera setelah jalan

| | Kenapa |
|---|---|
| **Lupa kata sandi** | Sekarang yang lupa harus dibantu admin satu per satu. Itu tidak bisa dipertahankan begitu pasiennya bertambah. |
| **Pemantauan cadangan gagal** | Kalau cron-nya berhenti, tidak ada yang memberi tahu — keadaannya persis sama dengan tidak punya cadangan, hanya terasa lebih aman. |
| **Jejak akses** (siapa membuka rekam siapa) | Yang tercatat baru perubahan. Untuk data kesehatan, "siapa pernah membuka" juga perlu. Lebih mudah sekarang: setiap permintaan sudah tahu pengirimnya. |
| **Verifikasi dua langkah untuk admin** | Akun admin melihat data seluruh pasien; kata sandi saja terlalu tipis untuk itu. |

### C. Utang arsitektur — sebelum ±300 kunjungan

| | Kenapa |
|---|---|
| **Foto keluar dari basis data** ke penyimpanan objek Indonesia (§1.6, §1.8) | Pengecilan kemarin menggeser dinding dari 85 ke ±350 kunjungan. Menggeser, bukan menghilangkan. |
| **Pecah `/api/platform`** | Masih satu berkas 1.500 baris berisi 20-an aksi berderet — bentuk yang dulu membuat satu lubang menyebar ke semua tempat sekaligus. Sekarang aman dirombak: ada 71 tes sebagai jaringnya. |

### D. Usaha dan kenyamanan, tidak menghambat

- **Bagi hasil 70/30 belum otomatis dibayarkan** ke perawat — angkanya dihitung dan tampil, uangnya masih dipindahkan manual.
- **Belum ada halaman rekonsiliasi** untuk mencocokkan `payments` dengan mutasi rekening. Datanya sudah lengkap; layarnya yang belum ada.
- **Tanda terima belum dikirim** ke pasien — baru pemberitahuan di dalam aplikasi.
- **Jarak masih garis lurus** (haversine), bukan jarak tempuh jalan.

### E. Yang belum pernah diuji sama sekali

Ini bukan daftar pekerjaan, tapi daftar ketidaktahuan — dan sebaiknya dibaca begitu:

- **Midtrans sungguhan.** Yang diuji penyedia tiruan di localhost.
- **Beban banyak orang sekaligus.** Semua pengukuran dilakukan satu permintaan pada satu waktu.
- **Ponsel sungguhan.** Layar diperiksa di peramban ukuran ponsel, bukan di ponsel Android atau iPhone yang nyata.
- **Pasien sungguhan.** Aplikasi ini belum pernah dipakai satu orang pun di luar pengujian. Itu ketidaktahuan yang paling besar, dan satu-satunya yang tidak bisa ditutup dengan menulis kode.

---

## Sumber

- [UU Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi](https://pasal.id/peraturan/uu/uu-no-27-tahun-2022)
- [Surat Izin Praktik Perawat Berdasarkan UU No. 17/2023 Pasal 263 — DPD PPNI Jakarta Timur](https://ppnijaktim.org/surat-izin-praktik-perawat-berdasarkan-uu-no-17-2023-pasal-263/)
- [Pelimpahan Wewenang Secara Delegatif kepada Perawat terhadap Tindakan Sirkumsisi](https://jurnal.goretanpena.com/index.php/JSSR/article/download/996/791)
