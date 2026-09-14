# Cadangan NuraHome Care

Sebelum ini, aplikasi ini tidak punya cadangan sama sekali. Satu perintah
`DROP TABLE` yang salah ketik, satu disk yang mati, atau satu server yang
tidak diperpanjang — dan seluruh rekam kunjungan, foto luka, serta teks
persetujuan yang ditandatangani pasien hilang tanpa jalan kembali.

Yang lebih halus tapi sama pentingnya: teks persetujuan berjanji foto luka
disimpan **5 tahun**. Janji itu bukan hanya tentang menghapus tepat waktu.
Ia juga berarti data itu ada selama lima tahun — dan tidak ada yang bisa
menepatinya tanpa cadangan.

---

## Yang perlu diketahui lebih dulu

**Isi cadangan ini adalah rekam medis.** Foto luka, catatan klinis, nomor
telepon, alamat rumah beserta titik koordinatnya, dan teks persetujuan
lengkap dengan nama penandatangannya. Satu berkas cadangan yang bocor sama
dengan seluruh basis data yang bocor.

Karena itu skrip di sini **selalu** mengenkripsi, dan **berhenti** kalau
kuncinya tidak ada — bukan menyimpan versi polos "untuk sementara".

---

## Menyiapkan (sekali)

```bash
# 1. Buat kunci cadangan. SIMPAN DI LUAR SERVER — pengelola kata sandi,
#    atau amplop tertutup di brankas. Kunci yang hanya ada di server yang
#    sama dengan cadangannya tidak menambah keamanan apa pun.
openssl rand -base64 32

# 2. Pasang sebagai environment variable di server
export BACKUP_PASSPHRASE='...hasil di atas...'
export DATABASE_URL='postgresql://...'
export BACKUP_DIR=/var/backups/nurahome
```

> **Kalau kuncinya hilang, cadangannya hilang.** Tidak ada pintu belakang,
> tidak ada pemulihan kunci. Itu memang yang diinginkan — tapi berarti
> menyimpan kuncinya sama pentingnya dengan menjalankan cadangannya.
> Simpan di dua tempat yang tidak akan hilang bersamaan.

---

## Menjalankan

```bash
./skrip/cadangan.sh
```

Yang dikerjakannya:

| Langkah | Isi |
|---|---|
| 1 | `pg_dump -Fc --no-owner --no-privileges` |
| 2 | Enkripsi GPG AES-256, kunci lewat stdin (tidak muncul di `ps aux`) |
| 3 | **Membuka kembali hasilnya** dan memastikan tabel intinya ada |
| 4 | Membersihkan yang lama — *setelah* yang baru terbukti bisa dibuka |

Langkah 3 yang membedakannya dari sekadar `pg_dump | gpg`. Cadangan yang
tidak pernah dicoba dibuka bukan cadangan, melainkan harapan. Kalau
berkasnya rusak, gagal didekripsi, atau isinya kurang dari 10 tabel,
skripnya berhenti dengan status gagal — dan **cadangan lama tidak dihapus**.

### Jadwal

```cron
# 02:00 WIB harian (= 19:00 UTC hari sebelumnya; periksa `date` di server)
0 19 * * * cd /srv/nurahome && BACKUP_PASSPHRASE="$(cat /root/.kunci-cadangan)" ./skrip/cadangan.sh >> /var/log/nurahome-cadangan.log 2>&1
```

Waktunya sengaja **02:00**, bukan 03:10. Tugas terjadwal
`hapus-foto-kedaluwarsa` berjalan 03:10 dan menghapus gambar yang lewat masa
simpan. Mencadangkan lebih dulu berarti selalu ada satu salinan dari sebelum
penghapusan berjalan — kalau suatu saat aturan masa simpannya keliru,
akibatnya masih bisa ditarik kembali selama beberapa hari.

Yang disimpan: **14 harian** dan **8 mingguan** (Minggu). Cukup untuk
menangkap kerusakan yang baru disadari beberapa minggu kemudian — jenis
kerusakan yang paling sering terjadi bukan disk mati, melainkan data yang
salah diubah lalu tidak ada yang sadar sampai ada pasien yang mengeluh.

---

## Salinan luar — bagian yang paling sering dilewatkan

Cadangan yang hanya ada di server yang sama dengan basis datanya **tidak
menolong pada satu-satunya kejadian yang paling mungkin: servernya yang
hilang.** Habis masa sewa, akunnya ditangguhkan, penyedianya bermasalah.

Karena isinya sudah terenkripsi sebelum menyentuh disk, ia boleh disalin ke
penyimpanan mana pun — termasuk yang tidak sepenuhnya Anda percayai.

```bash
# contoh: rclone ke penyimpanan objek
rclone copy /var/backups/nurahome remote:nurahome-cadangan --max-age 25h
```

Satu hal yang perlu dipastikan: **penyimpanan luarnya jangan bisa dihapus
dengan kunci yang sama dengan yang ada di server.** Kalau server diambil
alih orang, hal pertama yang dilakukannya adalah menghapus cadangan.

---

## Memulihkan

```bash
createdb nurahome_pulih                      # basis datanya harus SUDAH ada
RESTORE_URL='postgresql://.../nurahome_pulih' \
BACKUP_PASSPHRASE='...' \
  ./skrip/pulihkan.sh /var/backups/nurahome/harian/nurahome-….dump.gpg
```

Skrip ini dipakai pada hari terburuk, oleh orang yang sedang panik dan
mungkin bukan orang yang menulisnya. Karena itu:

- **Tidak ada tujuan bawaan.** `RESTORE_URL` wajib diisi sendiri, supaya
  tidak ada yang tanpa sadar menimpa basis data yang sedang dipakai.
- **Kalau tujuannya sudah berisi**, skrip berhenti dan meminta kata `TIMPA`
  diketik lengkap.
- **Setiap langkah dicetak**, supaya kalau berhenti di tengah jelas di mana.

### Setelah pemulihan sungguhan — tiga hal, jangan dilewati

1. **Cabut semua sesi.** Baris di tabel `sessions` ikut terpulihkan, jadi
   token dari salinan lama hidup kembali:
   ```sql
   update sessions set revoked_at = now(), revoked_reason = 'PEMULIHAN'
   where revoked_at is null;
   ```
2. **Periksa kunjungan berstatus `DIBAYAR` dan `DIKERJAKAN`.** Kenyataannya
   bisa jadi sudah lebih maju daripada isi cadangan — perawatnya sudah
   berangkat, pasiennya sudah membayar.
3. **Beri tahu pasien yang terpengaruh.** Rekam yang mundur beberapa jam
   tanpa ada yang memberi tahu lebih membingungkan daripada rekam yang
   hilang.

---

## Latihan memulihkan

**Sebulan sekali, pulihkan ke basis data kosong.** Bukan karena curiga
skripnya salah, tapi karena cadangan yang belum pernah dipulihkan belum
diketahui bisa dipulihkan — dan yang paling sering rusak diam-diam bukan
berkasnya, melainkan kuncinya: salah salin, tertukar dengan yang lama,
tersimpan di tempat yang sudah tidak bisa dibuka.

```bash
createdb nurahome_latihan
RESTORE_URL='postgresql://.../nurahome_latihan' ./skrip/pulihkan.sh <berkas terbaru>
dropdb nurahome_latihan
```

Catat tanggalnya. Latihan yang tidak dicatat cepat berubah menjadi
"rasanya bulan lalu sudah".

---

## Hasil pengujian

Dijalankan sungguhan pada basis data aplikasi ini, bukan disimulasikan.

**Cadangan:**

```
[1/4] Mengambil dump…            70.389 byte
[2/4] Mengenkripsi…
[3/4] Memeriksa hasilnya…        23 tabel berisi data
[4/4] Membersihkan yang lama…
SELESAI: nurahome-20260908T034727Z.dump.gpg (20.832 byte)
```

**Berkasnya benar-benar terenkripsi** — dicari langsung di dalamnya:

| Dicari | Ditemukan |
|---|---|
| `Budi` | 0 |
| `Santoso` | 0 |
| `Jl. Bunga` | 0 |
| `SIPP` | 0 |
| `62812` | 0 |

`file` menjawab: *PGP symmetric key encrypted data — AES with 256-bit key,
salted & iterated, SHA512*.

**Latihan memulihkan ke basis data kosong** — 0 galat:

| Tabel | Asli | Setelah dipulihkan |
|---|---|---|
| bookings | 5 | 5 |
| users | 5 | 5 |
| providers | 3 | 3 |
| task_photos | 2 | 2 |
| visit_reports | 1 | 1 |
| testimoni | 2 | 2 |

**Penjagaan:**

| Percobaan | Hasil |
|---|---|
| Tanpa `BACKUP_PASSPHRASE` | berhenti, tidak ada berkas polos yang dibuat |
| Kunci kurang dari 16 karakter | berhenti |
| Tanpa `DATABASE_URL` | berhenti |
| Memulihkan dengan kunci salah | `Bad session key`, keluar dengan status gagal |
| Memulihkan ke basis data yang belum dibuat | berhenti dengan pesan `createdb …` |
| Dump lebih kecil dari 10 KB | berhenti — hampir pasti basis data kosong |
| Tabel inti tidak ada di dalam dump | berhenti, berkasnya dihapus |

### Dua galat yang hanya ketahuan karena dijalankan

1. **Skripnya berhenti diam-diam sebelum baris terakhirnya.** Fungsi
   pembersih berakhir dengan `[ "$n" -gt "$simpan" ]`; saat tidak ada yang
   perlu dihapus, ujinya bernilai salah, fungsinya mengembalikan status 1,
   dan `set -e` menghentikan seluruh skrip. Cadangannya tetap jadi — jadi
   tidak ada yang terlihat gagal. Yang hilang hanya pengingat paling
   pentingnya: menyalin ke tempat lain.

2. **Hal yang sama, sebab yang berbeda:** `set -o pipefail` membuat `ls`
   yang gagal pada folder mingguan yang masih kosong menjatuhkan seluruh
   pipa. Hanya muncul pada pemasangan yang baru — persis keadaan orang yang
   memasang skrip ini untuk pertama kali.

3. **Pemulihan melaporkan "tujuan berisi 0 tabel" padahal basis datanya
   tidak ada sama sekali.** `psql ... || echo 0` menelan galat sambungan dan
   menyamarkannya sebagai basis data kosong yang siap diisi. Pada hari
   pemulihan sungguhan, salah paham itu menghabiskan menit-menit yang paling
   mahal. Sekarang sambungannya diperiksa terpisah, dan pesannya menyebut
   `createdb`.

---

## Yang BELUM ada

**Belum ada pemulihan ke titik waktu tertentu (PITR).** Cadangan harian
berarti kehilangan paling banyak 24 jam pekerjaan. Untuk layanan sebesar
sekarang itu wajar; kalau kunjungan per hari sudah puluhan, aktifkan
`archive_mode` dan simpan WAL — atau pakai basis data terkelola yang sudah
menyediakannya.

**Belum ada pemantauan cadangan gagal.** Kalau cron-nya berhenti berjalan,
tidak ada yang memberi tahu. Yang paling sederhana: layanan *dead man's
switch* yang mengirim pesan justru ketika panggilan harian **tidak** datang.
Cadangan yang berhenti tanpa ada yang tahu adalah keadaan yang persis sama
dengan tidak punya cadangan — hanya terasa lebih aman.
