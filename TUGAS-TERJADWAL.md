# Tugas Terjadwal NuraHome Care

Delapan pekerjaan yang dijalankan server sendiri, tanpa ada orang yang membuka layar.

Semuanya sudah dijalankan sungguhan dengan data yang sengaja dibuat kedaluwarsa — hasil pengujiannya ada di bagian akhir.

---

## Kenapa penjadwalnya di LUAR aplikasi

Endpoint `/api/cron` dipanggil dari luar (Vercel Cron, GitHub Actions, atau crontab + curl), bukan dijadwalkan di dalam proses Next.js.

Alasannya: proses Next.js bisa mati, di-deploy ulang, atau diperbanyak jadi beberapa salinan. Penjadwal yang hidup di dalamnya akan ikut mati diam-diam — atau justru berjalan berkali-kali sekaligus, sehingga satu pemesanan dibatalkan dua kali dan pasien menerima tiga pemberitahuan yang sama. Penjadwal di luar tidak punya masalah itu.

---

## Daftar tugas

| Tugas | Jadwal | Yang dikerjakan |
|---|---|---|
| `cocokkan-pembayaran` | tiap jam | Menanyakan **langsung ke Midtrans** pembayaran yang masih menunggu >1 jam — jaring pengaman untuk kabar yang tidak pernah sampai |
| `hapus-foto-kedaluwarsa` | 03:10 WIB harian | Menghapus gambar luka yang lewat masa simpan **5 tahun** |
| `penawaran-hangus` | tiap jam | Penawaran tak dijawab **48 jam** → kembali ke antrean perawat lain |
| `permintaan-menggantung` | tiap jam | Permintaan tanpa perawat **6 jam** → beri tahu pasien & admin |
| `belum-dibayar` | tiap jam | Disetujui tapi tak dibayar **24 jam** → dibatalkan, jadwal dilepas |
| `kunjungan-belum-ditutup` | tiap 3 jam | Laporan belum ditandatangani **12 jam** → ingatkan perawatnya |
| `pengingat-kunjungan` | 07:00 WIB harian | Ingatkan pasien & perawat sehari sebelum jadwal |
| `testimoni-belum-disortir` | 08:00 WIB harian | Masukan pasien **3 hari** belum diteruskan ke perawatnya → ingatkan admin |

Semua tenggat ada di satu tempat: `src/logic/tugas.ts`, konstanta `TENGGAT`. **Angkanya masih tebakan saya** — ganti sesuai kebijakan Anda.

---

## Pengaman

Tugas ini menghapus dan mengubah data pasien, jadi:

**1. Mode uji kering.** Tambahkan `&kering=1` — melaporkan persis apa yang *akan* dikerjakan, tanpa menulis apa pun. Jalankan ini dulu setiap kali mengubah aturannya.

**2. Batas 200 baris per jalan.** Satu kesalahan tidak bisa menyapu seluruh basis data sekaligus; sisanya menunggu jalan berikutnya.

**3. Penahan sengketa.** Pemesanan bertanda `sengketa = true` tidak pernah disentuh — fotonya tidak dihapus, statusnya tidak diubah. Menghapus bukti saat perkaranya masih berjalan merugikan pasien dan perawat sekaligus.

**4. Barisnya tidak ikut dihapus.** Yang hilang gambarnya, bukan catatan bahwa dulu ada foto di tahap itu. `image_url` diganti penanda `TERHAPUS:MASA_SIMPAN` dan `image_deleted_at` diisi. Layar menampilkannya sebagai *"Dihapus setelah masa simpan 5 tahun"* — bukan gambar rusak, bukan "belum ada foto". Bedanya penting kalau rekam ini dipakai menjawab keluhan.

**5. Jeda pengingat 12 jam.** Tugas berjalan tiap jam, tapi orangnya tidak diingatkan tiap jam. Tanpa jeda ini, satu permintaan yang menggantung seminggu menghasilkan 168 pemberitahuan ke pasien dan 168 lagi ke admin.

**6. Satu tugas gagal tidak menghentikan sisanya.** Kalau iya, satu kesalahan kecil bisa membuat penghapusan foto berhenti berbulan-bulan tanpa ada yang sadar.

**7. Semua tercatat** di `audit_logs` sebagai `TUGAS_TERJADWAL` (atau `TUGAS_TERJADWAL_UJI_KERING`).

---

## Keamanan endpoint

Dijaga `CRON_SECRET`. **Tanpa variabel itu terpasang, endpoint menolak semua permintaan** — bukan berjalan tanpa penjagaan. Sistem yang "aman selama variabelnya diisi" cepat atau lambat berjalan tanpa isinya.

Perbandingan tokennya berwaktu tetap, supaya lamanya jawaban tidak membocorkan seberapa banyak karakter awal yang sudah ditebak benar.

Buat rahasianya (minimal 16 karakter):

```bash
openssl rand -base64 32
```

Lalu pasang sebagai environment variable di server — **jangan** ditulis di dalam kode atau di-commit.

---

## Memasang

### Vercel

`vercel.json` sudah ada di repositori. Tambahkan `CRON_SECRET` di Project Settings → Environment Variables. Vercel mengirimkannya otomatis di header.

### VPS / cPanel

Ada di `jadwal.crontab`. Buka `crontab -e`, tempel isinya, ganti `BASIS` dan `CRON_SECRET`.

> **Perhatikan zona waktu.** Crontab berjalan di waktu server. Sebagian besar VPS memakai UTC, jadi 03:10 WIB ditulis `10 20 * * *`. Periksa dengan `date` di server; kalau servernya sudah WIB, ubah jadi `10 3 * * *`.

### GitHub Actions

Ada di `.github/workflows/tugas-terjadwal.yml`, sebagai cadangan untuk hosting tanpa cron. Simpan `BASIS` dan `CRON_SECRET` sebagai repository secrets.

> Penjadwal GitHub Actions **tidak tepat waktu** — antreannya sering membuat pekerjaan mundur beberapa menit sampai belasan menit. Untuk tugas di sini tidak masalah, tapi jangan dipakai untuk hal yang harus tepat pada menitnya.

---

## Memakai dari terminal

```bash
# lihat apa yang AKAN dikerjakan, tanpa mengubah apa pun
curl -H "Authorization: Bearer $CRON_SECRET" \
     "https://nurahome.example.id/api/cron?kering=1"

# jalankan satu tugas
curl -H "Authorization: Bearer $CRON_SECRET" \
     "https://nurahome.example.id/api/cron?tugas=hapus-foto-kedaluwarsa"

# jalankan semuanya
curl -H "Authorization: Bearer $CRON_SECRET" \
     "https://nurahome.example.id/api/cron"
```

Jawabannya JSON: `diperiksa` (berapa baris dilihat), `dikenai` (berapa benar-benar disentuh), dan `catatan` berisi kalimat yang bisa langsung dibaca.

---

## Hasil pengujian

Dijalankan pada aplikasi hidup dengan data yang sengaja dibuat kedaluwarsa.

**Penjagaan:**

| Percobaan | Hasil |
|---|---|
| Tanpa token | `401` |
| Token salah | `401` |
| Nama tugas ngawur | `400` + daftar tugas yang sah |

**Uji kering** — melaporkan 5 pekerjaan, lalu diperiksa: tidak satu baris pun berubah. ✅

**Jalan sungguhan:**

```
hapus-foto-kedaluwarsa: 2/3
    1 foto ditahan — Ditahan: sedang bersengketa.      ← penahan bekerja
    2 gambar dihapus dari kunjungan: NHC-2026-8712.
penawaran-hangus: 1/1
    NHC-2026-8901 — penawaran 60 jam tanpa jawaban.
permintaan-menggantung: 1/2
    NHC-2026-8890 — 10 jam tanpa penangan.
belum-dibayar: 1/1
    NHC-2026-8841 — disetujui 30 jam lalu, belum dibayar.
kunjungan-belum-ditutup: 1/1
    NHC-2026-8712 — Sedang ditangani, belum ditutup.
pengingat-kunjungan: 1/1
    NHC-2026-8890 — pengingat untuk besok 09:00 - 10:30 WIB.
```

Akibatnya di basis data:

- `NHC-2026-8841` → `DIBATALKAN` [*Dibatalkan otomatis: tidak dibayar dalam 24 jam*]
- `NHC-2026-8901` → `DITOLAK_PASIEN` [*Penawaran hangus*]
- Dua foto → `TERHAPUS:MASA_SIMPAN`, `image_deleted_at` terisi
- Foto pemesanan bersengketa → **utuh**

**Jalan kedua (uji idempoten):** yang sudah dikerjakan tidak dikerjakan lagi. Setelah 3× jalan berturut-turut, pemberitahuan tetap **2 buah** (pasien + admin), bukan 6.

**Di layar:** foto yang gambarnya sudah dihapus tampil sebagai teks *"Dihapus setelah masa simpan 5 tahun"*. Tidak ada satu pun `<img>` yang mencoba memuat penanda itu, tidak ada permintaan gambar gagal, tidak ada galat konsol.

---

## Dua hal yang sengaja TIDAK dikerjakan otomatis

**Kunjungan yang laporannya belum ditandatangani tidak ditutup otomatis.** Sistem hanya mengingatkan perawatnya.

Kunjungan yang belum ditutup bukan berarti tidak dikerjakan — bisa jadi perawatnya kehabisan baterai atau sinyal. Menutupnya otomatis berarti membuat laporan atas nama orang yang tidak menulisnya, lengkap dengan nomor STR-nya. Untuk dokumen klinis, itu tidak boleh.

Hal yang sama berlaku untuk permintaan yang menggantung: yang perlu terjadi adalah ada orang yang menelepon pasiennya, dan itu bukan sesuatu yang bisa diselesaikan basis data.

**Pembayaran yang gagal atau kedaluwarsa tidak membatalkan kunjungan.** Pasiennya diberi tahu, jadwalnya tetap ditahan. Yang membatalkan setelah 24 jam adalah `belum-dibayar`, dengan tenggat yang sudah diketahui pasien sejak awal. Satu kali gagal transfer tidak boleh menghapus jadwal yang sudah disiapkan.

Urutan dua tugas itu penting dan sengaja: `cocokkan-pembayaran` berjalan **sebelum** `belum-dibayar`. Kalau terbalik, kunjungan yang uangnya sudah masuk tapi kabarnya hilang akan dibatalkan lebih dulu, lalu dicocokkan setelahnya — dan yang dicocokkan sudah telanjur batal.

**Kritik pasien yang belum disortir tidak diteruskan otomatis ke perawat.** Sistem hanya mengingatkan admin setelah 3 hari. Meneruskan kritik yang belum diverifikasi bisa merugikan perawat yang ternyata tidak bersalah — dan penyortiran memang wewenang admin. Pengecualiannya satu: keluhan yang pasien tandai menyangkut keselamatan langsung sampai ke perawat sejak detik dikirim, tanpa lewat penyortiran sama sekali.
