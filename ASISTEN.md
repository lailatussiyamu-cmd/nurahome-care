# Asisten tanya-jawab

Diperbaiki 13 September 2026.

## Apa ini, dan apa yang BUKAN

Ini **bukan AI**. Isinya pencocokan kata yang ditulis tangan, dengan daftar
yang bisa dibaca dan diperdebatkan siapa pun — semuanya di
`src/logic/asisten.ts`.

Versi sebelumnya menyebut dirinya *"AI Clinical Decision-Support
Assistant"* padahal isinya persis pencocokan seperti ini. Bedanya hanya
satu: daftarnya berbahasa Inggris.

## Apa yang salah sebelumnya

Diukur pada aplikasi yang berjalan, 13 September 2026:

| Yang ditulis pasien | Yang terjadi |
|---|---|
| "luka ibu berdarah hebat dan darahnya menyembur, demam tinggi" | **Tanda bahaya tidak menyala.** Ditawari paket ganti balut Rp 350.000. |
| "jari kaki hitam bau busuk" | Tidak menyala. |
| "halo" | Langsung direkomendasikan layanan berikut harganya. |

Penyebabnya: daftar tanda bahayanya berbunyi `"heavy bleeding"`,
`"high fever"`, `"black toe"` — di aplikasi yang seluruh pemakainya
berbahasa Indonesia. Penjagaannya ada, terlihat rapi di kode, dan **tidak
pernah sekali pun menyala**.

Tiga hal lain di jalur yang sama:

- **Mode perapi catatan mengarang isi rekam medis.** Perawat menulis "ganti
  balut, luka bersih"; yang dikembalikan "Dimensions measured at
  approximately 2.8 cm x 1.8 cm x 0.3 cm. Tissue composition: 85% healthy
  pink-red granulation tissue…" — lalu kalimat itu ditulis ke kolom
  pengkajian yang ditandatangani perawat dengan nomor STR-nya.
- **Formulir catatan klinis terisi sejak dibuka**, untuk pasien mana pun:
  panjang 2,8 cm, lebar 1,8 cm, nyeri 2/10, daftar bahan, instruksi pulang.
- **`painScorePost: Number(painScorePost) || 2`** — skala nyeri yang
  dikosongkan (dan skala nyeri **0**, yang berarti tidak nyeri) tersimpan
  sebagai 2.

Rekam medis harus memuat apa yang benar-benar dikerjakan — Permenkes
24/2022 Pasal 26. Angka karangan di sana bukan "bantuan menulis".

## Aturan yang berlaku sekarang

1. **Lebih baik salah menyuruh ke IGD daripada salah menenangkan.** Kedua
   kesalahan itu tidak setara, jadi ambangnya sengaja rendah.
2. **Tidak pernah mengarang.** Kalau tidak cukup jelas, jawabannya adalah
   pertanyaan — bukan tebakan yang terdengar meyakinkan.
3. **Saat tanda bahaya menyala, tidak ada layanan yang ditawarkan.** Yang
   ditekan orang panik adalah tombol yang ada di depannya.
4. **Harga dan nama layanan dibaca dari tabel `services`**, tidak ditulis
   mati. Dulu Rp 1.650.000 dan Rp 420.000 tertulis di dalam berkas API, dan
   menaikkan tarif tidak mengubah angka yang dilihat pasien di percakapan.
5. **Perapi catatan hanya memindahkan kalimat perawat**, apa adanya,
   termasuk komanya. Bagian yang tidak ia tulis dibiarkan kosong. Kalimat
   yang tidak bisa ditempatkan ditunjukkan, bukan dibuang.
6. **Mode perapi catatan hanya untuk perawat yang sudah masuk.** Dulu tamu
   mana pun bisa memanggilnya.
7. **Batas 60 permintaan per menit per alamat.** Dulu tidak ada batas sama
   sekali.

## Tanda bahaya yang dikenali

Perdarahan yang tidak berhenti · demam tinggi · jaringan menghitam atau
berbau · kesadaran menurun · sesak napas atau nyeri dada · kemerahan yang
menjalar cepat · tidak bisa buang air kecil setelah sunat.

Daftarnya pendek dengan sengaja: peringatan yang muncul untuk keluhan biasa
akan diabaikan dalam seminggu, dan peringatan yang diabaikan sama saja
tidak ada.

Ungkapannya ditulis seperti orang benar-benar mengetik di ponsel —
"muncrat", "gk berhenti", "sesek", "blm kencing", "panas tinggi". Kata
`tidak`/`belum`/`bukan` tepat di depan gejala membalikkan artinya, supaya
"tidak ada demam tinggi" tidak ikut menyala.

## Yang dijaga tesnya

`skrip/uji/asisten.test.mjs` — 10 kalimat gawat berbahasa Indonesia yang
**harus** menyala, 5 keluhan biasa yang **tidak boleh** menyala, dan tes
bahwa perapi catatan tidak menambahkan satu angka pun yang tidak ditulis
perawat.

Dibuktikan menangkap kemunduran: mengembalikan daftar tanda bahaya ke
bahasa Inggris menggagalkan 12 tes; mengembalikan `|| 2` pada skala nyeri
menggagalkan 3.

## Lapisan model AI (opsional)

Ditambahkan 13 September 2026. **Mati secara bawaan** — tanpa `AI_API_KEY`,
seluruh aplikasi bekerja persis seperti bagian di atas.

### Cara menyalakannya

```
AI_PENYEDIA=GEMINI        # atau OPENAI / ANTHROPIC
AI_API_KEY=...
AI_MODEL=                 # kosongkan untuk memakai bawaan tiap penyedia
```

Bawaannya model termurah dan tercepat, karena pekerjaannya memang ringan
(membaca satu kalimat, memilih satu dari lima layanan, menyusun tiga
pertanyaan): `gemini-2.5-flash`, `gpt-4o-mini`, atau `claude-haiku-4-5`.
Gemini punya kuota gratis — itu tempat paling murah untuk mencoba.

Keadaan sambungannya terlihat di layar admin. Layanan berbayar yang
diam-diam berhenti — kunci kedaluwarsa, kuota habis — adalah layanan yang
tidak ada yang tahu kapan matinya.

### Apa yang model BOLEH dan TIDAK BOLEH

| | Model |
|---|---|
| Menaikkan tanda bahaya yang tidak dikenali daftar kata | **boleh** |
| Mencabut tanda bahaya dari daftar kata | **tidak pernah** |
| Menulis kalimat balasan dan pertanyaan lanjutan | boleh |
| Memilih layanan ketika daftar kata belum yakin | boleh |
| Mengubah layanan yang daftar kata sudah yakin | tidak |
| Menyebut harga | tidak — tarif selalu dari tabel `services` |
| Menyentuh isi rekam medis (perapi SOAP) | **tidak pernah** |

Kenapa daftar kata menang saat keduanya berbeda: bukan karena ia lebih
pintar — jelas tidak. Karena **ia selalu menjawab sama**. Kalimat yang sama
hari ini dan bulan depan mendapat jawaban yang sama, dan kalau jawabannya
salah, salahnya bisa ditemukan, ditulis di tes, dan diperbaiki sekali untuk
selamanya. Kesalahan yang tidak bisa diulang tidak bisa diperbaiki — hanya
bisa disesali.

### Urutan pemeriksaan

```
kalimat pasien
      │
      ▼
 daftar kata  ──── gawat? ──► LANGSUNG tampilkan IGD/119
      │                       (model TIDAK dipanggil sama sekali)
      │ aman
      ▼
   model AI  ──── gagal/lambat/ngawur? ──► pakai hasil daftar kata
      │
      ▼
  jawaban digabung
```

Model dipanggil **setelah** tanda bahaya dinyatakan aman. Artinya kalimat
orang yang sedang gawat tidak pernah keluar dari server, dan jalur
daruratnya tidak menunggu jawaban siapa pun.

### Privasi

Yang dikirim ke penyedia hanya kalimat keluhan, setelah disaring: nomor
telepon, surel, kode pesanan, dan angka panjang diganti `[nomor]`,
`[surel]`, `[kode pesanan]`. Tidak ada nama, alamat, maupun foto luka.

Rekam medis **tidak pernah** dikirim ke mana pun — perapi catatan SOAP
murni pencocokan kata, dan ada tesnya.

Tetap harus Anda putuskan sadar: keluhannya sendiri memang keluar, dan
keluhan kesehatan adalah data pribadi spesifik menurut **UU 27/2022 Pasal 4
ayat (2)**. Siapkan perjanjian pemrosesan data dengan penyedianya dan
sebutkan ini di kebijakan privasi. Di layar, pasien diberi tahu **sebelum**
ia mengetik — memberi tahu sesudahnya bukan pemberitahuan, itu pengumuman.

### Batas waktu

8 detik. Yang menunggu adalah orang yang sedang cemas memandangi luka;
jawaban bagus yang datang 30 detik lagi lebih buruk daripada jawaban
sederhana sekarang. Lewat batas itu, jalur pencocokan kata mengambil alih.

### Yang dijaga tesnya

Penyedia model tiruan (`skrip/uji/model-tiruan.mjs`) dinyalakan selama tes
dan **mencatat setiap permintaan**, sehingga bisa dibuktikan:

- keluhan gawat **tidak pernah dikirim** ke penyedia (nol permintaan);
- model tidak bisa mencabut tanda bahaya, tapi bisa menaikkannya;
- slug layanan karangan dibuang; tarif tetap dari tabel;
- penyedia mati / kunci ditolak / jawaban bukan JSON / menggantung 15 detik
  → pasien tetap menerima jawaban lengkap, dan menunggunya 8 detik;
- nomor telepon dan surel yang diketik di dalam keluhan tidak ikut keluar;
- perapi catatan perawat tidak menyentuh penyedia sama sekali.

Dibuktikan menangkap kemunduran: mematikan pemeriksaan tanda bahaya di awal
membuat keluhan gawat terkirim ke penyedia, dan tesnya gagal.

## Catatan lama: kalau suatu hari mau memakai model AI sungguhan

Seluruh pertimbangannya sudah terkumpul di satu berkas
(`src/logic/asisten.ts`), jadi menggantinya tidak perlu menyentuh yang
lain. Dua hal yang harus diputuskan lebih dulu, dan keduanya bukan
keputusan teknis:

- Keluhan luka pasien akan terkirim ke server penyedia model, sering di
  luar negeri. Itu persoalan **UU 27/2022 (PDP)** dan **Permenkes 24/2022
  Pasal 22** (penyimpanan data di dalam negeri), dan perlu perjanjian
  pemrosesan data.
- Tanda bahaya sebaiknya **tetap diperiksa daftar ini lebih dulu**, di luar
  model. Pemeriksaan yang jawabannya bisa berubah-ubah bukan tempat yang
  tepat untuk memutuskan apakah seseorang perlu ke IGD.
