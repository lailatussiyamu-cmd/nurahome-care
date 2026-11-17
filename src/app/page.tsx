"use client";

import React, { useEffect, useState, useCallback } from "react";
import { pesananPasien, pesananPerawat, milikPesanan } from "@/logic/sesi";
import { S } from "@/logic/alur";
import { Navbar } from "@/components/Navbar";
import { PatientPortal } from "@/components/PatientPortal";
import { ProviderPortal } from "@/components/ProviderPortal";
import { AdminPortal } from "@/components/AdminPortal";
import { BookingWizardModal } from "@/components/BookingWizardModal";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { ArchitectureModal } from "@/components/ArchitectureModal";
import { LayarMasuk } from "@/components/LayarMasuk";

export default function HomePage() {
  /**
   * Peran datang dari SESI DI SERVER, bukan dari tombol di layar.
   *
   * Sebelum ini ada tiga tombol di bilah atas — Pasien / Perawat / Admin —
   * dan menekannya mengubah seluruh isi aplikasi. Alat peragaan, tapi alat
   * peragaan yang tersambung ke basis data sungguhan tanpa satu pun penjaga.
   * Sekarang nilainya hanya cerminan dari cookie sesi; tidak ada satu pun
   * cara mengubahnya dari sisi layar.
   */
  const [sesiServer, setSesiServer] = useState<any>(null);
  const [cekSesi, setCekSesi] = useState(true);
  const activeRole: "PATIENT" | "PROVIDER" | "ADMIN" = sesiServer?.peran ?? "PATIENT";
  const [data, setData] = useState<any>({
    services: [],
    providers: [],
    bookings: [],
    woundAssessments: [],
    circumcisionAssessments: [],
    clinicalNotes: [],
    woundTimelineEntries: [],
    dependents: [],
    addresses: [],
    reviews: [],
    notifications: [],
    messages: [],
    auditLogs: [],
    taskPhotos: [],
    users: [],
    quoteItems: [],
    consents: [],
    visitReports: [],
    testimoni: [],
    woundexChecks: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [gagalMuat, setGagalMuat] = useState(false);

  // Siapa yang sedang memakai aplikasi. Satu sumber untuk seluruh layar —
  // sebelumnya tiap portal menebak sendiri lewat indeks nol.
  /**
   * Sesi untuk layar — cerminan dari sesi di server, bukan tebakan.
   *
   * Sebelumnya baris ini berbunyi
   * `susunSesi(activeRole, data.users, data.providers)`, dan untuk peran
   * perawat fungsi itu mengambil `providers[0]` — perawat pertama di basis
   * data. Akibatnya baru kelihatan setelah ada login sungguhan: Ns. Dwi
   * masuk dengan akunnya sendiri, lalu seluruh portal menampilkan nama,
   * nomor STR, jumlah kunjungan, dan status verifikasi Ns. Ratna. Lengkap
   * dengan lencana "Terverifikasi" yang bukan miliknya.
   *
   * Ini ketahuan dari tangkapan layar aplikasi yang sedang berjalan, bukan
   * dari membaca berkas ini.
   */
  const sesi = {
    peran: activeRole,
    userId: sesiServer?.userId ?? null,
    nama: sesiServer?.nama ?? null,
    providerId: sesiServer?.providerId ?? null,
  };

  // Data yang boleh dilihat peran ini. Sebelum ini, setiap daftar
  // menampilkan seluruh isi tabel: garis waktu penyembuhan pasien lain,
  // pemesanan orang lain, foto luka orang lain.
  // Permintaan yang belum ada perawatnya — antrean bersama, terlihat oleh
  // semua perawat. Tanpa ini permintaan baru tidak pernah sampai ke siapa
  // pun: penyaringan "milik saya" menyembunyikannya justru karena belum
  // ada pemiliknya.
  const antrean = (data.bookings || []).filter(
    (b: any) =>
      (b.status === S.MENUNGGU_TINJAUAN || b.status === S.DITOLAK_PASIEN) &&
      b.providerId == null &&
      !String(b.rejectedProviderIds ?? "")
        .split(",")
        .filter(Boolean)
        .includes(String(sesi.providerId))
  );

  const pesananSaya =
    activeRole === "PROVIDER"
      ? [...pesananPerawat(data.bookings || [], sesi), ...antrean]
      : activeRole === "ADMIN"
      ? data.bookings || []
      : pesananPasien(data.bookings || [], sesi);

  const garisWaktuSaya =
    activeRole === "ADMIN"
      ? data.woundTimelineEntries || []
      : milikPesanan(data.woundTimelineEntries || [], pesananSaya, sesi);
  const fotoSaya =
    activeRole === "ADMIN"
      ? data.taskPhotos || []
      : milikPesanan(data.taskPhotos || [], pesananSaya, sesi);
  const catatanSaya =
    activeRole === "ADMIN"
      ? data.clinicalNotes || []
      : milikPesanan(data.clinicalNotes || [], pesananSaya, sesi);
  const pengkajianSaya =
    activeRole === "ADMIN"
      ? data.woundAssessments || []
      : milikPesanan(data.woundAssessments || [], pesananSaya, sesi);

  // Rincian penawaran, persetujuan, dan laporan disaring dengan aturan yang
  // sama: hanya untuk pemesanan yang boleh dilihat peran ini.
  const idBoleh = new Set(pesananSaya.map((b: any) => b.id));
  const saring = <T extends { bookingId?: number | null }>(baris: T[]) =>
    activeRole === "ADMIN" ? baris : baris.filter((r) => r.bookingId != null && idBoleh.has(r.bookingId));

  const penawaranSaya = saring(data.quoteItems || []);
  const laporanSaya = saring(data.visitReports || []);
  const testimoniSaya = saring(data.testimoni || []);

  // Modals state
  const [isBookingWizardOpen, setIsBookingWizardOpen] = useState(false);
  const [selectedServiceForWizard, setSelectedServiceForWizard] = useState<any | null>(null);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [isArchitectureModalOpen, setIsArchitectureModalOpen] = useState(false);

  /**
   * Pengambilan data.
   *
   * Sebelumnya kegagalan hanya dicatat ke konsol lalu diabaikan: `isLoading`
   * tetap dimatikan, dan pasien melihat katalog kosong tanpa penjelasan
   * apa pun. Yang dia simpulkan bukan "servernya sedang bermasalah",
   * melainkan "tidak ada perawat yang tersedia" — lalu dia menutup
   * aplikasinya. Ini ketahuan karena basis datanya benar-benar mati saat
   * pengujian, bukan karena membaca berkas ini.
   */
  const muatSesi = useCallback(async () => {
    try {
      const res = await fetch("/api/auth", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setSesiServer(j?.masuk ? j : null);
      return Boolean(j?.masuk);
    } catch {
      setSesiServer(null);
      return false;
    } finally {
      setCekSesi(false);
    }
  }, []);

  const keluar = useCallback(async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aksi: "KELUAR" }),
    }).catch(() => {});
    setSesiServer(null);
  }, []);

  const loadPlatformData = useCallback(async () => {
    setGagalMuat(false);
    try {
      const res = await fetch("/api/platform", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const isi = await res.json();
      setData(isi);
      /**
       * Jawaban server ikut membawa keadaan sesinya. Kalau sesi sudah
       * dicabut di tempat lain — admin membekukan akun, atau kata sandinya
       * diganti dari ponsel lain — layar ini harus segera tahu, bukan tetap
       * menampilkan data lama sampai orangnya memuat ulang sendiri.
       */
      if (isi?.sesi && isi.sesi.masuk === false) setSesiServer(null);
    } catch (e) {
      console.error("Gagal memuat data platform:", e);
      setGagalMuat(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Efek ini menyalakan pengambilan data, bukan menyetel state secara
  // langsung. `void` menegaskan janji sengaja tidak ditunggu, dan pemanggilan
  // ditunda satu tick supaya setState tidak jatuh di badan efek — itu yang
  // memicu render beruntun dan membuat lint merah.
  useEffect(() => {
    let hidup = true;
    const t = setTimeout(() => {
      if (!hidup) return;
      void muatSesi().then((masuk) => {
        if (hidup && masuk) void loadPlatformData();
        else if (hidup) setIsLoading(false);
      });
    }, 0);
    return () => {
      hidup = false;
      clearTimeout(t);
    };
  }, [loadPlatformData, muatSesi]);

  const handleCancelBooking = async (bookingId: number, alasan: string) => {
    await fetch("/api/platform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CANCEL_BOOKING",
        bookingId,
        reason: alasan,
      }),
    });
    await loadPlatformData();
  };

  const handleOpenBookingWizard = (service?: any) => {
    setSelectedServiceForWizard(service || null);
    setIsBookingWizardOpen(true);
  };

  const handleSelectRecommendedServiceFromAi = (slug: string) => {
    const matched = data.services.find((s: any) => s.slug === slug);
    handleOpenBookingWizard(matched || data.services[0]);
  };

  const handleUpdateBookingStatus = async (bookingId: number, status: string) => {
    try {
      await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_BOOKING_STATUS",
          bookingId,
          status,
        }),
      });
      await loadPlatformData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendMessage = async (content: string) => {
    try {
      await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SEND_MESSAGE",
          bookingId: data.bookings[0]?.id || 1,
          senderName: "Budi Santoso",
          senderRole: "PATIENT",
          content,
        }),
      });
      await loadPlatformData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddDependent = async (dep: any) => {
    try {
      await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ADD_DEPENDENT",
          ...dep,
        }),
      });
      await loadPlatformData();
    } catch (e) {
      console.error(e);
    }
  };

  /**
   * Selama sesi belum diperiksa, JANGAN menampilkan layar masuk.
   *
   * Kalau ditampilkan lebih dulu, orang yang sebenarnya sudah masuk melihat
   * kotak kata sandi berkedip setiap kali membuka aplikasi — dan sebagian
   * akan mengetik ulang sandinya karena mengira ia terlempar keluar.
   */
  if (cekSesi) {
    return (
      <div className="min-h-screen bg-nh-malam text-nh-putih flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-nh-ungu border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!sesiServer) {
    return (
      <LayarMasuk
        onMasuk={() => {
          setIsLoading(true);
          void muatSesi().then(() => void loadPlatformData());
        }}
      />
    );
  }

  return (
    // Latar dasar seluruh aplikasi. Sebelumnya #F8FAFC / #0F172A — sisa
    // templat terang. Semua panel di dalamnya sudah gelap, jadi yang tampak
    // adalah panel gelap mengambang di atas kertas putih, dan setiap teks
    // yang mewarisi warna dari sini jadi hitam di atas panel gelap.
    <div className="min-h-screen flex flex-col bg-nh-malam text-nh-putih">
      {/* Persistent Navigation Header */}
      <Navbar
        activeRole={activeRole}
        namaPemakai={sesiServer?.nama ?? null}
        onKeluar={keluar}
        onOpenArchitecture={() => setIsArchitectureModalOpen(true)}
        onOpenAiAssistant={() => setIsAiDrawerOpen(true)}
        onOpenBookingWizard={() => handleOpenBookingWizard()}
      />

      {/* Main Dynamic Portal Viewport */}
      <main className="flex-1">
        {isLoading ? (
          <div className="max-w-7xl mx-auto px-6 py-24 text-center space-y-3">
            <div className="w-10 h-10 rounded-full border-4 border-nh-ungu border-t-transparent animate-spin mx-auto" />
            <div className="text-sm font-bold text-nh-kabut">
              Memuat data NuraHome Care...
            </div>
          </div>
        ) : gagalMuat ? (
          /* Layar gagal muat. Yang penting di sini bukan pesan galatnya,
             melainkan: (1) mengatakan ini masalah kami, bukan berarti tidak
             ada perawat; (2) satu tombol untuk mencoba lagi; (3) nomor 119
             tetap ada, karena orang yang membuka aplikasi ini bisa saja
             sedang panik melihat luka. */
          <div className="max-w-md mx-auto px-6 py-20 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-nh-bahaya/15 border border-nh-bahaya/40 text-nh-bahaya flex items-center justify-center mx-auto text-2xl font-bold">
              !
            </div>
            <h2 className="text-lg font-extrabold text-nh-putih">
              Data layanan belum bisa dimuat
            </h2>
            <p className="text-sm text-nh-kabut leading-relaxed">
              Ini gangguan di sisi kami, bukan berarti tidak ada perawat yang
              bertugas. Coba muat ulang; kalau masih gagal, hubungi kami lewat
              WhatsApp.
            </p>
            <button
              onClick={() => {
                setIsLoading(true);
                void loadPlatformData();
              }}
              className="nh-tombol px-6 py-3 text-sm"
            >
              Coba lagi
            </button>
            <div className="pt-2 text-xs text-nh-kabut-2">
              Keadaan gawat darurat —{" "}
              <a href="tel:119" className="text-nh-bahaya font-bold underline">
                telepon 119
              </a>
            </div>
          </div>
        ) : (
          <>
            {activeRole === "PATIENT" && (
              <PatientPortal
                services={data.services}
                providers={data.providers}
                bookings={pesananSaya}
                woundTimelineEntries={garisWaktuSaya}
                clinicalNotes={catatanSaya}
                dependents={data.dependents}
                reviews={data.reviews}
                messages={data.messages}
                taskPhotos={fotoSaya}
                onOpenBookingWizard={handleOpenBookingWizard}
                onOpenAiAssistant={() => setIsAiDrawerOpen(true)}
                onSendMessage={handleSendMessage}
                onAddDependent={handleAddDependent}
                onCancelBooking={handleCancelBooking}
                quoteItems={penawaranSaya}
                visitReports={laporanSaya}
                testimoni={testimoniSaya}
                addresses={data.addresses || []}
                sesi={sesi}
                onRefresh={loadPlatformData}
              />
            )}

            {activeRole === "PROVIDER" && (
              <ProviderPortal
                bookings={pesananSaya}
                woundAssessments={pengkajianSaya}
                clinicalNotes={catatanSaya}
                taskPhotos={fotoSaya}
                sesi={sesi}
                providers={data.providers || []}
                users={data.users || []}
                dependents={data.dependents || []}
                onStatusUpdate={handleUpdateBookingStatus}
                onNoteSubmitted={loadPlatformData}
                services={data.services || []}
                addresses={data.addresses || []}
                quoteItems={penawaranSaya}
                visitReports={laporanSaya}
                testimoni={testimoniSaya}
                providerDocuments={data.providerDocuments || []}
                payouts={data.payouts || []}
                woundexChecks={saring(data.woundexChecks || [])}
                onRefresh={loadPlatformData}
              />
            )}

            {activeRole === "ADMIN" && (
              <AdminPortal
                bookings={data.bookings}
                providers={data.providers}
                services={data.services}
                auditLogs={data.auditLogs}
                testimoni={data.testimoni || []}
                providerDocuments={data.providerDocuments || []}
                verificationReviews={data.verificationReviews || []}
                payouts={data.payouts || []}
                woundexChecks={data.woundexChecks || []}
                sambunganAi={data.sambunganAi}
                sesi={sesi}
                onRefresh={loadPlatformData}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-nh-malam text-nh-kabut-2 py-10 border-t border-nh-panel-2 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-bold text-nh-putih">NuraHome Care</span> • Perawatan luka & sunat di rumah — Malang
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <button
              onClick={() => setIsArchitectureModalOpen(true)}
              className="text-nh-ungu-muda hover:underline font-semibold"
            >
              Arsitektur sistem & ERD
            </button>
            <span>Mengikuti UU PDP No. 27/2022</span>
            <span>Gawat darurat: 119</span>
          </div>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <BookingWizardModal
        isOpen={isBookingWizardOpen}
        onClose={() => setIsBookingWizardOpen(false)}
        services={data.services}
        dependents={data.dependents}
        addresses={data.addresses}
        initialService={selectedServiceForWizard}
        onBookingCreated={loadPlatformData}
      />

      <AiAssistantDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        onSelectRecommendedService={handleSelectRecommendedServiceFromAi}
      />

      <ArchitectureModal
        isOpen={isArchitectureModalOpen}
        onClose={() => setIsArchitectureModalOpen(false)}
      />
    </div>
  );
}
