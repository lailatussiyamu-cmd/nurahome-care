/**
 * Apa yang boleh DIKIRIM ke sebuah browser.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  KEADAAN SEBELUMNYA — ini lubang terbesar di seluruh aplikasi:        │
 * │                                                                       │
 * │  GET /api/platform menjawab dengan SELURUH ISI BASIS DATA, ke siapa   │
 * │  pun, tanpa satu pun pemeriksaan. Foto luka semua pasien. Teks        │
 * │  persetujuan lengkap. Nomor telepon, alamat rumah, titik koordinat.   │
 * │  Catatan klinis. Tarif setiap orang. Seluruh tabel users.             │
 * │                                                                       │
 * │  Penyaringan peran memang ada — tapi di BROWSER, di page.tsx,         │
 * │  SESUDAH semuanya terkirim. Menyembunyikan sesuatu di layar tidak     │
 * │  menghapusnya dari jawaban server; `curl https://…/api/platform`      │
 * │  mengembalikan semuanya, apa adanya, tanpa perlu akun.                │
 * │                                                                       │
 * │  Data kesehatan adalah data pribadi yang bersifat spesifik            │
 * │  (UU 27/2022 tentang PDP, Pasal 4 ayat 2). Ini bukan cacat teknis     │
 * │  yang bisa ditunda; ini pelanggaran.                                  │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Berkas ini memindahkan penyaringan itu ke server. Penyaringan di browser
 * TIDAK dihapus — dua lapis lebih baik daripada satu — tapi mulai sekarang
 * yang mengikat adalah lapisan di sini.
 *
 * Aturan yang dipakai: sebuah baris ikut terkirim hanya kalau orang ini
 * memang perlu melihatnya untuk mengerjakan sesuatu. Bukan "kalau tidak
 * berbahaya", melainkan "kalau memang diperlukan".
 */

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  services,
  providers,
  bookings,
  woundAssessments,
  circumcisionAssessments,
  clinicalNotes,
  woundTimelineEntries,
  dependents,
  addresses,
  reviews,
  notifications,
  messages,
  auditLogs,
  taskPhotos,
  users,
  quoteItems,
  consents,
  visitReports,
  testimoni,
  providerDocuments,
  sessions,
  verificationReviews,
  payments,
  paymentEvents,
  payouts,
} from "@/db/schema";
import type { Aktor } from "./aktor";
import { S } from "@/logic/alur";
import { bolehMenerimaKunjungan, tampilanUntukPasien } from "@/logic/verifikasi";
import { modelSiap } from "./model-ai";

/* ------------------------------------------------------------------ */
/* Pembersihan baris                                                   */
/* ------------------------------------------------------------------ */

/**
 * Kartu perawat yang boleh dilihat siapa pun.
 *
 * Yang dibuang: userId (penghubung ke akunnya), nomor STR utuh, nomor SIP
 * utuh, dan seluruh catatan verifikasi internal. Nomor izin praktik lengkap
 * yang terpampang di halaman publik adalah bahan yang rapi untuk memalsukan
 * identitas perawat itu di tempat lain. Yang pasien perlukan adalah
 * kepastian bahwa izinnya sudah diperiksa — bukan nomornya.
 */
function kartuPerawat(p: any) {
  const v = tampilanUntukPasien(p);
  return {
    id: p.id,
    fullName: p.fullName,
    specialty: p.specialty,
    yearsExperience: p.yearsExperience,
    bio: p.bio,
    serviceAreaCity: p.serviceAreaCity,
    serviceRadiusKm: p.serviceRadiusKm,
    ratingAvg: p.ratingAvg,
    completedVisits: p.completedVisits,
    availableHours: p.availableHours,
    isAvailableNow: p.isAvailableNow && bolehMenerimaKunjungan(p).boleh,
    avatarUrl: p.avatarUrl,
    verifiedStatus: p.verifiedStatus,
    terverifikasi: v.terverifikasi,
    labelVerifikasi: v.label,
    penerbitIzin: v.penerbitIzin,
    diperiksaPada: v.diperiksaPada,
  };
}

/**
 * Baris users yang aman dikirim.
 *
 * passwordHash, phoneNormal, failedLogins, dan lockedUntil tidak pernah
 * keluar dari server — bahkan untuk admin. Admin tidak punya keperluan
 * membaca hash kata sandi orang lain, dan satu-satunya akibat dari
 * mengirimkannya adalah menambah tempat ia bisa bocor.
 */
function pemakaiAman(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    avatarUrl: u.avatarUrl,
    dateOfBirth: u.dateOfBirth,
    gender: u.gender,
    emergencyContactName: u.emergencyContactName,
    emergencyContactPhone: u.emergencyContactPhone,
    allergies: u.allergies,
    medicalHistory: u.medicalHistory,
    diabetesStatus: u.diabetesStatus,
    accountStatus: u.accountStatus,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

/**
 * Permintaan di antrean bersama, sebelum ada perawat yang mengambilnya.
 *
 * Perawat perlu melihat CUKUP untuk memutuskan sanggup atau tidak: jenis
 * luka, fotonya, jaraknya kasar, jadwalnya. Ia belum perlu tahu nama
 * lengkap pasien, alamat persisnya, atau nomor teleponnya — itu semua
 * terbuka begitu ia benar-benar mengambil kunjungannya.
 *
 * Bedanya nyata: satu permintaan dilihat setiap perawat yang sedang
 * bertugas. Mengirimkan alamat lengkap ke semuanya berarti membagikan
 * alamat rumah seorang pasien kepada orang-orang yang tidak akan pernah
 * datang ke sana.
 */
function antreanSamar(b: any) {
  const kota = String(b.addressText ?? "").split(",").slice(-2).join(",").trim();
  const nama = String(b.patientName ?? "").trim();
  const inisial = nama
    .split(/\s+/)
    .map((k: string) => k[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return {
    ...b,
    patientName: inisial ? `${inisial} (nama dibuka saat diambil)` : "Pasien",
    dependentName: b.dependentName ? "Anggota keluarga" : null,
    addressText: kota || "Kota Malang",
    addressId: null,
    patientPhone: null,
    __antrean: true,
  };
}

/* ------------------------------------------------------------------ */
/* Penyusun tampilan                                                   */
/* ------------------------------------------------------------------ */

const KOSONG = {
  services: [] as any[],
  providers: [] as any[],
  bookings: [] as any[],
  woundAssessments: [] as any[],
  circumcisionAssessments: [] as any[],
  clinicalNotes: [] as any[],
  woundTimelineEntries: [] as any[],
  dependents: [] as any[],
  addresses: [] as any[],
  reviews: [] as any[],
  notifications: [] as any[],
  messages: [] as any[],
  auditLogs: [] as any[],
  taskPhotos: [] as any[],
  users: [] as any[],
  quoteItems: [] as any[],
  consents: [] as any[],
  visitReports: [] as any[],
  testimoni: [] as any[],
  providerDocuments: [] as any[],
  verificationReviews: [] as any[],
  sessions: [] as any[],
  payments: [] as any[],
  paymentEvents: [] as any[],
  payouts: [] as any[],
};

export async function susunTampilan(a: Aktor) {
  const [semuaLayanan, semuaPerawat] = await Promise.all([
    db.select().from(services),
    db.select().from(providers),
  ]);

  /**
   * Testimoni yang boleh tampil di halaman depan.
   *
   * Hanya yang sudah disortir admin menjadi TAYANG, dan hanya kolom yang
   * memang untuk umum — tulisan aslinya, nama aslinya, dan seluruh catatan
   * penyortiran tidak ikut. Sebelumnya seluruh baris testimoni terkirim,
   * termasuk keluhan yang justru diputuskan admin untuk TIDAK ditayangkan.
   */
  const testimoniPublik = (
    await db.select().from(testimoni).where(eq(testimoni.statusTinjauan, "TAYANG"))
  ).map((t) => ({
    id: t.id,
    bintang: t.bintang,
    isiTayang: t.isiTayang,
    namaTayang: t.namaTayang,
    serviceName: t.serviceName,
    balasanPerawat: t.balasanPerawat,
    createdAt: t.createdAt,
    __publik: true,
  }));

  /**
   * Rata-rata bintang dihitung DI SERVER dari semua testimoni.
   *
   * Halaman depan tidak boleh menerima seluruh baris testimoni hanya untuk
   * menghitung rata-rata di browser. Yang dikirim cukup angkanya.
   */
  const semuaTestimoni = await db.select().from(testimoni);
  const bernilai = semuaTestimoni.filter((t) => Number(t.bintang) > 0);
  const ringkasanPublik = {
    jumlah: bernilai.length,
    rata: bernilai.length
      ? bernilai.reduce((j, t) => j + Number(t.bintang), 0) / bernilai.length
      : null,
  };

  const umum = {
    ...KOSONG,
    services: semuaLayanan,
    providers: semuaPerawat.map(kartuPerawat),
    testimoni: testimoniPublik,
  };

  /* ---------------- belum masuk ---------------- */
  if (!a.masuk) {
    return { ...umum, ringkasanPublik, sesi: { masuk: false, peran: null } };
  }

  /* ---------------- ADMIN: semuanya ---------------- */
  if (a.peran === "ADMIN") {
    const [
      b, wa, ca, cn, wt, dep, adr, rev, notif, msg, audit, foto, u, qi, con, vr, tes, pd, vrev, ses, pay, payEv, bagi,
    ] = await Promise.all([
      db.select().from(bookings).orderBy(desc(bookings.createdAt)),
      db.select().from(woundAssessments).orderBy(desc(woundAssessments.createdAt)),
      db.select().from(circumcisionAssessments).orderBy(desc(circumcisionAssessments.createdAt)),
      db.select().from(clinicalNotes).orderBy(desc(clinicalNotes.createdAt)),
      db.select().from(woundTimelineEntries),
      db.select().from(dependents),
      db.select().from(addresses),
      db.select().from(reviews).orderBy(desc(reviews.createdAt)),
      db.select().from(notifications).orderBy(desc(notifications.createdAt)),
      db.select().from(messages),
      db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)),
      db.select().from(taskPhotos).orderBy(desc(taskPhotos.timestamp)),
      db.select().from(users),
      db.select().from(quoteItems),
      db.select().from(consents),
      db.select().from(visitReports),
      db.select().from(testimoni).orderBy(desc(testimoni.createdAt)),
      db.select().from(providerDocuments).orderBy(desc(providerDocuments.uploadedAt)),
      db.select().from(verificationReviews).orderBy(desc(verificationReviews.at)),
      db.select().from(sessions).orderBy(desc(sessions.lastSeenAt)),
      db.select().from(payments).orderBy(desc(payments.createdAt)),
      /**
       * Kabar pembayaran yang DITOLAK ikut terkirim ke admin — itu justru
       * yang paling perlu dilihat. Tanda tangan yang tidak cocok berarti
       * ada yang mencoba menandai kunjungan lunas tanpa membayar.
       */
      db.select().from(paymentEvents).orderBy(desc(paymentEvents.at)).limit(200),
      db.select().from(payouts).orderBy(desc(payouts.createdAt)),
    ]);

    return {
      services: semuaLayanan,
      /** Admin melihat baris perawat UTUH — ia memang yang memverifikasinya. */
      providers: semuaPerawat,
      bookings: b,
      woundAssessments: wa,
      circumcisionAssessments: ca,
      clinicalNotes: cn,
      woundTimelineEntries: wt,
      dependents: dep,
      addresses: adr,
      reviews: rev,
      notifications: notif,
      messages: msg,
      auditLogs: audit,
      taskPhotos: foto,
      users: u.map(pemakaiAman),
      quoteItems: qi,
      consents: con,
      visitReports: vr,
      testimoni: tes,
      providerDocuments: pd,
      verificationReviews: vrev,
      sessions: ses.map((s) => ({
        id: s.id,
        userId: s.userId,
        role: s.role,
        deviceLabel: s.deviceLabel,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
        revokedAt: s.revokedAt,
        revokedReason: s.revokedReason,
      })),
      payments: pay,
      paymentEvents: payEv,
      payouts: bagi,
      /**
       * Keadaan sambungan AI, apa adanya, hanya untuk admin.
       *
       * Kuncinya sendiri TIDAK pernah ikut — yang dikirim cuma "siap atau
       * tidak", nama penyedia, dan nama modelnya. Layanan yang diam-diam
       * mati adalah layanan yang tidak ada yang tahu kapan berhentinya.
       */
      sambunganAi: modelSiap(),
      ringkasanPublik,
      sesi: { masuk: true, peran: a.peran, userId: a.userId, providerId: a.providerId, nama: a.nama },
    };
  }

  /* ---------------- PASIEN & PERAWAT ---------------- */

  const semuaPesanan = await db.select().from(bookings).orderBy(desc(bookings.createdAt));

  let milik: any[] = [];
  if (a.peran === "PATIENT") {
    milik = semuaPesanan.filter((b) => b.patientId === a.userId);
  } else {
    milik = semuaPesanan.filter((b) => b.providerId === a.providerId);
  }

  /**
   * Antrean bersama, hanya untuk perawat, dan hanya kalau ia BOLEH bekerja.
   *
   * Perawat yang izinnya belum diverifikasi atau sudah kedaluwarsa tidak
   * melihat satu pun permintaan. Kalau ia tetap melihatnya, penjagaan
   * verifikasi hanya berupa tombol yang gagal ditekan — sementara foto luka
   * pasien sudah terlanjur sampai ke layarnya.
   */
  let antrean: any[] = [];
  if (a.peran === "PROVIDER") {
    const sayaPerawat = semuaPerawat.find((p) => p.id === a.providerId);
    if (bolehMenerimaKunjungan(sayaPerawat).boleh) {
      antrean = semuaPesanan
        .filter(
          (b) =>
            (b.status === S.MENUNGGU_TINJAUAN || b.status === S.DITOLAK_PASIEN) &&
            b.providerId == null &&
            !String(b.rejectedProviderIds ?? "")
              .split(",")
              .filter(Boolean)
              .includes(String(a.providerId))
        )
        .map(antreanSamar);
    }
  }

  const pesananTampil = [...milik, ...antrean];
  const idMilik = milik.map((b) => b.id);
  const idSemua = pesananTampil.map((b) => b.id);

  /** Baris anak yang ikut hanya untuk pemesanan yang boleh dilihat. */
  const ambil = async (tabel: any, kolom: any, id: number[]) =>
    id.length ? await db.select().from(tabel).where(inArray(kolom, id)) : [];

  /**
   * Foto ikut untuk antrean (perawat perlu melihat lukanya untuk menilai),
   * tapi pengkajian, catatan klinis, penawaran, persetujuan, dan laporan
   * TIDAK — semuanya baru ada setelah kunjungan diambil, dan kalaupun ada
   * dari perawat sebelumnya, bukan urusan perawat yang belum mengambilnya.
   */
  const [foto, kajiLuka, kajiSunat, garis] = await Promise.all([
    ambil(taskPhotos, taskPhotos.bookingId, idSemua),
    ambil(woundAssessments, woundAssessments.bookingId, idSemua),
    ambil(circumcisionAssessments, circumcisionAssessments.bookingId, idSemua),
    ambil(woundTimelineEntries, woundTimelineEntries.bookingId, idMilik),
  ]);

  const [catatan, penawaran, persetujuan, laporan, pesan] = await Promise.all([
    ambil(clinicalNotes, clinicalNotes.bookingId, idMilik),
    ambil(quoteItems, quoteItems.bookingId, idMilik),
    ambil(consents, consents.bookingId, idMilik),
    ambil(visitReports, visitReports.bookingId, idMilik),
    ambil(messages, messages.bookingId, idMilik),
  ]);

  /**
   * Pemberitahuan: milik pemakai ini saja.
   *
   * Sebelumnya seluruh tabel notifications terkirim — termasuk kalimat
   * seperti "Luka Ibu Siti tampak memerah, perlu ditinjau" yang berisi
   * nama dan keadaan pasien lain.
   */
  const semuaNotif = await db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt));
  const notifSaya = semuaNotif.filter((n: any) => n.userId === a.userId);

  /* ---- testimoni ---- */
  let testimoniSaya: any[] = [];
  if (a.peran === "PATIENT") {
    testimoniSaya = semuaTestimoni.filter((t) => t.patientId === a.userId);
  } else {
    /**
     * Perawat menerima masukan tentang dirinya HANYA yang sudah diteruskan
     * admin. Penyortiran itu tidak ada artinya kalau barisnya tetap
     * terkirim ke browsernya dan hanya disembunyikan di layar.
     *
     * Satu kolom sengaja dibuang: `alasanTahan` — catatan admin kepada
     * dirinya sendiri tentang kenapa sebuah masukan ditahan.
     */
    testimoniSaya = semuaTestimoni
      .filter((t) => t.providerId === a.providerId && t.statusKePerawat === "DITERUSKAN")
      .map(({ alasanTahan, ...sisa }) => sisa);
  }

  /**
   * Jumlah masukan yang masih di meja admin — angkanya saja.
   *
   * Perawat berhak tahu ADA yang belum sampai (kalau tidak, ia melihat
   * nilainya turun tanpa satu pun penjelasan), tapi tidak berhak membaca
   * isinya sebelum admin selesai memeriksa.
   */
  const masihDisortir =
    a.peran === "PROVIDER"
      ? semuaTestimoni.filter(
          (t) => t.providerId === a.providerId && t.statusKePerawat !== "DITERUSKAN"
        ).length
      : 0;

  /** Nilai perawat dihitung di server dari SEMUA testimoni miliknya. */
  const nilaiSaya =
    a.peran === "PROVIDER"
      ? semuaTestimoni.filter((t) => t.providerId === a.providerId)
      : [];

  /* ---- data pribadi ---- */
  const [tanggungan, alamat] =
    a.peran === "PATIENT"
      ? await Promise.all([
          db.select().from(dependents).where(eq(dependents.patientId, a.userId!)),
          db.select().from(addresses).where(eq(addresses.userId, a.userId!)),
        ])
      : [[], []];

  /** Profil sendiri saja. Tabel users tidak pernah dikirim utuh ke non-admin. */
  const [sayaBaris] = await db.select().from(users).where(eq(users.id, a.userId!)).limit(1);

  /** Perawat melihat baris dirinya sendiri utuh — termasuk status verifikasinya. */
  const perawatTampil = semuaPerawat.map((p) =>
    a.peran === "PROVIDER" && p.id === a.providerId ? p : kartuPerawat(p)
  );

  const berkasSaya =
    a.peran === "PROVIDER" && a.providerId != null
      ? await db
          .select()
          .from(providerDocuments)
          .where(eq(providerDocuments.providerId, a.providerId))
      : [];

  const sesiSaya = await db.select().from(sessions).where(eq(sessions.userId, a.userId!));

  /**
   * Bagi hasil: perawat melihat barisnya SENDIRI, utuh — termasuk potongan
   * platform. Menyembunyikan potongannya dari orang yang dipotong adalah
   * persis keadaan yang hendak diperbaiki ketika portal perawat dulu hanya
   * menampilkan satu angka mati tanpa asal-usul.
   *
   * Pasien tidak menerima baris ini sama sekali: berapa yang diterima
   * perawat dan berapa yang diambil platform bukan urusan pasien, dan
   * mengirimkannya ke layar pasien hanya mengundang tawar-menawar yang
   * tidak ada dasarnya.
   */
  const bagiHasilSaya =
    a.peran === "PROVIDER" && a.providerId != null
      ? await db
          .select()
          .from(payouts)
          .where(eq(payouts.providerId, a.providerId))
          .orderBy(desc(payouts.createdAt))
      : [];

  /**
   * Pembayaran milik pemesanan yang boleh dilihat — dan hanya kolom yang
   * berguna di layar. Token Snap TIDAK ikut: ia adalah izin membuka
   * halaman pembayaran, dan tidak ada alasan mengirimkannya ke layar yang
   * tidak sedang membayar.
   */
  const bayarSaya = (await ambil(payments, payments.bookingId, idMilik)).map((p: any) => ({
    id: p.id,
    bookingId: p.bookingId,
    orderId: p.orderId,
    amountIdr: p.amountIdr,
    status: p.status,
    statusReason: p.statusReason,
    paymentType: p.paymentType,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
    paidAt: p.paidAt,
  }));

  return {
    ...KOSONG,
    services: semuaLayanan,
    providers: perawatTampil,
    bookings: pesananTampil,
    woundAssessments: kajiLuka,
    circumcisionAssessments: kajiSunat,
    clinicalNotes: catatan,
    woundTimelineEntries: garis,
    dependents: tanggungan,
    addresses: alamat,
    notifications: notifSaya,
    messages: pesan,
    taskPhotos: foto,
    users: sayaBaris ? [pemakaiAman(sayaBaris)] : [],
    quoteItems: penawaran,
    consents: persetujuan,
    visitReports: laporan,
    testimoni: [...testimoniSaya, ...testimoniPublik.filter((p) => !testimoniSaya.some((t) => t.id === p.id))],
    providerDocuments: berkasSaya,
    payments: bayarSaya,
    payouts: bagiHasilSaya,
    /**
     * auditLogs SENGAJA kosong untuk pasien dan perawat.
     *
     * Jejak audit memuat baris tentang pemesanan siapa pun, lengkap dengan
     * nama dan tindakannya. Itu alat pengawasan untuk admin, bukan bahan
     * tampilan untuk pemakai biasa.
     */
    auditLogs: [],
    masihDisortir,
    nilaiSaya,
    ringkasanPublik,
    sesiPerangkat: sesiSaya.map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      revokedAt: s.revokedAt,
      iniPerangkatIni: s.id === a.sessionId,
    })),
    sesi: { masuk: true, peran: a.peran, userId: a.userId, providerId: a.providerId, nama: a.nama },
  };
}
