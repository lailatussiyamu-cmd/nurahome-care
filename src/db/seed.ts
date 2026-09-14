import { db } from "./index";
import {
  users,
  dependents,
  addresses,
  services,
  providers,
  bookings,
  woundAssessments,
  circumcisionAssessments,
  clinicalNotes,
  woundTimelineEntries,
  reviews,
  notifications,
  messages,
  auditLogs,
  taskPhotos,
  quoteItems,
  visitReports,
  testimoni,
  providerDocuments,
} from "./schema";
import { count } from "drizzle-orm";
import { buatHashSandi, normalTelepon } from "@/logic/otentikasi";

/**
 * Kata sandi untuk akun contoh.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  DI PRODUKSI, AKUN CONTOH DIBUAT TANPA KATA SANDI SAMA SEKALI.        │
 * │  Bukan dengan kata sandi bawaan yang "nanti diganti".                 │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Kata sandi bawaan yang tertulis di dalam kode adalah salah satu cara
 * paling lazim sebuah aplikasi jatuh: kodenya terbuka, akun `admin@…` ada
 * di setiap pemasangan, dan sandinya sama di semuanya. Niat "nanti diganti"
 * hampir tidak pernah terjadi tepat waktu.
 *
 * Akun tanpa kata sandi tidak bisa dipakai masuk sama sekali (lihat
 * BELUM_ADA_SANDI di api/auth). Yang memasang mengisinya sekali lewat
 * SEED_PASSWORD, lalu menggantinya dari dalam aplikasi.
 */
function sandiContoh(): string | null {
  const dariEnv = process.env.SEED_PASSWORD;
  if (dariEnv && dariEnv.length >= 8) return buatHashSandi(dariEnv);
  if (process.env.NODE_ENV === "production") return null;
  return buatHashSandi("nurahome123");
}

export async function ensureSeeded() {
  const SANDI = sandiContoh();
  /**
   * Tanggal data contoh dibuat RELATIF terhadap hari ini.
   *
   * Sebelumnya semuanya ditulis mati di Mei 2026. Beberapa bulan kemudian
   * seluruh aplikasi tampak basi: "kunjungan berjalan" berjadwal empat bulan
   * lalu, dan tombol "Batalkan kunjungan" tidak pernah muncul karena batas
   * dua jam sebelum jadwal selalu sudah lewat — jadi jalur pembatalan tidak
   * pernah bisa dicoba sama sekali.
   */
  const hari = (selisih: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + selisih);
    return d.toISOString().slice(0, 10);
  };

  try {
    const existingServices = await db.select({ value: count() }).from(services);
    if (existingServices[0]?.value && existingServices[0].value > 0) {
      return { seeded: false, message: "Database already seeded" };
    }

    // 1. Seed Users (Patient, Providers, Admin)
    const [patientUser] = await db
      .insert(users)
      .values({
        name: "Budi Santoso",
        email: "budi.santoso@example.id",
        phone: "+62 812-3456-7890",
        phoneNormal: normalTelepon("+62 812-3456-7890"),
        passwordHash: SANDI,
        passwordUpdatedAt: new Date(),
        role: "PATIENT",
        dateOfBirth: "1982-05-14",
        gender: "Male",
        emergencyContactName: "Ratna Santoso (Spouse)",
        emergencyContactPhone: "+62 811-9876-5432",
        allergies: "Penicillin (mild rash)",
        medicalHistory: "Darah tinggi, terkontrol dengan Amlodipine",
        diabetesStatus: "No",
      })
      .returning();

    const [nurseUser1] = await db
      .insert(users)
      .values({
        name: "Ns. Ratna Dewi, S.Kep., CWCS",
        email: "ratna.cwcs@nurahomecare.id",
        phone: "+62 813-8899-1122",
        phoneNormal: normalTelepon("+62 813-8899-1122"),
        passwordHash: SANDI,
        passwordUpdatedAt: new Date(),
        role: "PROVIDER",
        dateOfBirth: "1989-11-20",
        gender: "Female",
      })
      .returning();

    const [nurseUser2] = await db
      .insert(users)
      .values({
        name: "Ns. Hendra Wijaya, S.Kep., Ners",
        email: "hendra.circumcision@nurahomecare.id",
        phone: "+62 815-7766-3344",
        phoneNormal: normalTelepon("+62 815-7766-3344"),
        passwordHash: SANDI,
        passwordUpdatedAt: new Date(),
        role: "PROVIDER",
        dateOfBirth: "1987-03-08",
        gender: "Male",
      })
      .returning();

    const [nurseUser3] = await db
      .insert(users)
      .values({
        name: "Ns. Dwi Lestari, S.Kep., Ners",
        email: "dwi.lestari@nurahomecare.id",
        phone: "+62 856-2211-8080",
        phoneNormal: normalTelepon("+62 856-2211-8080"),
        passwordHash: SANDI,
        passwordUpdatedAt: new Date(),
        role: "PROVIDER",
        dateOfBirth: "1994-06-23",
        gender: "Female",
      })
      .returning();

    await db.insert(users).values({
      name: "dr. Aris Pratama (Direktur Medis)",
      email: "admin@nurahomecare.id",
      phone: "+62 811-0000-9999",
      phoneNormal: normalTelepon("+62 811-0000-9999"),
      passwordHash: SANDI,
      passwordUpdatedAt: new Date(),
      role: "ADMIN",
      dateOfBirth: "1980-01-10",
      gender: "Male",
    });

    // 2. Seed Dependents (Mother for Wound Care, Son for Circumcision)
    const [motherDependent] = await db
      .insert(dependents)
      .values({
        patientId: patientUser.id,
        fullName: "Ibu Siti Aminah (ibu)",
        relationship: "Orang tua",
        dateOfBirth: "1956-08-19",
        gender: "Female",
        weightKg: 62,
        medicalNotes: "Diabetes melitus tipe 2, pemulihan setelah operasi ganti sendi lutut kanan",
      })
      .returning();

    const [sonDependent] = await db
      .insert(dependents)
      .values({
        patientId: patientUser.id,
        fullName: "Rafa Santoso (anak, 9 th)",
        relationship: "Anak",
        dateOfBirth: "2017-02-11",
        gender: "Male",
        weightKg: 29,
        medicalNotes: "Tidak ada alergi obat yang diketahui; anak usia sekolah, sehat",
      })
      .returning();

    // 3. Seed Addresses
    const [jatimulyoAddress, sawojajarAddress] = await db.insert(addresses).values([
      {
        userId: patientUser.id,
        label: "Rumah — Lowokwaru",
        fullAddress: "Jl. Bunga Coklat No. 18, RT 03/RW 05, Jatimulyo, Lowokwaru",
        city: "Kota Malang",
        postalCode: "65141",
        latitude: -7.9430,
        longitude: 112.6120,
        notes: "Pagar putih di sebelah apotek; satpam sudah diberi tahu ada kunjungan perawat.",
        isDefault: true,
      },
      {
        userId: patientUser.id,
        label: "Rumah orang tua — Sawojajar",
        fullAddress: "Jl. Danau Toba Blok C-7, Sawojajar, Kedungkandang",
        city: "Kota Malang",
        postalCode: "65139",
        latitude: -7.9743,
        longitude: 112.6624,
        notes: "Kamar Ibu Siti di lantai bawah, tidak perlu naik tangga.",
        isDefault: false,
      },
    ]).returning();

    // 4. Seed Services Catalog
    const insertedServices = await db
      .insert(services)
      .values([
        {
          slug: "post-op-wound-care",
          name: "Perawatan luka pasca operasi & ganti balut steril",
          category: "WOUND_CARE",
          description:
            "Pembersihan luka steril standar rumah sakit, pemeriksaan jahitan atau sayatan, pemasangan balutan hidrokoloid/foam antimikroba, dan penanganan rembesan cairan luka — semuanya di rumah.",
          durationMinutes: 45,
          basePriceIdr: 350000,
          // SEMENTARA — menunggu tarif bahan yang disetujui.
          suppliesFeeIdr: 55000,
          requiredEquipment:
            "Set ganti balut steril, NaCl 0,9%, balutan perak/hidrokoloid antimikroba, kasa steril, kantong limbah medis",
          preparationInstructions:
            "Siapkan tempat yang terang di dekat tempat tidur atau sofa pasien. Jangan buka balutan yang sekarang sebelum perawat datang.",
          eligibilityCriteria:
            "Luka jahitan operasi (tulang, caesar, perut, jantung) yang tidak sedang berdarah menyembur.",
          followUpRecommendations: "Ganti balut rutin tiap 3–4 hari sampai luka menutup sempurna.",
          active: true,
        },
        {
          slug: "diabetic-ulcer-care",
          name: "Perawatan luka diabetes & luka kronis (debridement)",
          category: "WOUND_CARE",
          description:
            "Perawatan luka diabetes oleh perawat bersertifikat CWCS. Termasuk pengangkatan jaringan mati secara bertahap, cara mengurangi tumpuan berat pada kaki, dan balutan dengan kelembapan terjaga.",
          durationMinutes: 60,
          basePriceIdr: 420000,
          // SEMENTARA — menunggu tarif bahan yang disetujui.
          suppliesFeeIdr: 75000,
          requiredEquipment:
            "Set luka CWCS, balutan modern alginat/foam, pemeriksaan nadi dengan doppler, penggaris ukur luka, busa pengurang tumpuan",
          preparationInstructions:
            "Kalau ada, siapkan hasil gula darah terakhir. Pastikan pasien sudah berbaring dengan nyaman.",
          eligibilityCriteria: "Luka kaki diabetes, luka karena aliran darah balik, atau luka pembuluh arteri derajat I–III.",
          followUpRecommendations: "Ganti balut tiap 3 hari tanpa terlewat, disertai pemantauan gula darah.",
          active: true,
        },
        {
          slug: "pressure-injury-care",
          name: "Perawatan & pencegahan luka tekan (dekubitus)",
          category: "WOUND_CARE",
          description:
            "Penanganan luka tekan di tulang ekor, tumit, atau pangkal paha untuk lansia yang berbaring lama. Termasuk balutan silikon dan pendampingan cara mengubah posisi bagi keluarga yang merawat.",
          durationMinutes: 55,
          basePriceIdr: 380000,
          // SEMENTARA — menunggu tarif bahan yang disetujui.
          suppliesFeeIdr: 65000,
          requiredEquipment:
            "Balutan silikon berlapis untuk tulang ekor, krim pelindung kulit, hidrogel, alat debridement steril",
          preparationInstructions: "Selama tindakan pasien akan dimiringkan perlahan ke samping.",
          eligibilityCriteria: "Luka tekan derajat 1 sampai 3, atau lansia berbaring lama yang berisiko tinggi.",
          followUpRecommendations: "Ubah posisi tiap 2 jam; perawat kontrol tiap 4 hari.",
          active: true,
        },
        {
          slug: "pediatric-circumcision-klamp",
          name: "Sunat anak di rumah (Super-Ring / Smart Klamp)",
          category: "CIRCUMCISION",
          description:
            "Sunat anak tanpa jahitan di rumah sendiri. Biusnya disemprot tanpa jarum, dan memakai Super-Ring/Smart Klamp steril sehingga anak tetap bisa memakai celana dan mandi seperti biasa.",
          durationMinutes: 60,
          basePriceIdr: 1650000,
          // SEMENTARA — menunggu tarif bahan yang disetujui.
          suppliesFeeIdr: 0,
          requiredEquipment:
            "Alat Smart Klamp / Super-Ring steril sekali pakai, bius semprot tanpa jarum, perlengkapan penenang anak, paket obat setelah tindakan",
          preparationInstructions:
            "Anak dimandikan dengan air hangat dan sabun lembut sebelum perawat datang. Siapkan celana longgar atau sarung sunat.",
          eligibilityCriteria: "Anak laki-laki sehat usia 1–16 tahun, tanpa gangguan pembekuan darah yang belum tertangani.",
          followUpRecommendations: "Sudah termasuk kontrol hari ke-5 untuk memeriksa cincin/klem.",
          active: true,
        },
        {
          slug: "adult-circumcision-laser",
          name: "Sunat dewasa di rumah (laser bipolar)",
          category: "CIRCUMCISION",
          description:
            "Sunat dewasa di rumah, tertutup dan steril, dikerjakan perawat laki-laki berpengalaman dengan teknik laser bipolar sehingga perdarahannya minimal.",
          durationMinutes: 75,
          basePriceIdr: 2250000,
          // SEMENTARA — menunggu tarif bahan yang disetujui.
          suppliesFeeIdr: 0,
          requiredEquipment:
            "Alat kauter bipolar portabel, duk operasi steril, bius lokal, benang jahit yang menyerap sendiri, paket pemulihan lengkap",
          preparationInstructions:
            "Rapikan rambut kemaluan sehari sebelumnya. Istirahat 24–48 jam setelah tindakan.",
          eligibilityCriteria: "Laki-laki usia 17 tahun ke atas, dengan alasan medis, agama, maupun kebersihan.",
          followUpRecommendations: "Konsultasi lewat telepon di hari ke-2; perawat datang memeriksa balutan di hari ke-4.",
          active: true,
        },
      ])
      .returning();

    // 5. Seed Providers
    const insertedProviders = await db
      .insert(providers)
      .values([
        {
          userId: nurseUser1.id,
          fullName: "Ns. Ratna Dewi, S.Kep., CWCS",
          licenseNumber: "12045892341",
          specialty: "Perawat luka bersertifikat CWCS — luka diabetes & luka operasi",
          yearsExperience: 9,
          bio: "Mantan perawat penanggung jawab ICU dan klinik luka di RSUD Dr. Saiful Anwar, Malang. Bersertifikat terapi tekanan negatif dan balutan modern lembap-seimbang.",
          serviceAreaCity: "Kota Malang & Kota Batu",
          serviceRadiusKm: 15,
          ratingAvg: 4.96,
          completedVisits: 342,
          verifiedStatus: "TERVERIFIKASI",
          sipNumber: "503/SIPP/0284/35.73.302/2026",
          sipBerlakuSampai: hari(540),
          sipDiterbitkanOleh: "Dinas Kesehatan Kota Malang",
          verificationSubmittedAt: new Date(Date.now() - 40 * 86400000),
          verifiedAt: new Date(Date.now() - 38 * 86400000),
          verifiedByName: "dr. Aris Pratama (Direktur Medis)",
          verifiedSumber: "Portal KTKI / SATUSEHAT SDMK",
          availableHours: "07:00 - 20:00",
          isAvailableNow: true,
        },
        {
          userId: nurseUser2.id,
          fullName: "Ns. Hendra Wijaya, S.Kep., Ners",
          licenseNumber: "14098234102",
          specialty: "Perawat sunat anak & dewasa, berpengalaman",
          yearsExperience: 11,
          bio: "Sudah menangani lebih dari 1.200 sunat di rumah dengan bius tanpa jarum dan metode Super-Ring/Smart Klamp. Dikenal sabar dan pandai menenangkan anak.",
          serviceAreaCity: "Kota Malang, Singosari & Kepanjen",
          serviceRadiusKm: 20,
          ratingAvg: 4.98,
          completedVisits: 518,
          verifiedStatus: "TERVERIFIKASI",
          sipNumber: "503/SIPP/0311/35.73.302/2025",
          /**
           * Sengaja habis 45 hari lagi, supaya jalur peringatan SIP
           * mendekati kedaluwarsa benar-benar terlihat di layar — bukan
           * jalur yang hanya ada di kode dan tidak pernah dicoba.
           */
          sipBerlakuSampai: hari(45),
          sipDiterbitkanOleh: "Dinas Kesehatan Kota Malang",
          verificationSubmittedAt: new Date(Date.now() - 300 * 86400000),
          verifiedAt: new Date(Date.now() - 297 * 86400000),
          verifiedByName: "dr. Aris Pratama (Direktur Medis)",
          verifiedSumber: "Surat/berkas SIP dari Dinkes",
          availableHours: "08:00 - 19:00",
          isAvailableNow: true,
        },
        /**
         * Perawat ketiga: sudah mengajukan, BELUM diverifikasi.
         *
         * Ada supaya antrean verifikasi admin tidak kosong pada pemasangan
         * baru. Layar yang selalu kosong tidak pernah ketahuan rusaknya.
         * Ia tidak dipasangkan ke satu pun kunjungan — memang belum boleh.
         */
        {
          userId: nurseUser3.id,
          fullName: "Ns. Dwi Lestari, S.Kep., Ners",
          licenseNumber: "16072551903",
          specialty: "Perawat luka & stoma",
          yearsExperience: 6,
          bio: "Perawat ruang bedah RS swasta di Malang, mengambil kunjungan rumah di luar jam dinas.",
          serviceAreaCity: "Kota Malang & Singosari",
          serviceRadiusKm: 12,
          ratingAvg: 0,
          completedVisits: 0,
          verifiedStatus: "MENUNGGU_TINJAUAN",
          sipNumber: "503/SIPP/0402/35.73.302/2026",
          sipBerlakuSampai: hari(700),
          sipDiterbitkanOleh: "Dinas Kesehatan Kota Malang",
          verificationSubmittedAt: new Date(Date.now() - 2 * 86400000),
          availableHours: "16:00 - 21:00",
          isAvailableNow: false,
        },
      ])
      .returning();

    /**
     * Berkas izin. Yang disimpan di sini adalah RIWAYAT, bukan keadaan
     * sekarang saja — kalau suatu hari dipersoalkan "apakah izinnya berlaku
     * pada tanggal kunjungan itu", yang menjawab adalah tabel ini.
     */
    await db.insert(providerDocuments).values(
      insertedProviders.flatMap((p) => [
        {
          providerId: p.id,
          jenis: "STR",
          fileUrl: `/berkas/str-${p.id}.pdf`,
          nomor: p.licenseNumber,
        },
        {
          providerId: p.id,
          jenis: "SIP",
          fileUrl: `/berkas/sip-${p.id}.pdf`,
          nomor: p.sipNumber,
          berlakuSampai: p.sipBerlakuSampai,
        },
        { providerId: p.id, jenis: "KTP", fileUrl: `/berkas/ktp-${p.id}.jpg` },
      ])
    );

    // 6. Seed Active & Past Bookings
    const [activeWoundBooking] = await db
      .insert(bookings)
      .values({
        bookingCode: "NHC-2026-8841",
        patientId: patientUser.id,
        patientName: "Budi Santoso",
        dependentName: motherDependent.fullName,
        serviceId: insertedServices[1].id, // Diabetic Foot Ulcer & Chronic Wound Care
        serviceName: insertedServices[1].name,
        serviceCategory: "WOUND_CARE",
        providerId: insertedProviders[0].id,
        providerName: insertedProviders[0].fullName,
        addressId: sawojajarAddress.id,
        addressText: "Jl. Danau Toba Blok C-7, Sawojajar, Kedungkandang, Kota Malang",
        scheduledDate: hari(0),
        scheduledTimeSlot: "10:00 - 11:00 WIB",
        status: "DIBAYAR",
        basePriceIdr: 420000,
        distanceFeeIdr: 15000,
        suppliesFeeIdr: 75000,
        emergencyFeeIdr: 0,
        totalPriceIdr: 510000,
        paymentMethod: "QRIS / GoPay",
        paymentStatus: "LUNAS",
        triageRedFlag: false,
        triageNotes: "Tidak ada demam maupun perdarahan yang tak terkendali. Rembesan cairan bening sedang.",
      })
      .returning();

    const [circumcisionBooking] = await db
      .insert(bookings)
      .values({
        bookingCode: "NHC-2026-8890",
        patientId: patientUser.id,
        patientName: "Budi Santoso",
        dependentName: sonDependent.fullName,
        serviceId: insertedServices[3].id, // Pediatric Home Circumcision
        serviceName: insertedServices[3].name,
        serviceCategory: "CIRCUMCISION",
        // Permintaan yang BELUM ditinjau: belum ada perawatnya, dan semua
        // angkanya nol. Nol di sini berarti "belum dihitung" — layar memang
        // menampilkannya begitu, bukan menampilkan tarif tebakan.
        providerId: null,
        providerName: null,
        addressId: jatimulyoAddress.id,
        addressText: "Jl. Bunga Coklat No. 18, Jatimulyo, Lowokwaru, Kota Malang",
        scheduledDate: hari(3),
        scheduledTimeSlot: "09:00 - 10:30 WIB",
        status: "MENUNGGU_TINJAUAN",
        basePriceIdr: 0,
        distanceFeeIdr: 0,
        suppliesFeeIdr: 0,
        emergencyFeeIdr: 0,
        totalPriceIdr: 0,
        paymentMethod: "-",
        paymentStatus: "BELUM",
        triageRedFlag: false,
        triageNotes: "Anak laki-laki 9 tahun, sehat. Diminta bius tanpa jarum.",
      })
      .returning();

    // Dua kunjungan yang SUDAH SELESAI untuk Ns. Ratna.
    //
    // Tanpa ini portal perawat menampilkan "Rp 0 dari 0 kunjungan" tepat di
    // sebelah "342 kunjungan · 4,96 ★" — dan pembaca menyimpulkan
    // perhitungan honornya rusak, padahal memang belum ada data. Panel
    // honor baru bisa dinilai kalau ada yang bisa dihitung.
    await db.insert(bookings).values([
      {
        bookingCode: "NHC-2026-8712",
        patientId: patientUser.id,
        patientName: "Budi Santoso",
        dependentName: motherDependent.fullName,
        serviceId: insertedServices[1].id,
        serviceName: insertedServices[1].name,
        serviceCategory: "WOUND_CARE",
        providerId: insertedProviders[0].id,
        providerName: insertedProviders[0].fullName,
        addressId: sawojajarAddress.id,
        addressText: "Jl. Danau Toba Blok C-7, Sawojajar, Kedungkandang, Kota Malang",
        scheduledDate: hari(-7),
        scheduledTimeSlot: "10:00 - 11:00 WIB",
        status: "SELESAI",
        basePriceIdr: 420000,
        distanceFeeIdr: 15000,
        suppliesFeeIdr: 75000,
        emergencyFeeIdr: 0,
        totalPriceIdr: 510000,
        paymentMethod: "QRIS / GoPay",
        paymentStatus: "LUNAS",
        triageRedFlag: false,
        triageNotes: "Ganti balut rutin. Tidak ada tanda infeksi.",
      },
      {
        bookingCode: "NHC-2026-8756",
        patientId: patientUser.id,
        patientName: "Budi Santoso",
        dependentName: motherDependent.fullName,
        serviceId: insertedServices[1].id,
        serviceName: insertedServices[1].name,
        serviceCategory: "WOUND_CARE",
        providerId: insertedProviders[0].id,
        providerName: insertedProviders[0].fullName,
        addressId: sawojajarAddress.id,
        addressText: "Jl. Danau Toba Blok C-7, Sawojajar, Kedungkandang, Kota Malang",
        scheduledDate: hari(-4),
        scheduledTimeSlot: "10:00 - 11:00 WIB",
        status: "SELESAI",
        basePriceIdr: 420000,
        distanceFeeIdr: 15000,
        suppliesFeeIdr: 75000,
        emergencyFeeIdr: 0,
        totalPriceIdr: 510000,
        paymentMethod: "QRIS / GoPay",
        paymentStatus: "LUNAS",
        triageRedFlag: false,
        triageNotes: "Jaringan mati berkurang. Luka membaik.",
      },
    ]);

    /* Satu permintaan pada tahap DITAWARKAN, lengkap dengan rincian
       penawarannya. Tanpa ini layar persetujuan pasien — bagian yang paling
       menentukan di seluruh alur — tidak pernah bisa dilihat sampai ada
       orang yang menjalani semua langkah sebelumnya secara manual. */
    const [pesananDitawarkan] = await db
      .insert(bookings)
      .values({
        bookingCode: "NHC-2026-8901",
        patientId: patientUser.id,
        patientName: "Budi Santoso",
        dependentName: motherDependent.fullName,
        serviceId: insertedServices[1].id,
        serviceName: insertedServices[1].name,
        serviceCategory: "WOUND_CARE",
        providerId: insertedProviders[0].id,
        providerName: insertedProviders[0].fullName,
        quotedByProviderId: insertedProviders[0].id,
        quotedByProviderName: insertedProviders[0].fullName,
        quotedAt: new Date(),
        reviewStartedAt: new Date(),
        quoteRound: 1,
        reviewFindings:
          "Dari foto, dasar luka sudah sebagian merah muda tapi masih ada jaringan mati kekuningan di tepi bawah, dan rembesannya menembus perban. Saya menyiapkan balutan perak antimikroba — bukan foam biasa — karena rembesan sebanyak itu disertai jaringan mati biasanya berarti jumlah kuman di permukaan luka masih tinggi.",
        addressId: sawojajarAddress.id,
        addressText: "Jl. Danau Toba Blok C-7, Sawojajar, Kedungkandang, Kota Malang",
        scheduledDate: hari(2),
        scheduledTimeSlot: "13:00 - 14:00 WIB",
        status: "DITAWARKAN",
        basePriceIdr: 420000,
        distanceFeeIdr: 15000,
        suppliesFeeIdr: 170000,
        emergencyFeeIdr: 0,
        totalPriceIdr: 605000,
        paymentMethod: "-",
        paymentStatus: "BELUM",
        triageRedFlag: false,
        triageNotes: "Ganti balut lanjutan; tidak ada demam.",
      })
      .returning();

    await db.insert(quoteItems).values([
      {
        bookingId: pesananDitawarkan.id,
        kind: "JASA",
        label: insertedServices[1].name,
        qty: 1,
        unitPriceIdr: 420000,
        fromCatalog: true,
        originalUnitPriceIdr: 420000,
        quoteRound: 1,
      },
      {
        bookingId: pesananDitawarkan.id,
        kind: "BAHAN",
        label: "Paket bahan habis pakai (set standar layanan)",
        qty: 1,
        unitPriceIdr: 75000,
        fromCatalog: true,
        originalUnitPriceIdr: 75000,
        quoteRound: 1,
      },
      {
        // Item yang DITAMBAHKAN perawat — beserta alasannya, sebagaimana
        // diwajibkan. Inilah yang membuat penawaran bisa ditinjau, bukan
        // sekadar diterima.
        bookingId: pesananDitawarkan.id,
        kind: "BAHAN",
        label: "Balutan perak antimikroba",
        qty: 1,
        unitPriceIdr: 95000,
        fromCatalog: false,
        reason:
          "Rembesan menembus perban dan masih ada jaringan mati; foam biasa tidak cukup menahan kuman di permukaan luka.",
        quoteRound: 1,
      },
      {
        bookingId: pesananDitawarkan.id,
        kind: "JARAK",
        label: "Perjalanan — Dalam kota (4,8 km)",
        qty: 1,
        unitPriceIdr: 15000,
        fromCatalog: true,
        originalUnitPriceIdr: 15000,
        quoteRound: 1,
      },
    ]);

    /* Dua testimoni contoh, ditulis untuk memperagakan alurnya.
       Keduanya menunjuk kunjungan yang benar-benar ada di data ini, dan
       salah satunya sengaja bernilai rendah — supaya panel admin dan panel
       nilai perawat bisa dilihat dalam keadaan yang tidak semuanya bagus.
       Data contoh yang semuanya bintang lima tidak menguji apa pun. */
    const pesananSelesai = (await db.select().from(bookings)).filter(
      (b) => b.status === "SELESAI"
    );
    if (pesananSelesai.length >= 2) {
      const [a, b] = pesananSelesai;
      await db.insert(testimoni).values([
        {
          bookingId: a.id,
          patientId: patientUser.id,
          patientName: "Budi Santoso",
          providerId: insertedProviders[0].id,
          providerName: insertedProviders[0].fullName,
          serviceName: a.serviceName,
          wilayah: "Sawojajar",
          bintang: 5,
          nilaiKetepatanWaktu: 5,
          nilaiKeterampilan: 5,
          nilaiKebersihan: 5,
          isiAsli:
            "Ns. Ratna telaten sekali. Ibu saya tidak perlu lagi menahan sakit di jalan menuju poli tiap tiga hari. Alat-alatnya dibuka di depan kami, sampahnya dibawa pulang.",
          isiTayang:
            "Ns. Ratna telaten sekali. Ibu saya tidak perlu lagi menahan sakit di jalan menuju poli tiap tiga hari. Alat-alatnya dibuka di depan kami, sampahnya dibawa pulang.",
          izinTayang: "BOLEH_SAMARAN",
          namaTayang: "B. S. — Sawojajar",
          statusTinjauan: "TAYANG",
          keluhan: false,
          statusKePerawat: "DITERUSKAN",
          diteruskanPada: new Date(),
        },
        {
          bookingId: b.id,
          patientId: patientUser.id,
          patientName: "Budi Santoso",
          providerId: insertedProviders[0].id,
          providerName: insertedProviders[0].fullName,
          serviceName: b.serviceName,
          wilayah: "Sawojajar",
          bintang: 3,
          nilaiKetepatanWaktu: 2,
          nilaiKeterampilan: 4,
          nilaiKebersihan: 5,
          isiAsli:
            "Perawatannya sendiri bagus, tapi datangnya telat hampir 40 menit tanpa kabar. Ibu saya sudah duduk menunggu dengan balutan dibuka.",
          isiTayang:
            "Perawatannya sendiri bagus, tapi datangnya telat hampir 40 menit tanpa kabar. Ibu saya sudah duduk menunggu dengan balutan dibuka.",
          izinTayang: "JANGAN_TAYANG",
          namaTayang: "",
          statusTinjauan: "DITINJAU",
          keluhan: false,
          // Sengaja BELUM disortir — supaya panel penyortiran admin ada
          // isinya sejak awal, dan perawat melihat "1 masukan sedang
          // ditinjau admin" tanpa harus ada yang mengisi manual dulu.
          statusKePerawat: "BARU",
          catatanUntukPerawat:
            "Mohon kabari kalau terlambat, walau hanya lewat pesan singkat. Keluarga sudah membuka balutan menunggu kedatangan.",
        },
      ]);
    }

    /* Laporan tindakan untuk kunjungan yang sudah selesai, supaya layar
       "hasil kunjungan" milik pasien ada isinya sejak awal. */
    const selesai = await db.select().from(bookings);
    const kunjunganSelesai = selesai.find((b) => b.status === "SELESAI");
    if (kunjunganSelesai) {
      await db.insert(visitReports).values({
        bookingId: kunjunganSelesai.id,
        providerId: insertedProviders[0].id,
        providerName: insertedProviders[0].fullName,
        providerLicense: insertedProviders[0].licenseNumber,
        finishedAt: new Date(),
        whatWasDone:
          "Luka dibilas dengan cairan steril hangat, jaringan mati kekuningan di tepi diangkat sedikit demi sedikit tanpa melukai jaringan baru, lalu dipasang balutan foam bertepi silikon.",
        woundCondition:
          "Dasar luka sekarang 85% merah muda sehat. Kulit di sekitarnya utuh, tidak lembek. Ibu Siti mengatakan nyerinya 2 dari 10.",
        homeInstructions:
          "Balutan jangan sampai basah saat mandi — tutup dengan plastik. Kaki kanan jangan dipakai menumpu berat badan; pakai sandal khusus yang sudah diberikan. Gula darah tetap dipantau seperti biasa.",
        warningSigns:
          "Segera hubungi kami atau ke IGD bila muncul demam, nyeri makin hebat, luka berbau, atau balutan basah kemerahan.",
        nextVisitSuggestion: "3 hari lagi",
        suppliesUsed:
          "Set luka steril, NaCl 0,9% 500 ml, foam tepi silikon 10x10 cm",
      });

      // Foto sebelum & sesudah untuk kunjungan itu. Gambar kecil buatan
      // (SVG) supaya tidak ada berkas besar di dalam repositori.
      const gambar = (teks: string, warna: string) =>
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="${warna}"/><text x="160" y="126" font-family="sans-serif" font-size="20" fill="#3a1f1f" text-anchor="middle">${teks}</text></svg>`
        );
      await db.insert(taskPhotos).values([
        {
          bookingId: kunjunganSelesai.id,
          providerId: insertedProviders[0].id,
          providerName: insertedProviders[0].fullName,
          uploadedByRole: "PERAWAT",
          photoType: "WOUND_BEFORE",
          imageUrl: gambar("contoh: luka sebelum", "#e8c4b8"),
          caption: "Luka sebelum tindakan",
        },
        {
          bookingId: kunjunganSelesai.id,
          providerId: insertedProviders[0].id,
          providerName: insertedProviders[0].fullName,
          uploadedByRole: "PERAWAT",
          photoType: "WOUND_AFTER",
          imageUrl: gambar("contoh: luka sesudah", "#f0d9cf"),
          caption: "Luka setelah tindakan",
        },
      ]);
    }

    // 7. Seed Structured Wound Assessment for Ibu Siti Aminah
    await db.insert(woundAssessments).values({
      bookingId: activeWoundBooking.id,
      patientId: patientUser.id,
      woundLocation: "Telapak kaki kanan, bagian depan",
      woundDuration: "3 minggu",
      causeOfWound: "Luka tekan akibat saraf kaki diabetes",
      lengthCm: 3.2,
      widthCm: 2.1,
      depthCm: 0.4,
      tissueType: "80% Granulation (Healthy Red), 20% Slough",
      exudateAmount: "Sedang",
      exudateType: "Bening kekuningan",
      odor: "None",
      periwoundCondition: "Mild Erythema (<1 cm margin)",
      painScore: 3,
      infectionSigns: false,
      fever: false,
      bleeding: "None",
    });

    // 8. Seed Circumcision Pre-Assessment for Rafa Santoso
    await db.insert(circumcisionAssessments).values({
      bookingId: circumcisionBooking.id,
      patientId: patientUser.id,
      patientAgeYears: 9,
      weightKg: 29.0,
      methodPreferred: "Modern Super-Ring / Smart Klamp (Needle-Free)",
      bleedingDisorders: "None (Normal clotting history)",
      allergies: "None",
      anatomicalNotes: "Kulup agak sempit tapi masih wajar untuk usianya; cocok memakai Super-Ring.",
      guardianName: "Budi Santoso (Father)",
      guardianPhone: "+62 812-3456-7890",
      consentGiven: true,
    });

    // 9. Seed Clinical Note from previous visit
    await db.insert(clinicalNotes).values({
      bookingId: activeWoundBooking.id,
      providerId: insertedProviders[0].id,
      providerName: insertedProviders[0].fullName,
      patientId: patientUser.id,
      assessmentSummary:
        "Dasar luka 80% berisi jaringan baru berwarna merah muda sehat; sisa jaringan mati kekuningan 20% sudah dibersihkan secara bertahap. Kulit di sekitar luka utuh setelah diberi lapisan pelindung.",
      woundDimensions: "3,2 x 2,1 x 0,4 cm (luas 6,72 cm²)",
      exudateLevel: "Cairan bening, sedang",
      proceduresPerformed:
        "Pembilasan steril dengan NaCl 0,9% hangat, pengangkatan jaringan mati yang sudah lepas, lalu pemberian cadexomer iodine dan balutan foam.",
      suppliesUsed: "Set luka steril, NaCl 0,9% 500 ml, pasta cadexomer iodine, foam tepi silikon 10x10 cm",
      painScorePost: 2,
      homecareInstructions:
        "Jaga balutan tetap kering saat mandi. Jangan menumpu berat langsung pada kaki kanan; pakai sandal khusus yang sudah diberikan. Segera lapor bila muncul demam atau nyeri berdenyut.",
      nextFollowUpDate: hari(3),
      aiAssistedDraft: true,
      verifiedByProvider: true,
    });

    // 10. Seed Wound Healing Timeline (Day 1 -> Day 4 -> Day 7 -> Day 14)
    await db.insert(woundTimelineEntries).values([
      {
        patientId: patientUser.id,
        bookingId: activeWoundBooking.id,
        visitDayLabel: "Hari ke-1 — kunjungan pertama",
        dateRecorded: hari(-14),
        lengthCm: 4.0,
        widthCm: 2.4,
        areaSqCm: 9.6,
        painScore: 7,
        exudateStatus: "Cairan bening banyak, berserat",
        dressingType: "Silver Alginate + Absorbent Foam",
        providerName: "Ns. Ratna Dewi, S.Kep., CWCS",
        notes: "Kunjungan pertama. Jaringan mati kekuningan diangkat cukup banyak. Keluarga diajari cara mengurangi tumpuan berat pada kaki.",
      },
      {
        patientId: patientUser.id,
        bookingId: activeWoundBooking.id,
        visitDayLabel: "Hari ke-4 — ganti balut pertama",
        dateRecorded: hari(-11),
        lengthCm: 3.6,
        widthCm: 2.2,
        areaSqCm: 7.92,
        painScore: 5,
        exudateStatus: "Cairan bening, sedang",
        dressingType: "Hydrofiber Silver + Silicone Border",
        providerName: "Ns. Ratna Dewi, S.Kep., CWCS",
        notes: "Jaringan mati berkurang separuh. Kemerahan di sekitar luka mereda. Pasien nyaman dengan cara tumpuan yang baru.",
      },
      {
        patientId: patientUser.id,
        bookingId: activeWoundBooking.id,
        visitDayLabel: "Hari ke-8 — evaluasi tengah perawatan",
        dateRecorded: hari(-7),
        lengthCm: 3.2,
        widthCm: 2.1,
        areaSqCm: 6.72,
        painScore: 3,
        exudateStatus: "Cairan bening, sedang ke sedikit",
        dressingType: "Cadexomer Iodine + Foam Border",
        providerName: "Ns. Ratna Dewi, S.Kep., CWCS",
        notes: "Dasar luka 80% sudah merah segar. Kulit baru mulai tumbuh dari tepi luka.",
      },
      {
        patientId: patientUser.id,
        bookingId: activeWoundBooking.id,
        visitDayLabel: "Hari ke-12 — kulit baru terus tumbuh",
        dateRecorded: hari(-3),
        lengthCm: 2.1,
        widthCm: 1.4,
        areaSqCm: 2.94,
        painScore: 1,
        exudateStatus: "Scant / Minimal",
        dressingType: "Thin Hydrocolloid Protective Film",
        providerName: "Ns. Ratna Dewi, S.Kep., CWCS",
        notes: "Luas luka menyusut 70% dibanding awal. Diperkirakan menutup penuh dalam 7–10 hari.",
      },
    ]);

    // 11. Seed Reviews
    await db.insert(reviews).values([
      {
        bookingId: activeWoundBooking.id,
        patientName: "Budi Santoso (Family of Ibu Siti)",
        providerId: insertedProviders[0].id,
        providerName: insertedProviders[0].fullName,
        serviceName: "Perawatan luka diabetes & luka kronis (debridement)",
        overallRating: 5,
        comment:
          "Ns. Ratna telaten sekali dan tidak terburu-buru. Ibu saya tidak perlu lagi menahan sakit di jalan menuju poli tiap tiga hari. Luka diabetes di kakinya sembuh 70% dalam dua minggu.",
      },
      {
        bookingId: circumcisionBooking.id,
        patientName: "Keluarga Hendrawan",
        providerId: insertedProviders[1].id,
        providerName: insertedProviders[1].fullName,
        serviceName: "Sunat anak di rumah (Super-Ring / Smart Klamp)",
        overallRating: 5,
        comment:
          "Anak kami yang berumur 8 tahun malah tertawa waktu dibius tanpa jarum oleh Ns. Hendra. Tindakannya 30 menit di rumah sambil nonton kartun, besoknya sudah jalan-jalan lagi.",
      },
    ]);

    // 12. Seed Notifications
    await db.insert(notifications).values([
      {
        userId: patientUser.id,
        title: "Perawat sedang menuju ke rumah — sekitar 14 menit lagi",
        message:
          "Ns. Ratna Dewi, CWCS sedang dalam perjalanan ke Jl. Danau Toba, Sawojajar untuk kunjungan perawatan luka Ibu Siti Aminah.",
        type: "BOOKING",
        read: false,
      },
      {
        userId: patientUser.id,
        title: "Pembayaran terverifikasi — pesanan NHC-2026-8890",
        message: "Pembayaran Rp 1.670.000 untuk sunat Rafa Santoso sudah diterima.",
        type: "PAYMENT",
        read: true,
      },
    ]);

    // 13. Seed Messages (Patient <-> Nurse Chat)
    await db.insert(messages).values([
      {
        bookingId: activeWoundBooking.id,
        senderName: "Ns. Ratna Dewi, CWCS",
        senderRole: "PROVIDER",
        content:
          "Selamat pagi Pak Budi, saya sudah berangkat menuju rumah Ibu Siti di Sawojajar. Perkiraan sampai pukul 09:50 WIB ya.",
      },
      {
        bookingId: activeWoundBooking.id,
        senderName: "Budi Santoso",
        senderRole: "PATIENT",
        content:
          "Selamat pagi Ns. Ratna, baik terima kasih. Kamar Ibu sudah kami siapkan dan gula darah pagi ini 128 mg/dL.",
      },
    ]);

    // 13.5 Seed Task Verification Photos (Arrival, Supplies, Wound Before/After)
    await db.insert(taskPhotos).values([
      {
        bookingId: activeWoundBooking.id,
        providerId: insertedProviders[0].id,
        providerName: insertedProviders[0].fullName,
        photoType: "ARRIVAL_CONFIRMATION",
        imageUrl:
          "data:image/svg+xml;base64," +
          btoa(
            `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><defs><linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0ea5e9'/><stop offset='1' stop-color='#0d9488'/></linearGradient></defs><rect width='400' height='300' fill='url(#bg)'/><circle cx='200' cy='120' r='35' fill='white' opacity='0.9'/><path d='M200 95 L200 145 M185 130 L200 145 L215 130' stroke='#0d9488' stroke-width='4' fill='none' stroke-linecap='round'/><text x='200' y='180' text-anchor='middle' fill='white' font-family='sans-serif' font-size='18' font-weight='bold'>📍 Nurse Arrived</text><text x='200' y='210' text-anchor='middle' fill='white' font-family='sans-serif' font-size='12'>Sawojajar, Kota Malang • 09:52 WIB</text><rect x='20' y='240' width='360' height='40' rx='8' fill='rgba(0,0,0,0.3)'/><text x='200' y='265' text-anchor='middle' fill='white' font-family='monospace' font-size='11'>GPS: -7.9743, 112.6624 | Terverifikasi</text></svg>`
          ),
        caption: "Tiba di rumah Sawojajar. Ibu pasien mengonfirmasi akses masuk.",
      },
      {
        bookingId: activeWoundBooking.id,
        providerId: insertedProviders[0].id,
        providerName: insertedProviders[0].fullName,
        photoType: "SUPPLY_VERIFICATION",
        imageUrl:
          "data:image/svg+xml;base64," +
          btoa(
            `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='#f0fdfa'/><rect x='60' y='50' width='280' height='180' rx='10' fill='white' stroke='#0d9488' stroke-width='2'/><text x='200' y='85' text-anchor='middle' fill='#0f766e' font-family='sans-serif' font-size='14' font-weight='bold'>STERILE WOUND KIT</text><circle cx='130' cy='140' r='22' fill='#ecfeff' stroke='#06b6d4' stroke-width='2'/><text x='130' y='146' text-anchor='middle' font-size='22'>🧴</text><circle cx='200' cy='140' r='22' fill='#ecfeff' stroke='#06b6d4' stroke-width='2'/><text x='200' y='146' text-anchor='middle' font-size='22'>🩹</text><circle cx='270' cy='140' r='22' fill='#ecfeff' stroke='#06b6d4' stroke-width='2'/><text x='270' y='146' text-anchor='middle' font-size='22'>✂️</text><text x='200' y='195' text-anchor='middle' fill='#0f766e' font-family='sans-serif' font-size='11'>NaCl 0.9% + Silver Hydrofiber + Foam Border</text><rect x='60' y='250' width='280' height='30' rx='6' fill='#10b981'/><text x='200' y='270' text-anchor='middle' fill='white' font-family='sans-serif' font-size='12' font-weight='bold'>✓ Factory Sealed • Lot #2026-05</text></svg>`
          ),
        caption: "Set perawatan luka steril masih tersegel pabrik, diperiksa sebelum dibuka.",
      },
      {
        bookingId: activeWoundBooking.id,
        providerId: insertedProviders[0].id,
        providerName: insertedProviders[0].fullName,
        photoType: "WOUND_BEFORE",
        imageUrl:
          "data:image/svg+xml;base64," +
          btoa(
            `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='#fef3c7'/><ellipse cx='200' cy='150' rx='90' ry='70' fill='#fde68a' stroke='#f59e0b' stroke-width='3'/><ellipse cx='200' cy='150' rx='55' ry='40' fill='#fef08a'/><ellipse cx='200' cy='150' rx='30' ry='22' fill='#ef4444' opacity='0.7'/><line x1='145' y1='90' x2='145' y2='210' stroke='#0f172a' stroke-width='1' stroke-dasharray='3'/><line x1='255' y1='90' x2='255' y2='210' stroke='#0f172a' stroke-width='1' stroke-dasharray='3'/><line x1='110' y1='150' x2='290' y2='150' stroke='#0f172a' stroke-width='1' stroke-dasharray='3'/><text x='200' y='255' text-anchor='middle' fill='#78350f' font-family='sans-serif' font-size='13' font-weight='bold'>Pre-Treatment: 3.2 x 2.1 cm</text><text x='200' y='278' text-anchor='middle' fill='#78350f' font-family='sans-serif' font-size='11'>20% Slough • Moderate Serous Exudate</text><rect x='10' y='10' width='140' height='28' rx='6' fill='#dc2626'/><text x='80' y='29' text-anchor='middle' fill='white' font-family='sans-serif' font-size='12' font-weight='bold'>🩹 WOUND BEFORE</text></svg>`
          ),
        caption: "Kondisi awal sebelum tindakan: luka diabetes 3,2 x 2,1 cm dengan 20% jaringan mati kekuningan.",
      },
      {
        bookingId: activeWoundBooking.id,
        providerId: insertedProviders[0].id,
        providerName: insertedProviders[0].fullName,
        photoType: "WOUND_AFTER",
        imageUrl:
          "data:image/svg+xml;base64," +
          btoa(
            `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='#f0fdf4'/><rect x='80' y='70' width='240' height='160' rx='16' fill='white' stroke='#10b981' stroke-width='3'/><rect x='100' y='90' width='200' height='120' rx='8' fill='#d1fae5'/><ellipse cx='200' cy='150' rx='50' ry='35' fill='#a7f3d0' stroke='#059669' stroke-width='2'/><text x='200' y='155' text-anchor='middle' fill='#047857' font-family='sans-serif' font-size='14' font-weight='bold'>✓ Protected</text><text x='200' y='250' text-anchor='middle' fill='#065f46' font-family='sans-serif' font-size='13' font-weight='bold'>Post-Treatment: Silver Foam Border Applied</text><text x='200' y='272' text-anchor='middle' fill='#065f46' font-family='sans-serif' font-size='11'>Cadexomer Iodine + Silicone Border Foam</text><rect x='250' y='10' width='140' height='28' rx='6' fill='#059669'/><text x='320' y='29' text-anchor='middle' fill='white' font-family='sans-serif' font-size='12' font-weight='bold'>✨ WOUND AFTER</text></svg>`
          ),
        caption: "Post-treatment: cadexomer iodine paste + silicone foam border dressing applied.",
      },
    ]);

    // 14. Seed Audit Logs
    await db.insert(auditLogs).values([
      {
        userId: nurseUser1.id,
        userRole: "PROVIDER",
        action: "CLINICAL_NOTE_SIGNED",
        resourceType: "clinical_notes",
        resourceId: "Booking #NHC-2026-8841",
        details: "Menandatangani catatan SOAP dan dokumentasi perkembangan luka Ibu Siti Aminah.",
      },
      {
        userId: patientUser.id,
        userRole: "PATIENT",
        action: "PAYMENT_CONFIRMED_WEBHOOK",
        resourceType: "bookings",
        resourceId: "NHC-2026-8841",
        details: "Memverifikasi bukti pembayaran QRIS sebesar Rp 510.000.",
      },
    ]);

    return { seeded: true, message: "Seeded complete clinical homecare data" };
  } catch (err) {
    console.error("Seed error:", err);
    return { seeded: false, message: String(err) };
  }
}
