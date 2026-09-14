# Mencoba NuraHome Care di komputer sendiri

Tujuannya satu: **Anda klik sendiri seluruh aplikasinya**, dari pesan pasien
masuk sampai honor perawat tercatat, tanpa satu rupiah pun berpindah dan
tanpa menyentuh data pasien sungguhan.

Perkiraan waktu: 20 menit untuk pemasangan pertama, 10 detik untuk
menjalankannya lagi di hari berikutnya.

---

## 1. Yang perlu dipasang sekali

Dua saja.

**Node.js** — https://nodejs.org (pilih versi LTS)
Setelah dipasang, buka Terminal (macOS) atau PowerShell (Windows), ketik:

```
node -v
```

Kalau muncul angka seperti `v22.x.x`, berhasil.

**PostgreSQL** — https://www.postgresql.org/download/
Saat memasang ia meminta kata sandi untuk pengguna `postgres`. **Catat kata
sandi itu.** Kalau lupa, pemasangannya harus diulang.

> Di MacBook, alternatif yang lebih mudah: https://postgresapp.com —
> klik Initialize, selesai.

---

## 2. Menyalakan

Di folder proyek, sekali saja:

```
npm install
```

Lalu, setiap kali ingin mencoba:

```
npm run coba
```

Kalau kata sandi Postgres Anda **bukan** `postgres`, jalankan begini:

*macOS / Terminal:*
```
COBA_PG="postgresql://postgres:SANDI_ANDA@127.0.0.1:5432/postgres" npm run coba
```

*Windows / PowerShell:*
```
$env:COBA_PG="postgresql://postgres:SANDI_ANDA@127.0.0.1:5432/postgres"
npm run coba
```

Buka **http://localhost:3000**. Hentikan dengan `Ctrl-C`.

### Akun untuk mencoba

Kata sandi semuanya `nurahome123`.

| Peran | Masuk dengan | Siapa |
|---|---|---|
| Pasien | `0812-3456-7890` | Budi Santoso |
| Perawat | `0813-8899-1122` | Ns. Ratna Dewi — luka, **sudah** terverifikasi |
| Perawat | `0815-7766-3344` | Ns. Hendra Wijaya — sunat |
| Perawat | `0856-2211-8080` | Ns. Dwi Lestari — **belum** terverifikasi |
| Admin | `admin@nurahomecare.id` | dr. Aris Pratama |

### Tiga hal yang perlu Anda tahu

- **Basis datanya terpisah** (`nurahome_coba`). Apa pun yang Anda rusak di
  sini tidak menyentuh data sungguhan. Kalau ingin mulai bersih lagi, hapus
  basis datanya lalu jalankan ulang.
- **Pembayaran memakai penyedia tiruan.** Tidak ada uang berpindah. Pesanan
  otomatis menjadi LUNAS sekitar 3 detik setelah Anda menekan bayar — supaya
  Anda bisa terus ke kunjungan, laporan, dan bagi hasil. Di server sungguhan
  ini tidak ada; yang melunaskan hanya kabar bertanda tangan dari Midtrans.
- **Buka dua peramban berbeda** (mis. Chrome untuk pasien, Safari/Edge untuk
  perawat), atau satu jendela biasa + satu jendela penyamaran. Kalau memakai
  satu jendela, Anda harus keluar-masuk terus dan alurnya jadi susah diikuti.

---

## 3. Daftar periksa — yang wajib Anda coba sendiri

Centang sambil jalan. Urutannya sengaja: setiap bagian memakai hasil bagian
sebelumnya.

### A. Sebagai pasien — memesan

- [ ] Buka **Tanya dulu**, ketik `halo`. Harus membalas dengan pertanyaan,
      **bukan** langsung menawarkan layanan berikut harganya.
- [ ] Ketik `luka ibu saya berdarah hebat dan darahnya menyembur, demam tinggi`.
      **Harus muncul panel merah + tombol Telepon 119, dan TIDAK ada tombol
      pesan.** Kalau ini tidak muncul, berhenti dan beri tahu saya.
- [ ] Ketik `mau sunat di rumah` (tanpa umur). Harus bertanya umurnya dulu.
- [ ] Pesan satu perawatan luka. Unggah foto luka — **coba juga foto langsung
      dari kamera ponsel** kalau bisa, bukan hanya gambar kecil.
- [ ] Baca teks persetujuan sampai habis. Kalimatnya benar? Masa simpan 25
      tahun disebut? Itu yang akan dibaca pasien Anda.

### B. Sebagai perawat — menawar

- [ ] Masuk sebagai **Ns. Dwi Lestari** (`0856-2211-8080`, belum
      terverifikasi). **Ia tidak boleh melihat satu pun permintaan pasien.**
- [ ] Masuk sebagai **Ns. Ratna** (`0813-8899-1122`). Permintaan tadi muncul.
      Nama dan alamat pasien masih disamarkan sebelum diambil?
- [ ] Ambil, lihat fotonya, kirim penawaran. **Ubah satu harga** — harus
      dipaksa menulis alasan.
- [ ] Perhatikan honor yang tertulis: 70% dari jasa, bahan dan jarak utuh.
      Angkanya masuk akal untuk Anda?

### C. Sebagai pasien — menyetujui & membayar

- [ ] Tolak penawarannya dulu, tulis alasan. Permintaan harus kembali ke
      antrean perawat lain.
- [ ] Pesan lagi, kali ini setujui. Tanda tangani dengan mengetik nama.
- [ ] Tekan bayar. Tunggu ~3 detik, muat ulang. Status harus **LUNAS** dan
      pemesanan berpindah ke **Sudah dibayar**.

### D. Sebagai perawat — mengunjungi & menutup

- [ ] Jalankan status: Berangkat → Tiba → Dikerjakan.
- [ ] Buka formulir catatan klinis. **Semua kolom harus KOSONG.** Kalau ada
      angka yang sudah terisi sendiri, itu bug — beri tahu saya.
- [ ] Coba simpan **tanpa mengisi skala nyeri**. Harus ditolak dengan
      kalimat yang jelas.
- [ ] Isi skala nyeri `0`. Harus diterima, dan tersimpan sebagai 0 — bukan 2.
- [ ] Tulis catatan kasar beberapa baris, tekan **Susun jadi SOAP**.
      Bandingkan hasilnya dengan yang Anda tulis: **tidak boleh ada satu kata
      pun yang Anda tidak tulis.**
- [ ] Unggah foto sebelum & sesudah, lalu tutup kunjungan dengan laporan.
      Coba tutup tanpa foto dulu — harus ditolak.

### E. Sebagai admin — uang

- [ ] Buka layar admin. Panel **Bagi hasil perawat** harus memuat kunjungan
      tadi, status "Siap dibayarkan".
- [ ] Periksa angkanya satu per satu. Tagihan, jasa, porsi 70%, potongan,
      bahan utuh, yang diterima perawat. **Cocokkan dengan hitungan Anda
      sendiri di kertas.** Ini uang orang.
- [ ] Coba tandai dibayarkan **tanpa nomor referensi** — harus ditolak.
- [ ] Isi nomor referensi, tandai. Angka "Siap dibayarkan" harus turun.
- [ ] Nyalakan sengketa pada satu kunjungan lain, lalu tutup kunjungan itu.
      Honornya harus **Ditahan**, dan tidak bisa dibayarkan.

### F. Sebagai perawat lagi — melihat honornya

- [ ] Masuk sebagai Ns. Ratna. Kartu **Honor menunggu transfer** harus
      menunjukkan angka, bukan "Belum ada kunjungan yang selesai".
- [ ] Yang sudah ditransfer tertulis terpisah.

### G. Lupa kata sandi

- [ ] Di halaman masuk, tekan lupa sandi, isi `0812-3456-7890`.
- [ ] Kodenya **tidak** muncul di layar — memang begitu. Ia tercatat di
      kotak keluar untuk dikirim lewat WhatsApp.
      Selama penyedia WhatsApp belum dipasang, ambil kodenya begini:

      ```
      psql "postgresql://postgres@127.0.0.1:5432/nurahome_coba" \
        -c "select tujuan, isi from outbox order by id desc limit 1"
      ```

- [ ] Masukkan kode yang salah 5 kali. Kode yang **benar** pun harus ikut
      hangus setelah itu.

### H. Yang paling sering terlupa

- [ ] **Buka di ponsel.** Cari alamat "Network" yang tercetak saat menyalakan
      (mis. `http://192.168.1.5:3000`), buka dari ponsel di wifi yang sama.
      Hampir semua pasien Anda akan memakai ponsel, bukan laptop.
- [ ] Coba dengan **sinyal jelek** (matikan wifi, pakai data seluler 1 bar).
      Apa yang terjadi saat mengunggah foto?
- [ ] Coba satu alur **sebagai orang yang belum pernah melihat aplikasi ini**.
      Di mana Anda ragu-ragu? Itu tempat pasien Anda akan berhenti.

---

## 4. Tes otomatis

Terpisah dari yang di atas, dan tidak menggantikannya:

```
npm run uji
```

138 tes, sekitar satu menit. Ia menjaga hal-hal yang **tidak terlihat mata**:
pasien A tidak bisa membuka pemesanan pasien B, browser tidak bisa menandai
lunas, tanda bahaya menyala untuk kalimat bahasa Indonesia, honor tidak
tercatat dua kali.

Yang **tidak** bisa dijaganya, dan karena itu bagian 3 di atas tetap perlu:
apakah kalimatnya enak dibaca, apakah tombolnya ketemu, apakah alurnya masuk
akal bagi orang yang sedang cemas.

Jalankan ini setiap kali sebelum memasang versi baru ke server. Kalau ada
satu saja yang merah, jangan dipasang dulu.

---

## 5. Kalau ada yang salah

| Yang muncul | Artinya |
|---|---|
| `Postgres belum bisa dihubungi` | Postgres belum jalan, atau kata sandinya berbeda. Perintahnya sendiri sudah menjelaskan apa yang harus dilakukan. |
| `Another next dev server is already running` | Masih ada yang jalan dari percobaan sebelumnya. Tutup jendela Terminal lain, atau restart komputer. |
| Halaman putih / muter terus | Tunggu 30 detik saat pertama kali — Next sedang menyusun halamannya. Kalau lebih dari itu, lihat pesan di Terminal. |
| Ingin mulai dari nol | Hapus basis datanya: `psql -c "DROP DATABASE nurahome_coba"` lalu `npm run coba` lagi. |

Kalau menemukan sesuatu yang aneh, catat **apa yang Anda lakukan** dan **apa
yang terjadi** — dua kalimat saja sudah cukup untuk saya telusuri.
