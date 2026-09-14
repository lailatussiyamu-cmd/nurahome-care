# Pembayaran

Ringkas, untuk yang memasang dan mengurus aplikasi ini. Alasan setiap
keputusan ada di komentar `src/logic/pembayaran.ts`.

---

## Yang berubah

Sebelumnya, menekan "Bayar" memanggil satu aksi, dan aksi itu menulis
`paymentStatus: "LUNAS"` ke basis data. Tidak ada penyedia pembayaran, tidak
ada uang yang berpindah. Yang menyatakan bahwa pembayaran sudah terjadi
adalah **browser pasien** — yang bisa memanggil API itu langsung tanpa
membayar apa pun.

Akibatnya bukan sekadar salah catat. Status LUNAS itulah yang membuat
perawat berangkat, membeli bahan habis pakai dengan uangnya sendiri, dan
mengerjakan tindakan. **Yang menanggung perawat.**

Sekarang ada tiga aturan yang tidak bisa dilanggar:

1. **Nominal dihitung server**, dari `quote_items` yang sudah disetujui.
   Browser tidak pernah menyebut angka.
2. **Yang menyatakan lunas hanya kabar dari Midtrans**, lewat jalur
   server-ke-server, dan hanya kalau tanda tangannya cocok.
3. **Kabar yang sama datang dua kali tidak berakibat dua kali.**

---

## Alurnya

```
pasien menekan Bayar
   │
   ├─ POST /api/pembayaran          ← hanya membuka halaman pembayaran
   │    • pemesanan ini miliknya?
   │    • statusnya DISETUJUI?
   │    • persetujuan tindakan tersimpan?
   │    • total dihitung ulang dari quote_items
   │    • cocok dengan yang disetujui pasien?
   │    → token Snap. TIDAK menandai apa pun.
   │
   ├─ pasien membayar di halaman Midtrans (QRIS / VA / GoPay / ShopeePay)
   │
   └─ POST /api/pembayaran/kabar    ← Midtrans → server. SATU-SATUNYA
        • tanda tangan cocok?           tempat yang boleh menulis LUNAS
        • nominalnya cocok?
        • kabarnya baru, bukan ulangan?
        • kabarnya bukan yang tertinggal?
        → payments.status, lalu bookings.payment_status
```

Layar tidak pernah menandai lunas. Setelah pasien menutup jendela Midtrans,
layar hanya **menunggu** dan bertanya berkala ke server.

---

## Memasang

```bash
MIDTRANS_SERVER_KEY=...     # RAHASIA. Jangan pernah sampai ke browser.
MIDTRANS_CLIENT_KEY=...     # boleh terbuka — memang untuk browser
MIDTRANS_MODE=SANDBOX       # ganti PRODUKSI kalau sudah siap terima uang
```

Lalu di dasbor Midtrans → **Settings → Configuration → Payment
Notification URL**, isi:

```
https://nurahome.example.id/api/pembayaran/kabar
```

> **Kunci sandbox di mode PRODUKSI ditolak aplikasi.** Ini kekeliruan
> pemasangan yang paling mahal: aplikasinya berjalan mulus, halaman
> pembayarannya muncul, pasien "membayar" — dan tidak satu rupiah pun
> benar-benar berpindah. Baru ketahuan waktu rekening dicek. Karena itu
> `midtransSiap()` menolak kunci berawalan `SB-` saat mode PRODUKSI.

Kalau kunci belum dipasang sama sekali, layar pembayaran mengatakannya
terang-terangan kepada pasien ("Pembayaran online belum tersambung, silakan
hubungi kami — jadwal Anda tetap kami tahan"). Bukan menampilkan tombol yang
gagal tanpa penjelasan, dan tentu bukan menandai lunas.

---

## Kartu kredit sengaja tidak diaktifkan

Yang aktif: QRIS, GoPay, ShopeePay, dan virtual account (BCA/BNI/BRI/Permata).

Untuk kunjungan rumah bernilai ratusan ribu, itu sudah mencakup hampir semua
pasien, biayanya jauh lebih murah, dan tidak ada risiko **tagihan balik
(chargeback)** berbulan-bulan kemudian atas kunjungan yang sudah dikerjakan
dan honornya sudah dibayarkan ke perawat.

---

## Jaring pengaman: kabar yang tidak pernah sampai

Webhook bisa gagal — jaringan putus, server sedang di-deploy, alamatnya
salah ketik di dasbor. Tanpa jaring pengaman, satu kabar yang hilang berarti
pasien **sudah membayar** tetapi kunjungannya dibatalkan otomatis setelah
24 jam karena tercatat belum dibayar. Uangnya masuk, jadwalnya hilang.

Karena itu ada tugas terjadwal `cocokkan-pembayaran` (tiap jam): pembayaran
yang masih `MENUNGGU` lebih dari 1 jam **ditanyakan langsung ke Midtrans**.

Urutannya penting — tugas ini berjalan **sebelum** `belum-dibayar`. Kalau
terbalik, kunjungan yang uangnya sudah masuk dibatalkan lebih dulu, lalu
dicocokkan setelahnya, dan yang dicocokkan sudah telanjur batal.

---

## Keadaan yang perlu orang

| Keadaan | Yang terjadi |
|---|---|
| `capture` + `fraud_status: challenge` | **Bukan lunas.** Midtrans minta seseorang memutuskan. Status `PERLU_TINJAUAN`, admin diberi tahu, pemesanan ditandai bersengketa. |
| Nominal dikabarkan ≠ nominal tercatat | Ditahan. Tidak dilunaskan, tidak digagalkan. Ada uang sungguhan; admin dipanggil. |
| Status Midtrans yang tidak dikenali | `PERLU_TINJAUAN`, bukan "gagal". Menebaknya sebagai gagal berarti membatalkan kunjungan orang yang sudah membayar. |
| `refund` | `DIKEMBALIKAN`, admin diberi tahu, pemesanan ditandai bersengketa. |

Pemesanan yang ditandai bersengketa tidak disentuh tugas terjadwal — fotonya
tidak dihapus, statusnya tidak diubah. Selama ada persoalan uang yang belum
selesai, buktinya harus utuh.

**Pembayaran gagal atau kedaluwarsa TIDAK membatalkan kunjungan.** Pasiennya
diberi tahu dan jadwalnya tetap ditahan; yang membatalkan setelah 24 jam
adalah tugas terjadwal `belum-dibayar`, dengan tenggat yang sudah diketahui
pasien sejak awal. Satu kali gagal transfer tidak boleh menghapus jadwal
yang sudah disiapkan.

---

## Hasil pengujian

Dijalankan sungguhan pada aplikasi yang berjalan. Midtrans tidak terjangkau
dari lingkungan uji, jadi pembuatan transaksi diuji lewat jalur gagalnya
(yang justru penting: **tidak ada yang ditandai lunas**), dan webhook diuji
penuh dengan kabar bertanda tangan asli.

**Serangan ke webhook:**

| Percobaan | Hasil |
|---|---|
| Tanpa tanda tangan | `401` — dicatat `DITOLAK_TANDA_TANGAN` |
| Tanda tangan asal | `401` |
| Tanda tangan dari kunci tebakan | `401` |
| Nominal dikecilkan jadi Rp1.000 | Ditahan; **tidak** dilunaskan; admin dipanggil |
| Nomor pesanan tidak dikenal | Ditahan |

Setelah kelima serangan itu: pemesanan tetap `DISETUJUI / BELUM`.

**Serangan ke pembuatan tagihan:**

| Percobaan | Hasil |
|---|---|
| Aksi `BAYAR` lama (browser menandai lunas) | `410` — aksinya dihapus |
| Pasien lain membayar pemesanan orang | `403` |
| Tanpa masuk | `401` |
| Membayar yang sudah lunas | `409` — "Kunjungan ini sudah dibayar." |
| Browser mengirim nominal sendiri | Diabaikan; server menghitung ulang |
| Midtrans tidak terjangkau | `502`, **0 baris `payments`**, pemesanan tetap `BELUM` |

**Alur normal & kabar berulang:**

```
pending    → MENUNGGU
settlement → LUNAS
settlement (sama, ke-2) → diabaikan, ganda
settlement (sama, ke-3) → diabaikan, ganda
pending TERTINGGAL sampai setelah lunas → diabaikan, tertinggal
```

Hasil akhir: `DIBAYAR / LUNAS / qris`, **sengketa = false**, dan **1**
pemberitahuan ke pasien meskipun ada 5 kabar masuk.

**Keadaan khusus:**

- `capture` + `challenge` → `PERLU_TINJAUAN`, pemesanan **tidak** lunas,
  ditandai bersengketa. ✅
- `expire` → pembayaran `GAGAL`, pemesanan tetap `DISETUJUI`, **tidak**
  bersengketa, pasien dikabari "jadwal masih kami tahan". ✅

### Bug yang hanya ketahuan karena dijalankan

**Kabar `pending` yang tertinggal diperlakukan sebagai anomali.** Versi
pertama menyamakan semua kabar yang ditahan. Akibatnya satu kabar `pending`
yang sampai beberapa detik setelah `settlement` — kejadian yang sepenuhnya
normal, karena urutan kabar dari penyedia memang tidak dijamin — membuat
pembayaran yang sudah lunas ditandai `PERLU_TINJAUAN` dan pemesanannya
ditandai **bersengketa**. Tanda sengketa itu menghentikan penghapusan foto
dan memanggil admin untuk sesuatu yang tidak salah sama sekali.

Sekarang penahannya punya dua jenis: `TERTINGGAL` (dicatat lalu diabaikan,
tidak ada yang dibangunkan) dan `ANOMALI` (dipanggilkan orang).

---

## Yang belum ada

- **Pengembalian dana dari dalam aplikasi.** Sekarang lewat dasbor Midtrans;
  aplikasi hanya mencatat kabarnya.
- **Bagi hasil 70/30 belum otomatis dibayarkan** ke perawat. Angkanya sudah
  dihitung dan tampil, tapi pemindahan uangnya masih manual.
- **Belum ada halaman rekonsiliasi untuk admin** — mencocokkan `payments`
  dengan mutasi rekening. Datanya sudah lengkap di tabel `payments` dan
  `payment_events`; yang belum ada layarnya.
- **Tanda terima (kuitansi) belum dikirim** ke pasien. Baru pemberitahuan di
  dalam aplikasi.

---

## Bagi hasil perawat (70/30)

Disetujui 7 September 2026, dipasang otomatis 13 September 2026.

### Yang dibagi dan yang tidak

| Komponen | Perawat | Platform |
|---|---|---|
| Jasa tindakan | 70% | 30% |
| Bahan habis pakai | 100% | — |
| Biaya perjalanan | 100% | — |
| Biaya di luar jam kerja | 100% | — |

Bahan tidak dibagi karena itu penggantian barang yang benar-benar terpakai;
membaginya sama saja menyuruh perawat menombok sebagian bahannya sendiri.
Jarak utuh ke perawat karena dia yang menempuh jalannya, dan biaya luar jam
utuh ke perawat karena dialah yang kehilangan waktu istirahatnya.

### Kapan tercatat

Satu baris `payouts` dibuat otomatis begitu kunjungan **ditutup dengan
laporan** *dan* **pembayarannya masuk**. Pencatatannya dipanggil dari kedua
tempat (penutupan laporan dan kabar pembayaran), jadi urutan mana pun aman;
`bookings.id` unik di tabel itu, jadi kabar berulang tidak menggandakan
honor.

Kunjungan yang selesai tapi belum lunas **tidak** menghasilkan honor. Itu
bukan utang platform kepada perawat, melainkan utang pasien kepada platform.

### Angkanya dibekukan

Semua nominal — termasuk porsi platform yang dipakai — disimpan di baris
`payouts`, tidak dihitung ulang saat dibaca. Kalau tarif berubah tahun
depan, honor kunjungan tahun ini tidak ikut bergerak. Rinciannya tetap ada
di `quote_items`, jadi angkanya selalu bisa **diperiksa ulang**; dibekukan
supaya bisa dibandingkan, bukan supaya dipercaya begitu saja.

### Status

| Status | Artinya |
|---|---|
| `TERKUMPUL` | Uang sudah di platform, honornya hak perawat, tinggal ditransfer. |
| `DIBAYARKAN` | Sudah ditransfer; ada tanggal dan nomor referensinya. |
| `DITAHAN` | Ada sengketa. Dicatat supaya tidak hilang, tidak dibayarkan sampai selesai. |
| `PERLU_TINJAUAN` | Jumlah rincian ≠ uang yang tercatat diterima. Tidak dibayarkan otomatis. |

Selisih **tidak pernah dibulatkan atau ditebak** — menebak mana yang benar
akan merugikan perawat atau pasien.

### Menandai sudah ditransfer

Hanya admin, dan hanya dengan nomor referensi transfer (minimal 4 karakter).
Angkanya tidak bisa disunting di tahap ini: kalau angkanya salah, yang
diperbaiki adalah rincian penawarannya, bukan ditimpa diam-diam di tempat
yang tidak ada lagi pemeriksanya.

Kalau ada kunjungan yang honornya terlewat (mis. kegagalan basis data
sesaat), admin bisa menjalankan **"Catat yang tertinggal"**. Jalur itu tidak
pernah mengubah baris yang sudah ada — hanya membuat yang belum ada.
