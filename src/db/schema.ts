import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  doublePrecision,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  role: text("role").notNull().default("PATIENT"), // PATIENT | PROVIDER | ADMIN
  avatarUrl: text("avatar_url"),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  allergies: text("allergies"),
  medicalHistory: text("medical_history"),
  diabetesStatus: text("diabetes_status").default("No"),
  createdAt: timestamp("created_at").defaultNow().notNull(),

  /* ---- otentikasi (lihat logic/otentikasi.ts) ---- */

  /**
   * Bentuk `scrypt$N$r$p$garam$turunan`. Boleh kosong: akun perawat dibuat
   * admin lebih dulu, kata sandinya diisi sendiri oleh perawatnya.
   */
  passwordHash: text("password_hash"),
  passwordUpdatedAt: timestamp("password_updated_at"),

  /**
   * Nomor telepon yang sudah diseragamkan ke bentuk 62xxxxxxxxx.
   *
   * Kolom `phone` di atas menyimpan apa yang diketik orangnya, apa adanya,
   * karena itu yang dia kenali di layar. Yang dipakai MENCARI saat masuk
   * adalah kolom ini — tanpa penyeragaman, "0812-3456" dan "+62 812 3456"
   * menjadi dua akun berbeda, dan orangnya tidak bisa masuk ke akunnya
   * sendiri hanya karena mengetiknya dengan gaya lain.
   */
  phoneNormal: text("phone_normal"),

  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  /** AKTIF | NONAKTIF — dinonaktifkan, bukan dihapus; rekam kunjungannya harus tetap ada. */
  accountStatus: text("account_status").notNull().default("AKTIF"),
});

export const dependents = pgTable("dependents", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull(),
  fullName: text("full_name").notNull(),
  relationship: text("relationship").notNull(), // Child | Parent | Spouse | Other
  dateOfBirth: text("date_of_birth").notNull(),
  gender: text("gender").notNull(),
  weightKg: doublePrecision("weight_kg"),
  medicalNotes: text("medical_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const addresses = pgTable("addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  label: text("label").notNull(), // Home, Parents House, Office
  fullAddress: text("full_address").notNull(),
  city: text("city").notNull().default("Kota Malang"),
  postalCode: text("postal_code"),
  // Titik tengah Kota Malang (alun-alun), bukan Jakarta.
  latitude: doublePrecision("latitude").default(-7.9797),
  longitude: doublePrecision("longitude").default(112.6304),
  notes: text("notes"),
  isDefault: boolean("is_default").default(true),
});

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(), // WOUND_CARE | CIRCUMCISION
  description: text("description").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  basePriceIdr: integer("base_price_idr").notNull(),
  // Biaya bahan habis pakai per layanan, bukan angka mati di wizard.
  // Perawatan luka dan sirkumsisi memakai bahan yang sangat berbeda —
  // set steril dan balutan modern vs klamp sekali pakai. Satu angka
  // untuk keduanya selalu salah di salah satu sisi.
  suppliesFeeIdr: integer("supplies_fee_idr").notNull().default(0),
  requiredEquipment: text("required_equipment").notNull(),
  preparationInstructions: text("preparation_instructions").notNull(),
  eligibilityCriteria: text("eligibility_criteria").notNull(),
  followUpRecommendations: text("follow_up_recommendations").notNull(),
  active: boolean("active").default(true).notNull(),
});

export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fullName: text("full_name").notNull(),
  licenseNumber: text("license_number").notNull(), // STR / SIPP ID
  specialty: text("specialty").notNull(), // Certified Wound Care Specialist (CWCS) / Pediatric & Adult Circumcision Nurse
  yearsExperience: integer("years_experience").notNull(),
  bio: text("bio").notNull(),
  serviceAreaCity: text("service_area_city").notNull(),
  serviceRadiusKm: integer("service_radius_km").notNull().default(15),
  ratingAvg: doublePrecision("rating_avg").notNull().default(4.9),
  completedVisits: integer("completed_visits").notNull().default(0),
  /**
   * BELUM_DIAJUKAN | MENUNGGU_TINJAUAN | PERLU_PERBAIKAN | TERVERIFIKASI |
   * KEDALUWARSA | DIBEKUKAN — lihat logic/verifikasi.ts.
   *
   * Bawaannya sengaja BELUM_DIAJUKAN, bukan TERVERIFIKASI seperti dulu.
   * Nilai bawaan yang berbunyi "sudah diperiksa" berarti setiap perawat
   * baru memakai lencana yang tidak ada dasarnya sejak baris pertamanya
   * dibuat, dan pasien memutuskan memasukkan orang asing ke rumahnya
   * berdasarkan lencana itu.
   */
  verifiedStatus: text("verified_status").notNull().default("BELUM_DIAJUKAN"),

  /**
   * SIP / SIPP — izin BERPRAKTIK, terpisah dari STR di atas yang hanya
   * bukti TERDAFTAR. Inilah yang punya masa berlaku, dan inilah yang
   * sebenarnya menentukan boleh atau tidaknya seseorang merawat pasien.
   * Aplikasi ini dulu hanya menyimpan STR: menyimpan yang tidak pernah
   * kedaluwarsa, dan tidak menyimpan yang bisa.
   */
  sipNumber: text("sip_number"),
  sipBerlakuSampai: text("sip_berlaku_sampai"), // YYYY-MM-DD
  sipDiterbitkanOleh: text("sip_diterbitkan_oleh"),

  verificationSubmittedAt: timestamp("verification_submitted_at"),
  verifiedAt: timestamp("verified_at"),
  verifiedByName: text("verified_by_name"),
  /** Di mana nomornya dicocokkan. Wajib diisi untuk keputusan meluluskan. */
  verifiedSumber: text("verified_sumber"),
  verificationNote: text("verification_note"),

  availableHours: text("available_hours").notNull().default("08:00 - 20:00"),
  isAvailableNow: boolean("is_available_now").default(true).notNull(),
  avatarUrl: text("avatar_url"),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  bookingCode: text("booking_code").notNull().unique(),
  patientId: integer("patient_id").notNull(),
  patientName: text("patient_name").notNull(),
  dependentName: text("dependent_name"),
  serviceId: integer("service_id").notNull(),
  serviceName: text("service_name").notNull(),
  serviceCategory: text("service_category").notNull(),
  providerId: integer("provider_id"),
  providerName: text("provider_name"),
  // Acuan ke baris alamat, BUKAN hanya salinan teksnya.
  //
  // Sebelumnya pemesanan hanya menyimpan alamat sebagai teks bebas, dan
  // koordinatnya dicari dengan mencocokkan teks itu ke tabel addresses.
  // Teksnya tidak pernah sama persis — yang di pemesanan berakhiran
  // ", Kota Malang" dan tanpa RT/RW — sehingga pencocokan SELALU gagal dan
  // biaya jarak setiap pemesanan diam-diam jatuh ke tarif tengah. Salah
  // harga di setiap kunjungan, tanpa satu pun pesan galat.
  addressId: integer("address_id"),
  addressText: text("address_text").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTimeSlot: text("scheduled_time_slot").notNull(),
  // Alur hidup pemesanan. Sengaja ditulis lengkap di sini karena inilah
  // satu-satunya tempat urutannya terdokumentasi:
  //
  //   MENUNGGU_TINJAUAN  pasien mengirim permintaan + foto luka
  //   DITINJAU           perawat sedang menilai
  //   DITAWARKAN         perawat mengirim rincian bahan, tarif, dan jadwal
  //   DITOLAK_PASIEN     pasien menolak; kembali ke antrean perawat lain
  //   DISETUJUI          pasien setuju tarif + jadwal + informed consent
  //   DIBAYAR            pembayaran masuk; baru setelah ini perawat berangkat
  //   PERAWAT_BERANGKAT / PERAWAT_TIBA / DIKERJAKAN / SELESAI / DIBATALKAN
  //
  // Nama status memakai bahasa Indonesia karena nilai ini muncul di jejak
  // audit dan laporan yang dibaca orang, bukan hanya di kode.
  status: text("status").notNull().default("MENUNGGU_TINJAUAN"),

  // --- tahap tinjauan perawat ---
  // Waktu perawat mulai meninjau dan waktu penawaran dikirim. Dipisah supaya
  // terlihat berapa lama pasien menunggu jawaban.
  reviewStartedAt: timestamp("review_started_at"),
  quotedAt: timestamp("quoted_at"),
  quotedByProviderId: integer("quoted_by_provider_id"),
  quotedByProviderName: text("quoted_by_provider_name"),
  /** Penilaian perawat atas foto luka, ditulis untuk dibaca pasien. */
  reviewFindings: text("review_findings"),
  /** Berapa kali permintaan ini sudah ditawar dan ditolak. */
  quoteRound: integer("quote_round").notNull().default(0),
  /** Alasan pasien menolak penawaran sebelumnya — dibaca perawat berikutnya. */
  rejectionReason: text("rejection_reason"),
  /** Daftar perawat yang penawarannya sudah ditolak, dipisah koma. */
  rejectedProviderIds: text("rejected_provider_ids"),

  // --- persetujuan pasien ---
  approvedAt: timestamp("approved_at"),
  /** Nama yang diketik pasien sebagai tanda tangan. */
  approvedByName: text("approved_by_name"),
  basePriceIdr: integer("base_price_idr").notNull(),
  distanceFeeIdr: integer("distance_fee_idr").notNull().default(25000),
  suppliesFeeIdr: integer("supplies_fee_idr").notNull().default(45000),
  emergencyFeeIdr: integer("emergency_fee_idr").notNull().default(0),
  totalPriceIdr: integer("total_price_idr").notNull(),
  paymentMethod: text("payment_method").notNull().default("QRIS / GoPay"),
  /**
   * Bawaannya BELUM, bukan PAID.
   *
   * Sampai hari ini kolom ini berbawaan "PAID" — nilai yang bahkan tidak
   * dipakai di mana pun lagi (yang dipakai "BELUM" dan "LUNAS"). Alur
   * pembuatan pemesanan memang menyetelnya sendiri ke "BELUM", jadi
   * bawaannya tidak pernah terpakai; tapi bawaan yang artinya "sudah
   * dibayar" adalah ranjau yang menunggu satu jalur penyisipan baru yang
   * lupa mengisinya. Yang terjadi kemudian: perawat berangkat membawa
   * bahan yang dibelinya sendiri untuk kunjungan yang tidak pernah
   * dibayar.
   */
  paymentStatus: text("payment_status").notNull().default("BELUM"),
  triageRedFlag: boolean("triage_red_flag").default(false),
  triageNotes: text("triage_notes"),
  /**
   * Ditandai bila ada keluhan, sengketa biaya, atau proses hukum berjalan.
   * Selama true, tugas terjadwal TIDAK BOLEH menghapus foto atau menyentuh
   * status pemesanan ini — menghapus bukti saat perkaranya masih berjalan
   * merugikan pasien dan perawat sekaligus.
   */
  sengketa: boolean("sengketa").notNull().default(false),
  /** Catatan pendek dari tugas terjadwal, mis. "penawaran hangus otomatis". */
  catatanSistem: text("catatan_sistem"),
  /**
   * Kapan terakhir tugas terjadwal MENGINGATKAN orang tentang pemesanan ini.
   *
   * Tanpa kolom ini, tugas "permintaan menggantung" dan "kunjungan belum
   * ditutup" mengirim pemberitahuan yang sama setiap kali berjalan — tiap
   * jam, tanpa henti, ke pasien DAN admin. Pemberitahuan yang datang terus
   * berhenti dibaca, dan yang benar-benar penting ikut tenggelam bersamanya.
   */
  terakhirDidorong: timestamp("terakhir_didorong"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const woundAssessments = pgTable("wound_assessments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  patientId: integer("patient_id").notNull(),
  woundLocation: text("wound_location").notNull(),
  woundDuration: text("wound_duration").notNull(),
  causeOfWound: text("cause_of_wound").notNull(),
  lengthCm: doublePrecision("length_cm").notNull(),
  widthCm: doublePrecision("width_cm").notNull(),
  depthCm: doublePrecision("depth_cm").notNull().default(0.3),
  tissueType: text("tissue_type").notNull(), // Granulation | Slough | Necrotic | Epithelializing
  exudateAmount: text("exudate_amount").notNull(), // None | Scant | Moderate | Heavy
  exudateType: text("exudate_type").notNull(), // Serous | Sanguineous | Purulent
  odor: text("odor").notNull().default("None"),
  periwoundCondition: text("periwound_condition").notNull(), // Intact | Erythema / Redness | Macerated
  painScore: integer("pain_score").notNull(), // 0 - 10
  infectionSigns: boolean("infection_signs").default(false).notNull(),
  fever: boolean("fever").default(false).notNull(),
  bleeding: text("bleeding").default("Minimal").notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const circumcisionAssessments = pgTable("circumcision_assessments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  patientId: integer("patient_id").notNull(),
  patientAgeYears: integer("patient_age_years").notNull(),
  weightKg: doublePrecision("weight_kg").notNull(),
  methodPreferred: text("method_preferred").notNull(), // Modern Super-Ring / Klamp | Bipolar Laser / Electrocautery | Classic Suture
  bleedingDisorders: text("bleeding_disorders").notNull().default("None"),
  allergies: text("allergies").notNull().default("None"),
  anatomicalNotes: text("anatomical_notes"),
  guardianName: text("guardian_name").notNull(),
  guardianPhone: text("guardian_phone").notNull(),
  consentGiven: boolean("consent_given").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const clinicalNotes = pgTable("clinical_notes", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  providerId: integer("provider_id").notNull(),
  providerName: text("provider_name").notNull(),
  patientId: integer("patient_id").notNull(),
  assessmentSummary: text("assessment_summary").notNull(),
  woundDimensions: text("wound_dimensions").notNull(),
  exudateLevel: text("exudate_level").notNull(),
  proceduresPerformed: text("procedures_performed").notNull(),
  suppliesUsed: text("supplies_used").notNull(),
  painScorePost: integer("pain_score_post").notNull(),
  homecareInstructions: text("homecare_instructions").notNull(),
  nextFollowUpDate: text("next_follow_up_date"),
  aiAssistedDraft: boolean("ai_assisted_draft").default(false),
  verifiedByProvider: boolean("verified_by_provider").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const woundTimelineEntries = pgTable("wound_timeline_entries", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull(),
  bookingId: integer("booking_id"),
  visitDayLabel: text("visit_day_label").notNull(), // e.g. "Day 1 - Initial Assessment"
  dateRecorded: text("date_recorded").notNull(),
  lengthCm: doublePrecision("length_cm").notNull(),
  widthCm: doublePrecision("width_cm").notNull(),
  areaSqCm: doublePrecision("area_sq_cm").notNull(),
  painScore: integer("pain_score").notNull(),
  exudateStatus: text("exudate_status").notNull(),
  dressingType: text("dressing_type").notNull(),
  providerName: text("provider_name").notNull(),
  notes: text("notes").notNull(),
  imageUrl: text("image_url"),
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  patientName: text("patient_name").notNull(),
  providerId: integer("provider_id").notNull(),
  providerName: text("provider_name").notNull(),
  serviceName: text("service_name").notNull(),
  overallRating: integer("overall_rating").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Testimoni pasien.
 *
 * Tabel `reviews` di atas dibiarkan apa adanya (data contoh lama). Yang
 * dipakai sekarang adalah tabel ini, karena testimoni di layanan kesehatan
 * bukan sekadar bintang dan komentar:
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  TULISAN ASLI PASIEN TIDAK PERNAH BISA DIUBAH ATAU DIHAPUS.           │
 * │  Admin boleh merapikan versi yang TAYANG — memotong, membetulkan      │
 * │  ketikan, menyamarkan nama — tapi `isiAsli` tetap tersimpan utuh dan  │
 * │  setiap perubahan tercatat siapa, kapan, dan alasannya. Bintangnya    │
 * │  sama sekali tidak bisa disentuh admin: itu angka pasien.             │
 * │                                                                       │
 * │  Alasannya bukan cuma etika. Testimoni yang bisa ditulis ulang bebas  │
 * │  lalu ditayangkan sebagai suara pasien adalah ulasan palsu — dan      │
 * │  yang menanggung akibatnya adalah pemilik layanannya, bukan           │
 * │  aplikasinya.                                                         │
 * └──────────────────────────────────────────────────────────────────────┘
 */
export const testimoni = pgTable("testimoni", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  patientId: integer("patient_id").notNull(),
  /** Nama sebenarnya — TIDAK pernah ikut tayang kecuali pasien mengizinkan. */
  patientName: text("patient_name").notNull(),
  providerId: integer("provider_id"),
  providerName: text("provider_name"),
  serviceName: text("service_name").notNull(),
  /** Kelurahan/kecamatan saja, untuk samaran "Keluarga di Sawojajar". */
  wilayah: text("wilayah"),

  /* --- penilaian: milik pasien, admin tidak bisa mengubah --- */
  bintang: integer("bintang").notNull(),
  nilaiKetepatanWaktu: integer("nilai_ketepatan_waktu"),
  nilaiKebersihan: integer("nilai_kebersihan"),
  nilaiKeterampilan: integer("nilai_keterampilan"),

  /* --- isi --- */
  /** Apa adanya dari pasien. Hanya ditulis sekali, tidak pernah diubah. */
  isiAsli: text("isi_asli").notNull(),
  /** Yang tampil di halaman publik. Boleh dirapikan admin. */
  isiTayang: text("isi_tayang").notNull(),
  diedit: boolean("diedit").notNull().default(false),
  dieditOleh: text("diedit_oleh"),
  dieditPada: timestamp("diedit_pada"),
  /** Wajib diisi admin setiap kali merapikan. */
  alasanEdit: text("alasan_edit"),

  /* --- izin dari pasien, bukan dari admin --- */
  /** BOLEH_NAMA | BOLEH_SAMARAN | JANGAN_TAYANG */
  izinTayang: text("izin_tayang").notNull().default("BOLEH_SAMARAN"),
  /** Nama yang benar-benar tampil, dihitung dari izinTayang. */
  namaTayang: text("nama_tayang"),

  /* --- penanganan --- */
  /** BARU | DITINJAU | TAYANG | TIDAK_TAYANG */
  statusTinjauan: text("status_tinjauan").notNull().default("BARU"),
  /** Pasien menandai ini sebagai keluhan, bukan sekadar masukan. */
  keluhan: boolean("keluhan").notNull().default(false),
  /* --- penyortiran ke perawat (8 September 2026) ---
     Kritik tidak langsung sampai ke perawat. Admin menyortirnya dulu:
     memverifikasi, memberi konteks, lalu meneruskan. Yang dikendalikan
     admin adalah KAPAN dan DENGAN PENGANTAR APA — bukan apakah perawat
     boleh tahu. Begitu diteruskan, yang dibaca perawat tetap kalimat asli
     pasien; pengantar admin diletakkan DI ATASNYA, tidak menggantikannya.

     Satu pengecualian yang tidak bisa dilanggar: keluhan yang ditandai
     pasien menyangkut keselamatan atau kondisi kesehatan LANGSUNG
     diteruskan dan tidak bisa ditahan. Perawat berhak tahu ada tuduhan
     atas praktiknya — secara profesi maupun kalau perkaranya berlanjut. */
  /** BARU | DITAHAN | DITERUSKAN */
  statusKePerawat: text("status_ke_perawat").notNull().default("BARU"),
  /** Wajib diisi admin saat menahan; ikut tercatat di jejak audit. */
  alasanTahan: text("alasan_tahan"),
  diteruskanPada: timestamp("diteruskan_pada"),
  /**
   * Ditandai PASIEN, bukan ditebak sistem dari kata-katanya.
   *
   * Menebak "apakah ini soal keselamatan" dari teks bebas akan salah, dan
   * salahnya berat sebelah: keluhan bahaya yang tidak terdeteksi ikut
   * tertahan. Jadi yang ditanya orangnya.
   */
  bahayaKlinis: boolean("bahaya_klinis").notNull().default(false),

  /** Pengantar admin untuk perawat — tidak pernah tayang publik. */
  catatanUntukPerawat: text("catatan_untuk_perawat"),
  /** Jawaban perawat atas masukan. Tayang bila testimoninya tayang. */
  balasanPerawat: text("balasan_perawat"),
  balasanPada: timestamp("balasan_pada"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(), // BOOKING | PAYMENT | TRIAGE | CLINICAL
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderRole: text("sender_role").notNull(), // PATIENT | PROVIDER
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userRole: text("user_role").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  details: text("details").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const taskPhotos = pgTable("task_photos", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  // Foto luka yang dikirim PASIEN saat memesan belum punya perawat — waktu
  // itu belum ada yang ditugaskan. Karena itu dua kolom ini boleh kosong;
  // sebelumnya keduanya wajib, sehingga foto pra-pesanan tidak mungkin
  // disimpan sama sekali.
  providerId: integer("provider_id"),
  providerName: text("provider_name"),
  /** Siapa yang mengunggah: PASIEN | PERAWAT */
  uploadedByRole: text("uploaded_by_role").notNull().default("PERAWAT"),
  // INTAKE_LUKA (dari pasien, sebelum pesan) | ARRIVAL_CONFIRMATION |
  // SUPPLY_VERIFICATION | WOUND_BEFORE | WOUND_AFTER | PROCEDURE_COMPLETION
  photoType: text("photo_type").notNull(),
  imageUrl: text("image_url").notNull(), // Base64 data URL or S3 signed URL
  caption: text("caption"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  verifiedByProvider: boolean("verified_by_provider").default(true).notNull(),
  /**
   * Kapan gambarnya dihapus karena lewat masa simpan.
   *
   * Barisnya sengaja TIDAK ikut dihapus: yang harus hilang adalah data
   * kesehatannya (gambarnya), bukan catatan bahwa dulu ada foto di tahap
   * ini. Menghapus barisnya sekalian membuat rekam kunjungan tampak seolah
   * perawat tidak pernah mengambil foto — persis kebalikan dari gunanya.
   */
  imageDeletedAt: timestamp("image_deleted_at"),
});

/**
 * Rincian penawaran: satu baris per item yang ditagihkan.
 *
 * Disimpan sebagai tabel, bukan JSON di dalam bookings, karena inilah dasar
 * kesepakatan harga antara pasien dan perawat. Kalau nanti ada sengketa,
 * yang perlu dibuktikan bukan hanya totalnya melainkan apa saja yang
 * dihitung, berapa satuannya, dan siapa yang mengubahnya.
 */
export const quoteItems = pgTable("quote_items", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  /** JASA | BAHAN | JARAK | LUAR_JAM — menentukan bagi hasil perawat. */
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  qty: integer("qty").notNull().default(1),
  unitPriceIdr: integer("unit_price_idr").notNull(),
  /** true = diisi app; false = ditambahkan perawat sendiri. */
  fromCatalog: boolean("from_catalog").notNull().default(true),
  /** Diisi kalau perawat mengubah angka bawaan; menyimpan nilai awalnya. */
  originalUnitPriceIdr: integer("original_unit_price_idr"),
  /** Wajib diisi perawat kalau ia mengubah atau menambah item. */
  reason: text("reason"),
  quoteRound: integer("quote_round").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Persetujuan tindakan (informed consent).
 *
 * Yang disimpan BUKAN acuan ke versi teks, melainkan seluruh teks
 * sebagaimana ditampilkan di layar saat pasien menyetujuinya. Kalau kalimat
 * persetujuan diubah bulan depan, catatan lama harus tetap membuktikan apa
 * yang benar-benar dibaca orang itu — acuan versi saja tidak cukup untuk
 * itu.
 */
export const consents = pgTable("consents", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  version: text("version").notNull(),
  /** Seluruh isi persetujuan, apa adanya. */
  textSnapshot: text("text_snapshot").notNull(),
  /** Rincian tarif yang disetujui, apa adanya, dalam bentuk teks. */
  quoteSnapshot: text("quote_snapshot").notNull(),
  signedByName: text("signed_by_name").notNull(),
  /** Hubungan penanda tangan dengan pasien: DIRI_SENDIRI | ORANG_TUA | WALI | ANAK */
  signerRelation: text("signer_relation").notNull().default("DIRI_SENDIRI"),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
  /** Persetujuan terpisah untuk penyimpanan foto luka (UU PDP 27/2022). */
  photoConsent: boolean("photo_consent").notNull().default(false),

  /**
   * Teks persetujuan foto, disimpan apa adanya seperti yang dibaca pasien.
   *
   * Sebelumnya yang tersimpan hanya `photoConsent: true/false` — satu bit.
   * Padahal justru teks INILAH yang memuat janji perlindungan datanya:
   * siapa yang boleh melihat, dipakai untuk apa, dan berapa lama disimpan.
   *
   * Kelemahannya terbukti pada 9 September 2026, saat masa simpan diubah
   * dari 5 tahun menjadi 25 tahun mengikuti Permenkes 24/2022. Untuk
   * pasien yang menyetujui sebelum tanggal itu, tidak ada satu pun catatan
   * tentang apa yang sebenarnya mereka baca dan setujui — hanya "true".
   *
   * Teks persetujuan tindakan sudah disimpan utuh sejak awal (textSnapshot)
   * dengan alasan yang persis sama. Ini menutup pasangannya yang tertinggal.
   */
  photoConsentText: text("photo_consent_text"),
});

/**
 * Laporan tindakan singkat yang ditulis perawat setelah kunjungan.
 *
 * Terpisah dari clinical_notes (SOAP lengkap): ini versi pendek yang dibaca
 * pasien dan keluarganya, dalam bahasa yang mereka mengerti.
 */
export const visitReports = pgTable("visit_reports", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  providerId: integer("provider_id").notNull(),
  providerName: text("provider_name").notNull(),
  providerLicense: text("provider_license").notNull(),
  arrivedAt: timestamp("arrived_at"),
  finishedAt: timestamp("finished_at"),
  /** Apa yang dikerjakan, satu paragraf, bahasa awam. */
  whatWasDone: text("what_was_done").notNull(),
  /** Keadaan luka setelah tindakan. */
  woundCondition: text("wound_condition"),
  /** Yang harus dilakukan keluarga di rumah. */
  homeInstructions: text("home_instructions").notNull(),
  /** Tanda yang harus membuat keluarga segera menghubungi. */
  warningSigns: text("warning_signs"),
  nextVisitSuggestion: text("next_visit_suggestion"),
  suppliesUsed: text("supplies_used"),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
});

/* ==================================================================== */
/*  OTENTIKASI — lihat logic/otentikasi.ts untuk alasan setiap kolom     */
/* ==================================================================== */

/**
 * Sesi yang hidup di SERVER.
 *
 * Sebelum tabel ini ada, peran pemakai dikirim browser di badan permintaan.
 * Sekarang browser hanya memegang satu token acak; segala hal tentang siapa
 * dia — perannya, id-nya — dibaca dari baris di sini.
 *
 * Yang disimpan hanya SIDIK JARI token-nya (SHA-256), bukan token itu
 * sendiri. Kalau isi tabel ini bocor, yang bocor adalah daftar sidik jari
 * yang tidak bisa dipakai masuk ke mana pun.
 */
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id").notNull(),
  /**
   * Peran disalin ke sini saat masuk, tidak dibaca ulang dari users setiap
   * permintaan. Kalau peran seseorang diturunkan, sesinya yang sedang
   * berjalan harus dicabut — bukan diam-diam ikut berubah di tengah jalan.
   */
  role: text("role").notNull(),
  providerId: integer("provider_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
  /** Ringkasan perangkat, untuk layar "perangkat yang sedang masuk". */
  deviceLabel: text("device_label"),
  /** Sidik jari IP, bukan IP-nya. Cukup untuk membatasi laju, tidak untuk melacak orang. */
  ipHash: text("ip_hash"),
});

/**
 * Catatan percobaan masuk.
 *
 * Dua gunanya: membatasi laju penebakan, dan menjawab pertanyaan "ada yang
 * mencoba masuk ke akun saya?" — pertanyaan yang tidak bisa dijawab kalau
 * yang dicatat hanya keberhasilan.
 *
 * Kata sandi yang diketik TIDAK PERNAH dicatat, termasuk saat gagal. Log
 * percobaan gagal adalah tempat kata sandi paling sering bocor tanpa
 * disadari, karena orang mengetik sandi akun lain di kotak yang salah.
 */
export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  /** Pengenal yang sudah diseragamkan (62812..., atau surel huruf kecil). */
  identifier: text("identifier").notNull(),
  ok: boolean("ok").notNull(),
  reason: text("reason"),
  ipHash: text("ip_hash"),
  at: timestamp("at").defaultNow().notNull(),
});

/**
 * Dokumen izin perawat.
 *
 * Tabel sendiri, bukan kolom di providers, karena satu perawat mengunggah
 * SIP baru setiap kali izinnya diperpanjang — dan yang lama harus tetap
 * tersimpan. Kalau suatu saat dipersoalkan "apakah izinnya berlaku pada
 * tanggal kunjungan itu", yang menjawab adalah riwayat ini.
 */
export const providerDocuments = pgTable("provider_documents", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull(),
  jenis: text("jenis").notNull(), // STR | SIP | KTP | IJAZAH
  fileUrl: text("file_url").notNull(),
  nomor: text("nomor"),
  berlakuSampai: text("berlaku_sampai"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  /** Diganti dokumen yang lebih baru — barisnya tetap ada. */
  supersededAt: timestamp("superseded_at"),
});

/** Riwayat keputusan verifikasi. Siapa memutuskan apa, kapan, atas dasar apa. */
export const verificationReviews = pgTable("verification_reviews", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull(),
  keputusan: text("keputusan").notNull(), // TERVERIFIKASI | PERLU_PERBAIKAN | DIBEKUKAN
  alasan: text("alasan"),
  /** Di mana nomornya dicocokkan — wajib untuk keputusan meluluskan. */
  diperiksaDi: text("diperiksa_di"),
  adminUserId: integer("admin_user_id"),
  adminName: text("admin_name"),
  at: timestamp("at").defaultNow().notNull(),
});

/* ==================================================================== */
/*  PEMBAYARAN — lihat logic/pembayaran.ts untuk alasan setiap kolom     */
/* ==================================================================== */

/**
 * Satu baris per PERCOBAAN pembayaran, bukan satu per pemesanan.
 *
 * Pasien yang membuka halaman pembayaran, menutupnya, lalu mencoba lagi
 * besok adalah kejadian biasa. Kalau barisnya ditimpa, riwayat percobaan
 * yang gagal hilang — dan justru itu yang dicari saat ada selisih setoran
 * atau saat pasien bilang "saya sudah bayar".
 */
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  /** `NHC-2026-8841-3` — kode pemesanan + nomor percobaan. Unik di sisi penyedia. */
  orderId: text("order_id").notNull().unique(),
  attempt: integer("attempt").notNull().default(1),
  provider: text("provider").notNull().default("MIDTRANS"),

  /**
   * Nominal yang DICATAT SERVER saat transaksi dibuat, dihitung ulang dari
   * quote_items. Kabar dari penyedia harus cocok dengan angka ini, kalau
   * tidak pembayarannya ditahan untuk ditinjau orang.
   */
  amountIdr: integer("amount_idr").notNull(),

  /** MENUNGGU | LUNAS | GAGAL | DIKEMBALIKAN | PERLU_TINJAUAN */
  status: text("status").notNull().default("MENUNGGU"),
  statusReason: text("status_reason"),

  paymentType: text("payment_type"),        // qris | bank_transfer | gopay | …
  providerTxnId: text("provider_txn_id"),   // transaction_id dari Midtrans
  redirectUrl: text("redirect_url"),
  snapToken: text("snap_token"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  paidAt: timestamp("paid_at"),
  /** Sidik jari kabar terakhir yang diproses — penahan kiriman ganda. */
  lastNoticeHash: text("last_notice_hash"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Setiap kabar yang masuk dicatat, termasuk yang DITOLAK.
 *
 * Yang ditolak justru yang paling penting disimpan: tanda tangan yang
 * tidak cocok berarti ada yang mencoba menandai kunjungan lunas tanpa
 * membayar, dan tanpa baris ini tidak ada yang tahu itu pernah terjadi.
 *
 * Isi kabarnya disimpan apa adanya. Kalau suatu hari ada selisih dengan
 * setoran bank, yang menjawab adalah baris ini — bukan ingatan siapa pun.
 */
export const paymentEvents = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  orderId: text("order_id"),
  paymentId: integer("payment_id"),
  transactionStatus: text("transaction_status"),
  fraudStatus: text("fraud_status"),
  grossAmount: text("gross_amount"),
  signatureOk: boolean("signature_ok").notNull().default(false),
  /** DITERIMA | DITOLAK_TANDA_TANGAN | DIABAIKAN_GANDA | DIABAIKAN_TERTINGGAL | DITAHAN */
  outcome: text("outcome").notNull(),
  note: text("note"),
  rawJson: text("raw_json"),
  ipHash: text("ip_hash"),
  at: timestamp("at").defaultNow().notNull(),
});

/* ==================================================================== */
/*  LUPA KATA SANDI — lihat logic/pemulihan.ts                          */
/* ==================================================================== */

/**
 * Permintaan pemulihan kata sandi.
 *
 * Yang disimpan hanya SIDIK JARI kodenya, digabung dengan userId. Kalau isi
 * tabel ini bocor, yang bocor adalah daftar sidik jari yang tidak bisa
 * dipakai mengambil alih akun siapa pun.
 */
export const passwordResets = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  codeHash: text("code_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  /** Salah memasukkan kode; kodenya hangus setelah beberapa kali. */
  attempts: integer("attempts").notNull().default(0),
  ipHash: text("ip_hash"),
});

/**
 * Kotak keluar — semua pesan yang harus dikirim ke luar aplikasi.
 *
 * Ada tabelnya sendiri, bukan langsung dipanggil ke penyedia, karena tiga
 * hal:
 *
 * 1. Pengiriman bisa gagal. Tanpa catatan, pesan yang gagal hilang tanpa
 *    ada yang tahu — dan yang menunggu adalah orang yang tidak bisa masuk
 *    ke akunnya.
 * 2. Selama penyedia WhatsApp/SMS belum dipasang, barisnya tetap tercatat
 *    dan admin bisa menyampaikannya sendiri. Itu persis yang dikerjakan
 *    admin hari ini, hanya kini terlacak.
 * 3. Kalau suatu hari ada sengketa "saya tidak pernah menerima", yang
 *    menjawab adalah baris ini.
 */
export const outbox = pgTable("outbox", {
  id: serial("id").primaryKey(),
  /** WHATSAPP | SMS | SUREL */
  saluran: text("saluran").notNull(),
  tujuan: text("tujuan").notNull(),
  jenis: text("jenis").notNull(), // KODE_PEMULIHAN | ...
  isi: text("isi"),
  /** MENUNGGU | TERKIRIM | GAGAL */
  status: text("status").notNull().default("MENUNGGU"),
  galat: text("galat"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
  /**
   * Isi pesan dihapus setelah terkirim, untuk pesan yang memuat rahasia.
   *
   * Kode pemulihan yang tertinggal di kotak keluar adalah kunci cadangan
   * ke akun orang, dan admin bisa membacanya. Setelah benar-benar
   * terkirim, isinya tidak diperlukan lagi — yang perlu tinggal catatan
   * bahwa ia terkirim, kapan, dan ke mana.
   */
  isiDihapusPada: timestamp("isi_dihapus_pada"),
});

/* ==================================================================== */
/*  BAGI HASIL — lihat logic/bagihasil.ts                               */
/* ==================================================================== */

/**
 * Satu baris per kunjungan yang selesai DAN sudah dibayar.
 *
 * Angkanya dibekukan di sini, tidak dihitung ulang saat dibaca. Kalau
 * tarif jasa naik bulan depan, honor kunjungan bulan ini tidak boleh ikut
 * bergerak — yang dibayarkan ke perawat harus sama dengan yang disepakati
 * saat kunjungannya benar-benar terjadi. Rincian penawarannya sendiri
 * masih ada di quote_items, jadi angka di sini selalu bisa diperiksa
 * ulang; ia dibekukan supaya bisa DIBANDINGKAN, bukan supaya dipercaya
 * begitu saja.
 *
 * `bookingId` unik: satu kunjungan hanya boleh menghasilkan satu honor,
 * berapa kali pun pencatatannya terpanggil. Kunjungan yang ditutup dan
 * pembayaran yang masuk bisa terjadi dalam urutan mana pun, dan keduanya
 * memanggil pencatatan yang sama — tanpa kunci ini, kunjungan yang
 * kabarnya datang terlambat dibayar dua kali.
 */
export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().unique(),
  bookingCode: text("booking_code").notNull(),
  providerId: integer("provider_id").notNull(),
  providerName: text("provider_name").notNull(),

  /** Tanggal kunjungannya, bukan tanggal baris ini dibuat. */
  visitDate: text("visit_date").notNull(),

  /** Angka-angka yang dibekukan, semuanya dalam rupiah penuh. */
  totalBilledIdr: integer("total_billed_idr").notNull(),
  serviceIdr: integer("service_idr").notNull(),
  providerShareIdr: integer("provider_share_idr").notNull(),
  platformFeeIdr: integer("platform_fee_idr").notNull(),
  suppliesIdr: integer("supplies_idr").notNull(),
  travelIdr: integer("travel_idr").notNull(),
  afterHoursIdr: integer("after_hours_idr").notNull(),
  /** Yang benar-benar diterima perawat: porsi jasa + bahan + jarak + luar jam. */
  providerTakeIdr: integer("provider_take_idr").notNull(),
  /** Porsi platform yang dipakai, disimpan sebagai angka, mis. 0.30. */
  platformRate: text("platform_rate").notNull(),

  /** TERKUMPUL | DIBAYARKAN | DITAHAN | PERLU_TINJAUAN */
  status: text("status").notNull().default("TERKUMPUL"),
  note: text("note"),

  /** Diisi saat admin menandai honornya sudah ditransfer. */
  paidAt: timestamp("paid_at"),
  paidByUserId: integer("paid_by_user_id"),
  /** Nomor referensi transfer — wajib sebelum boleh ditandai dibayarkan. */
  paymentReference: text("payment_reference"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
