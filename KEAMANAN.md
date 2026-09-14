# Masuk, sesi, dan keamanan akun

Ringkas, untuk yang memasang dan mengurus aplikasi ini. Alasan setiap
keputusan ada di komentar `src/logic/otentikasi.ts`; latar belakang
hukumnya di `TINJAUAN-LEGAL-KEAMANAN.md` §1.1 dan §1.4.

---

## Siapa boleh punya akun

| Peran | Cara akunnya dibuat |
|---|---|
| **Pasien** | mendaftar sendiri — nama, nomor HP, kata sandi |
| **Perawat** | dibuat admin, lalu perawatnya mengunggah STR & SIP untuk diverifikasi |
| **Admin** | tidak pernah dibuat lewat aplikasi; hanya lewat basis data saat pemasangan |

Perawat sengaja **tidak** boleh mendaftar sendiri. Kalau boleh, aplikasi
kembali ke keadaan yang mau diperbaiki: nomor STR yang diketik sendiri dan
tidak pernah dicocokkan dengan dokumen apa pun.

---

## Masuk

Satu kotak menerima **nomor HP maupun surel**. Nomor diseragamkan ke bentuk
`62xxxxxxxxx`, jadi `0812-3456-7890`, `+62 812 3456 7890`, dan
`62812 3456 7890` semuanya menuju akun yang sama.

Kalimat gagalnya **selalu sama** — "Nomor/surel atau kata sandi salah." —
baik nomornya tidak terdaftar maupun sandinya salah. Kalau dibedakan, kotak
masuk berubah menjadi alat memeriksa siapa saja yang memakai layanan
perawatan luka; untuk layanan kesehatan, sekadar "orang ini pelanggan di
sini" sudah informasi yang tidak boleh keluar. Waktu jawabnya pun disamakan
(diukur: **206 ms** untuk nomor terdaftar, **203 ms** untuk yang tidak).

---

## Umur sesi

Dua batas sekaligus, berbeda menurut peran:

| Peran | Batas diam | Batas mutlak |
|---|---|---|
| Admin | 2 jam | 12 jam |
| Perawat | 12 jam | 7 hari |
| Pasien | 7 hari | 30 hari |

Batas **mutlak** itulah yang menangkap token yang dicuri: sesi yang dipakai
penyerang setiap jam tidak pernah menganggur, jadi batas diam saja tidak
pernah menghentikannya.

Admin paling pendek karena akun admin melihat data seluruh pasien. Perawat
lebih pendek dari pasien karena ponselnya dibawa ke rumah orang dan lebih
sering hilang atau dipinjam.

---

## Penguncian setelah gagal berkali-kali

| Gagal beruntun | Ditunda |
|---|---|
| 5× | 1 menit |
| 8× | 5 menit |
| 11× | 30 menit |
| 15× | 2 jam |

Bertingkat, **bukan blokir permanen**. Blokir permanen terdengar aman tapi
berubah menjadi senjata: siapa pun yang tahu nomor telepon seorang perawat
bisa mengunci akunnya menjelang jam kunjungan hanya dengan salah mengetik
sandi lima kali.

Terpisah dari itu: **30 kegagalan per 15 menit per alamat IP**. Batas
per-akun saja tidak menahan serangan yang membalik arahnya — satu kata sandi
yang sangat umum dicoba ke ribuan nomor berbeda; setiap akun hanya "gagal
sekali", tidak satu pun terkunci, padahal yang terjadi adalah serangan.

Yang dicatat di `login_attempts` hanya pengenal, berhasil/gagal, sebabnya,
dan sidik jari IP. **Kata sandi yang diketik tidak pernah dicatat, termasuk
saat gagal** — log percobaan gagal adalah tempat kata sandi paling sering
bocor tanpa disadari, karena orang mengetik sandi akun lain di kotak yang
salah.

---

## Mengganti kata sandi

Mengganti sandi **mengeluarkan semua perangkat lain**, dan membiarkan
perangkat yang dipakai menggantinya tetap masuk. Orang mengganti kata sandi
justru karena curiga ada yang masuk ke akunnya; mengganti tanpa mencabut
sesi lama tidak menyelesaikan apa pun — sesi penyerang tetap hidup.

---

## Yang dipasang saat pemasangan

```bash
DATABASE_URL=postgresql://...
CRON_SECRET=$(openssl rand -base64 32)        # tugas terjadwal
IP_HASH_SALT=$(openssl rand -base64 32)       # sidik jari IP tidak bisa dibalik
BACKUP_PASSPHRASE=$(openssl rand -base64 32)  # lihat CADANGAN.md
SEED_PASSWORD=...                             # kata sandi awal akun contoh
```

**Tanpa `SEED_PASSWORD` di produksi, akun contoh dibuat tanpa kata sandi
sama sekali** — bukan dengan sandi bawaan yang "nanti diganti". Akun tanpa
kata sandi tidak bisa dipakai masuk. Kata sandi bawaan yang tertulis di
dalam kode adalah salah satu cara paling lazim sebuah aplikasi jatuh:
kodenya terbuka, akun `admin@…` ada di setiap pemasangan, dan sandinya sama
di semuanya.

Di pengembangan (bukan produksi), akun contoh memakai `nurahome123`.

---

## Penjaga di dalam build

```bash
npm run periksa     # atau otomatis lewat: npm run build
```

`skrip/periksa-aktor.mjs` menggagalkan build kalau ada aksi yang kembali
membaca `actorRole`, `actorUserId`, atau `actorProviderId` dari badan
permintaan — pola yang dulu membuat siapa pun bisa menjadi admin dengan satu
baris di Developer Tools. Sudah diuji: menambahkan satu saja kembali membuat
build gagal.

---

## Yang belum ada

- **Lupa kata sandi.** Sekarang yang lupa harus dibantu admin. Perlu kode
  lewat WhatsApp/SMS sebelum jumlah pasiennya bertambah.
- **Verifikasi dua langkah untuk admin.** Akun admin melihat data seluruh
  pasien; kata sandi saja terlalu tipis untuk itu.
- **Jejak akses.** Yang tercatat baru perubahan, belum "siapa membuka rekam
  siapa". Sekarang lebih mudah dikerjakan: setiap permintaan sudah tahu
  siapa pengirimnya.
