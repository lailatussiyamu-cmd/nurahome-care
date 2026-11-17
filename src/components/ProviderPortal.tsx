"use client";

import React, { useState } from "react";
import { tanggalIndo, namaVerifikasi, type Sesi } from "@/logic/sesi";
import { S, namaStatus, inisial } from "@/logic/alur";

import { PanelTinjauan } from "./PanelTinjauan";
import { PanelKunjungan } from "./PanelKunjungan";
import { PanelWoundex } from "./PanelWoundex";
import { PanelNilaiPerawat } from "./PanelNilaiPerawat";
import { PanelVerifikasiPerawat } from "./PanelVerifikasiPerawat";
import { rp, honorPerawat, PORSI_PERAWAT } from "@/logic/biaya";
import {
  ShieldCheck,
  MapPin,
  Clock,
  CheckCircle2,
  FileText,
  Sparkles,
  UserCheck,
  DollarSign,
  Stethoscope,
  Activity,
  Navigation,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";


import { PhotoGallery } from "./PhotoGallery";

interface ProviderPortalProps {
  bookings: any[];
  woundAssessments: any[];
  clinicalNotes: any[];
  taskPhotos: any[];
  providers: any[];
  users: any[];
  dependents: any[];
  sesi: Sesi;
  onStatusUpdate: (bookingId: number, status: string) => void;
  onNoteSubmitted: () => void;
  services: any[];
  addresses: any[];
  quoteItems: any[];
  visitReports: any[];
  testimoni: any[];
  providerDocuments: any[];
  payouts: any[];
  woundexChecks?: any[];
  masihDisortir?: number;
  onRefresh: () => void;
}

export function ProviderPortal({
  bookings,
  woundAssessments,
  clinicalNotes,
  taskPhotos,
  providers,
  users,
  dependents,
  sesi,
  onStatusUpdate,
  onNoteSubmitted,
  services,
  addresses,
  testimoni,
  providerDocuments,
  payouts,
  woundexChecks = [],
  onRefresh,
}: ProviderPortalProps) {
  const [selectedBookingId, setSelectedBookingId] = useState<number>(
    bookings[0]?.id || 1
  );
  /**
   * ┌────────────────────────────────────────────────────────────────┐
   * │  FORMULIR CATATAN KLINIS DIMULAI KOSONG. SEMUANYA.              │
   * │                                                                 │
   * │  Sampai 13 September 2026 seluruh kolom di bawah ini terisi     │
   * │  sejak layar dibuka — untuk pasien mana pun, kunjungan mana     │
   * │  pun: panjang 2,8 cm, lebar 1,8 cm, nyeri 2/10, "85% dasar      │
   * │  merah", lengkap dengan daftar bahan dan instruksi pulang.      │
   * │                                                                 │
   * │  Itu bukan contoh yang membantu. Itu ukuran yang tidak pernah   │
   * │  diukur, pada luka yang belum dilihat, di dalam formulir yang   │
   * │  ditandatangani perawat dengan nomor STR-nya. Perawat yang      │
   * │  terburu-buru dan hanya mengubah satu-dua kolom menyimpan       │
   * │  angka orang lain ke rekam medis pasiennya.                     │
   * │                                                                 │
   * │  Kolom kosong memaksa orang mengisi. Kolom terisi memaksa orang │
   * │  MEMERIKSA — dan yang kedua jauh lebih mudah dilewatkan.        │
   * └────────────────────────────────────────────────────────────────┘
   */
  const [roughNotes, setRoughNotes] = useState("");
  const [lengthCm, setLengthCm] = useState<number | "">("");
  const [widthCm, setWidthCm] = useState<number | "">("");
  const [painScorePost, setPainScorePost] = useState<number | "">("");
  const [assessmentSummary, setAssessmentSummary] = useState("");
  const [proceduresPerformed, setProceduresPerformed] = useState("");
  const [suppliesUsed, setBahanUsed] = useState("");
  const [homecareInstructions, setHomecareInstructions] = useState("");
  const [exudateLevel, setExudateLevel] = useState("");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [kabarSusun, setKabarSusun] = useState<{ sisa: string[]; sangkalan: string } | null>(null);
  const [galatCatatan, setGalatCatatan] = useState("");
  const [sudahPakaiPenyusun, setSudahPakaiPenyusun] = useState(false);
  const [isGeneratingSoap, setIsGeneratingSoap] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);

  const activeBooking =
    bookings.find((b) => b.id === Number(selectedBookingId)) || bookings[0];

  // Perawat yang sedang masuk — dari sesi, bukan dari indeks nol. Ini yang
  // membuat Ns. Hendra tidak lagi melihat nama, nomor STR, dan honor Ns. Ratna.
  const perawat =
    providers.find((p) => p.id === sesi.providerId) ??
    providers.find((p) => p.fullName === sesi.nama);
  /**
   * Nilai yang tersimpan adalah "TERVERIFIKASI", bukan "VERIFIED".
   *
   * Baris ini membandingkannya dengan "VERIFIED" — sisa dari masa ketika
   * status masih berbahasa Inggris — sehingga perawat yang SUDAH
   * diverifikasi tetap melihat lencana kuning "Menunggu verifikasi" di
   * atas namanya sendiri, tepat di sebelah panel izin praktik yang pada
   * layar yang sama berbunyi "Anda boleh menerima kunjungan". Dua kalimat
   * yang bertentangan, dan yang dipercaya perawat adalah yang lebih
   * menakutkan.
   */
  const terverifikasi = perawat?.verifiedStatus === "TERVERIFIKASI";

  // Data pasien untuk kunjungan yang dipilih. Semuanya sudah tersimpan di
  // basis data sejak awal — hanya tidak pernah ditampilkan ke perawat yang
  // berangkat ke rumahnya.
  const pasien = users.find((u) => u.name === activeBooking?.patientName);
  const tanggungan = dependents.find((d) => d.fullName === activeBooking?.dependentName);
  const pengkajian = woundAssessments.find((w) => w.bookingId === activeBooking?.id);

  const catatanKeselamatan = [
    { label: "Alergi", nilai: pasien?.allergies, penting: true },
    { label: "Riwayat", nilai: pasien?.medicalHistory ?? tanggungan?.medicalNotes },
    { label: "Diabetes", nilai: pasien?.diabetesStatus },
    {
      label: "Kontak darurat",
      nilai:
        pasien?.emergencyContactName &&
        `${pasien.emergencyContactName} · ${pasien.emergencyContactPhone ?? "-"}`,
    },
  ].filter((x) => x.nilai);

  /**
   * Honor dibaca dari baris bagi hasil, BUKAN dihitung ulang di layar.
   *
   * Sebelumnya baris ini berbunyi `bookings.filter(b => b.status ===
   * "COMPLETED")` — sisa dari masa ketika status masih berbahasa Inggris.
   * Nilai statusnya sudah lama "SELESAI", jadi saringan itu TIDAK PERNAH
   * cocok: berapa pun kunjungan yang sudah dikerjakan perawat, kartu
   * honornya selalu berbunyi "Belum ada kunjungan yang selesai". Salah
   * yang tidak berbunyi sama sekali, di layar yang justru dipakai orang
   * untuk memastikan ia dibayar.
   *
   * Sekarang angkanya datang dari tabel bagi hasil — angka yang sama yang
   * dilihat admin, dibekukan saat kunjungannya selesai dan lunas. Satu
   * sumber angka, bukan dua yang bisa berbeda.
   */
  const honorTerkumpul = (payouts ?? [])
    .filter((p: any) => p.status === "TERKUMPUL")
    .reduce((t: number, p: any) => t + Number(p.providerTakeIdr || 0), 0);
  const honorDibayarkan = (payouts ?? [])
    .filter((p: any) => p.status === "DIBAYARKAN")
    .reduce((t: number, p: any) => t + Number(p.providerTakeIdr || 0), 0);
  /**
   * Yang dihitung di sebelah angka "menunggu transfer" harus kunjungan yang
   * ikut membentuk angka itu saja. "Rp 710.000 dari 3 kunjungan" ketika
   * satu di antaranya sudah dibayarkan membuat perawat mengira ia kurang
   * dibayar.
   */
  const kunjunganMenunggu = (payouts ?? []).filter((p: any) => p.status === "TERKUMPUL");
  const kunjunganSelesai = (payouts ?? []).filter((p: any) => p.status !== "DITAHAN");

  /**
   * Untuk kunjungan yang SEDANG berjalan belum ada baris bagi hasilnya —
   * barisnya baru dibuat setelah kunjungan ditutup dan uangnya masuk. Yang
   * satu ini memang perkiraan, dan di layar ditulis begitu.
   */
  const honorAktif = activeBooking ? honorPerawat(activeBooking) : null;

  // Apa yang menghalangi tanda tangan. Sebelumnya tombolnya tidak pernah
  // mati: catatan klinis kosong tanpa satu foto pun bisa ditandatangani, dan
  // kunjungan tercatat selesai. Padahal tepat di sebelah tombol itu tertulis
  // bahwa perawat menjaminkan nomor STR-nya atas ketepatan isinya.
  const fotoKunjungan = taskPhotos.filter((p: any) => p.bookingId === activeBooking?.id);
  const punyaFoto = (jenis: string) => fotoKunjungan.some((p: any) => p.photoType === jenis);
  const perluFotoLuka = activeBooking?.serviceCategory === "WOUND_CARE";

  const syaratTandaTangan: string | null =
    !assessmentSummary.trim()
      ? "Ringkasan pengkajian masih kosong."
    : !proceduresPerformed.trim()
      ? "Tindakan yang dilakukan belum diisi."
    : !homecareInstructions.trim()
      ? "Instruksi perawatan di rumah belum diisi."
    : perluFotoLuka && !punyaFoto("WOUND_BEFORE")
      ? "Foto luka sebelum tindakan belum diunggah."
    : perluFotoLuka && !punyaFoto("WOUND_AFTER")
      ? "Foto luka sesudah tindakan belum diunggah."
    : null;

  const adaAlergi =
    !!pasien?.allergies && !/^(tidak ada|none|-)$/i.test(String(pasien.allergies).trim());

  /**
   * Merapikan catatan kasar menjadi SOAP.
   *
   * Yang dikembalikan server hanyalah KALIMAT PERAWAT SENDIRI, dipindah
   * ke kotak yang tepat. Tidak ada satu kata pun yang ditambahkan.
   *
   * Sebelum ini, tombol yang sama menulis kalimat karangan ke kolom
   * pengkajian — "2,8 x 1,8 x 0,3 cm, 85% granulasi" — apa pun yang
   * ditulis perawat, lalu kalimat itu ikut ditandatangani.
   */
  const handleAiStructureSoap = async () => {
    if (!roughNotes.trim()) return;
    setIsGeneratingSoap(true);
    setKabarSusun(null);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "SOAP_STRUCTURER", roughNotes }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setKabarSusun({ sisa: [], sangkalan: d?.error ?? "Gagal menyusun catatan." });
        return;
      }

      const gabung = (a: string[]) => a.join(" ");
      /**
       * Hanya mengisi kolom yang MASIH KOSONG. Menimpa kalimat yang sudah
       * diketik perawat berarti menghapus pekerjaannya karena ia menekan
       * tombol bantuan — dan yang hilang tidak selalu ia sadari sebelum
       * menandatangani.
       */
      const pengkajian = gabung([...d.soap.subjektif, ...d.soap.objektif, ...d.soap.asesmen]);
      if (pengkajian && !assessmentSummary.trim()) setAssessmentSummary(pengkajian);
      if (d.soap.rencana.length && !proceduresPerformed.trim())
        setProceduresPerformed(gabung(d.soap.rencana));

      setSudahPakaiPenyusun(true);
      setKabarSusun({ sisa: d.soap.belumTertempatkan ?? [], sangkalan: d.sangkalan ?? "" });
    } catch {
      setKabarSusun({ sisa: [], sangkalan: "Tidak bisa menghubungi server." });
    } finally {
      setIsGeneratingSoap(false);
    }
  };

  /**
   * Luas hanya dihitung kalau KEDUA ukurannya benar-benar diisi.
   * `2,8 x 1,8` yang muncul sendiri tanpa ada yang mengukur adalah persis
   * masalah yang sedang diperbaiki di berkas ini.
   */
  const luas =
    typeof lengthCm === "number" && typeof widthCm === "number" && lengthCm > 0 && widthCm > 0
      ? lengthCm * widthCm
      : null;

  const handleSaveClinicalNote = async () => {
    if (!activeBooking) return;
    setGalatCatatan("");
    setIsSavingNote(true);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SUBMIT_CLINICAL_NOTE",
          bookingId: activeBooking.id,
          /**
           * Nama penanda tangan TIDAK dikirim dari sini.
           *
           * Dulu baris ini berbunyi providerName: "Ns. Ratna Dewi,
           * S.Kep., CWCS" — nama yang ditulis mati, dikirim oleh browser
           * SIAPA PUN yang membuka layar ini. Server memang sudah lama
           * mengabaikannya dan memakai sesi, tetapi baris seperti ini
           * menunggu satu perubahan kecil untuk kembali dipercaya.
           */
          assessmentSummary,
          woundDimensions:
            luas === null
              ? "(tidak diukur)"
              : `${lengthCm} cm x ${widthCm} cm (luas ${luas.toFixed(2)} cm²)`,
          /** Diisi perawat, bukan ditulis mati "Cairan bening, sedikit". */
          exudateLevel: exudateLevel.trim() || "(tidak dicatat)",
          proceduresPerformed,
          suppliesUsed,
          painScorePost,
          homecareInstructions,
          /** Dulu selalu "3 hari lagi", untuk setiap pasien. */
          nextFollowUpDate: nextFollowUpDate.trim() || null,
          lengthCm,
          widthCm,
          dibantuAlat: sudahPakaiPenyusun,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        /**
         * Penolakan server DIKATAKAN. Sebelumnya jawabannya tidak pernah
         * dibaca sama sekali: catatan yang ditolak — misalnya karena
         * skala nyeri kosong — terlihat persis seperti catatan yang
         * berhasil disimpan, dan perawat baru tahu lama kemudian, kalau
         * pernah tahu.
         */
        setGalatCatatan(d?.error ?? "Catatan gagal disimpan. Coba lagi.");
        return;
      }
      onNoteSubmitted();
    } catch {
      setGalatCatatan("Tidak bisa menghubungi server. Catatan belum tersimpan.");
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Provider Credential Header Banner */}
      <div className="bg-nh-malam text-nh-putih rounded-2xl p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Dulu tertulis "RD" — inisial Ns. Ratna Dewi, ditulis mati.
              Selama peran dipilih lewat tombol peragaan tidak ada yang
              menyadarinya; begitu ada login sungguhan, Ns. Dwi Lestari
              masuk dengan akunnya dan melihat inisial orang lain di
              fotonya sendiri. */}
          <div className="w-14 h-14 rounded-2xl bg-nh-ungu-tekan flex items-center justify-center font-bold text-xl shrink-0">
            {inisial(perawat?.fullName ?? sesi.nama ?? "")}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold">{perawat?.fullName ?? "Perawat"}</h1>
              {/* Lencana dibaca dari verifiedStatus, bukan ditulis mati.
                  Sebelumnya perawat berstatus PENDING atau SUSPENDED tetap
                  melihat lencana hijau yang sama. */}
              {terverifikasi ? (
                <span className="px-3 py-0.5 rounded-full bg-nh-sembuh/20 border border-nh-sembuh/40 text-nh-sembuh text-xs font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> STR terverifikasi
                </span>
              ) : (
                <span className="px-3 py-0.5 rounded-full bg-amber-100 border border-amber-400 text-amber-800 text-xs font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {namaVerifikasi(perawat?.verifiedStatus)}
                </span>
              )}
            </div>
            <p className="text-xs text-nh-kabut mt-1">
              {perawat?.licenseNumber ?? "—"} • {perawat?.specialty ?? "—"}
              <span className="block mt-0.5">
                Wilayah: {perawat?.serviceAreaCity ?? "—"} (radius {perawat?.serviceRadiusKm ?? "—"} km)
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t md:border-t-0 pt-4 md:pt-0 border-nh-panel-2">
          <div className="text-right">
            <div className="text-xs text-nh-kabut-2">Honor menunggu transfer</div>
            {/* "Rp 0 dari 0 kunjungan" terbaca seperti aplikasi rusak, bukan
                seperti periode yang memang masih kosong — apalagi di layar
                yang sama tertulis 342 kunjungan seumur karier. Kalau belum
                ada yang selesai, katakan dengan kalimat. */}
            {kunjunganSelesai.length === 0 ? (
              <div className="text-sm font-semibold text-nh-kabut mt-0.5 max-w-[190px]">
                Belum ada kunjungan yang selesai
              </div>
            ) : (
              <>
                <div className="text-lg font-bold text-nh-ungu-muda font-mono">
                  {rp(honorTerkumpul)}
                </div>
                <div className="text-[11px] text-nh-kabut-2 mt-0.5">
                  dari {kunjunganMenunggu.length} kunjungan
                </div>
                {/* Yang sudah ditransfer ditulis terpisah, tidak dijumlahkan
                    ke angka di atas. Satu angka gabungan membuat perawat
                    tidak bisa tahu berapa yang masih harus ia terima —
                    padahal justru itu yang ingin ia ketahui saat membuka
                    layar ini. */}
                {honorDibayarkan > 0 && (
                  <div className="text-[11px] text-emerald-300 mt-0.5">
                    sudah ditransfer {rp(honorDibayarkan)}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="text-right pl-4 border-l border-nh-panel-2">
            <div className="text-xs text-nh-kabut-2">Total kunjungan</div>
            <div className="text-lg font-bold text-nh-putih">
              {perawat?.completedVisits ?? 0}
              <span className="text-sm font-normal text-nh-lampu"> · {perawat?.ratingAvg ?? "—"} ★</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Nurse Workstation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Assigned Home Visits Queue (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <h2 className="text-base font-bold text-nh-putih flex items-center gap-2">
            <Navigation className="w-4 h-4 text-nh-ungu" /> Kunjungan saya
          </h2>
          {/* Judulnya dulu "Kunjungan hari ini", padahal daftarnya berisi
              SEMUA kunjungan perawat ini — termasuk yang tanggalnya sudah
              lewat dan yang masih beberapa hari lagi. Untuk orang yang
              memakai daftar ini menyusun rute paginya, judul yang salah
              lebih berbahaya daripada judul yang umum. Yang belum selesai
              didahulukan, lalu diurutkan menurut tanggal. */}

          <div className="space-y-3">
            {[...bookings]
              .sort((a, b) => {
                const selesai = (x: any) =>
                  x.status === S.SELESAI || x.status === S.DIBATALKAN ? 1 : 0;
                if (selesai(a) !== selesai(b)) return selesai(a) - selesai(b);
                return String(a.scheduledDate ?? "").localeCompare(
                  String(b.scheduledDate ?? "")
                );
              })
              .map((booking) => (
              <div
                key={booking.id}
                onClick={() => setSelectedBookingId(booking.id)}
                className={`p-4 rounded-2xl border transition cursor-pointer ${
                  selectedBookingId === booking.id
                    ? "border-nh-ungu bg-nh-ungu/40 ring-2 ring-nh-ungu/20"
                    : "border-nh-garis bg-nh-panel hover:border-nh-garis-2"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-nh-ungu-muda">
                    #{booking.bookingCode}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      booking.status === S.SELESAI
                        ? "bg-nh-sembuh/15 text-nh-sembuh"
                        : booking.status === S.PERAWAT_BERANGKAT
                        ? "bg-nh-ungu/15 text-nh-ungu-muda"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {namaStatus(booking.status)}
                  </span>
                </div>

                <div className="font-bold text-nh-putih text-sm">
                  {booking.dependentName || booking.patientName}
                </div>
                <div className="text-xs text-nh-ungu-muda font-semibold mt-0.5">
                  {booking.serviceName}
                </div>

                <div className="mt-3 pt-3 border-t border-nh-panel-2 space-y-1.5 text-xs text-nh-kabut">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-nh-kabut-2" />
                    <span>
                      {tanggalIndo(booking.scheduledDate)} • {booking.scheduledTimeSlot}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-nh-kabut-2 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{booking.addressText}</span>
                  </div>
                </div>

                {/* Tombol aksi dulu ada di sini, memakai status lama
                    ("PROVIDER_ON_THE_WAY", "IN_PROGRESS") dan tanpa tahu
                    urutan alurnya sama sekali: tombol "Berangkat" muncul
                    bahkan pada permintaan yang belum ditinjau, belum
                    ditawar, dan belum dibayar. Sekarang seluruh aksi
                    lapangan ada di PanelKunjungan di kolom kanan, yang
                    hanya menampilkan langkah yang memang boleh dikerjakan
                    berikutnya. Kartu ini cukup memilih. */}
                <div className="mt-3 pt-2.5 border-t border-nh-garis/80 text-[11px] text-nh-kabut-2">
                  {booking.id === activeBooking?.id
                    ? "Sedang dibuka di panel sebelah"
                    : "Ketuk untuk membuka"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Clinical Documentation & AI SOAP Workbench (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Panel tinjauan: hanya muncul untuk permintaan yang memang sedang
              di tahap itu. Sebelumnya perawat tidak pernah punya layar untuk
              menilai luka dan menetapkan biaya sama sekali — harga sudah
              ditetapkan sebelum ia melihat apa pun. */}
          {[S.MENUNGGU_TINJAUAN, S.DITINJAU, S.DITOLAK_PASIEN].includes(
            activeBooking?.status
          ) && (
            <PanelTinjauan
              booking={activeBooking}
              layanan={services.find((x: any) => x.id === activeBooking?.serviceId)}
              alamat={
                // Lewat id, dengan cadangan pencocokan teks untuk data lama
                // yang dibuat sebelum kolom addressId ada.
                addresses.find((a: any) => a.id === activeBooking?.addressId) ??
                addresses.find((a: any) => a.fullAddress === activeBooking?.addressText)
              }
              fotoIntake={fotoKunjungan.filter((f: any) => f.photoType === "INTAKE_LUKA")}
              pengkajian={pengkajian}
              sesi={sesi}
              onSelesai={onRefresh}
            />
          )}

          {/* Panel kerja lapangan: berangkat, tiba, foto, laporan. */}
          {[S.DIBAYAR, S.PERAWAT_BERANGKAT, S.PERAWAT_TIBA, S.DIKERJAKAN].includes(
            activeBooking?.status
          ) && (
            <PanelKunjungan
              booking={activeBooking}
              foto={fotoKunjungan}
              sesi={sesi}
              onSelesai={onRefresh}
            />
          )}

          {/* Woundex: peringatan dini luka kaki diabetik. Bisa diisi saat
              perawat sudah tiba; hasil terakhirnya tetap terlihat setelah
              kunjungan selesai. Panel menyembunyikan dirinya sendiri untuk
              layanan selain perawatan luka. */}
          {[S.PERAWAT_TIBA, S.DIKERJAKAN, S.SELESAI].includes(activeBooking?.status) && (
            <PanelWoundex
              booking={activeBooking}
              pengkajian={woundexChecks.filter((w: any) => w.bookingId === activeBooking?.id)}
              onSelesai={onRefresh}
            />
          )}

          {/* Menunggu pasien. Tidak ada yang bisa perawat kerjakan di sini,
              dan mengatakannya lebih baik daripada menampilkan borang mati. */}
          {[S.DITAWARKAN, S.DISETUJUI].includes(activeBooking?.status) && (
            <div className="nh-panel p-5">
              <div className="text-sm font-bold text-nh-putih">
                {namaStatus(activeBooking?.status)}
              </div>
              <p className="text-xs text-nh-kabut leading-relaxed mt-1">
                {activeBooking?.status === S.DITAWARKAN
                  ? "Penawaran sudah terkirim. Pasien sedang membaca rincian dan persetujuan tindakan."
                  : "Pasien sudah menyetujui. Anda berangkat setelah pembayarannya masuk."}
              </p>
            </div>
          )}

          {/* Diletakkan DI ATAS penilaian dan daftar kunjungan.
              Kalau izinnya bermasalah, itu hal pertama yang harus dilihat
              perawat saat membuka aplikasi — bukan sesuatu yang ditemukan
              setelah menggulir ke bawah, atau setelah tombol "Ambil"
              gagal ditekan tanpa penjelasan. */}
          <PanelVerifikasiPerawat
            perawat={providers.find((p: any) => p.id === sesi.providerId)}
            berkas={providerDocuments ?? []}
            onSelesai={onRefresh}
          />

          <PanelNilaiPerawat
            testimoni={testimoni}
            sesi={sesi}
            onSelesai={onRefresh}
          />

          {/* Daftar foto wajib dulu ada di sini SEKALIGUS di PanelKunjungan —
              delapan kotak unggah untuk empat foto, sebagiannya berjudul
              bahasa Inggris dan tanpa tahu tahap alurnya. Sekarang tinggal
              satu tempat: PanelKunjungan, yang hanya muncul saat perawat
              memang sedang di lapangan. Galerinya tetap ditampilkan di sini
              sebagai rekam jejak. */}
          {taskPhotos.filter((p: any) => p.bookingId === activeBooking?.id).length > 0 && (
            <div className="nh-panel p-5">
              <PhotoGallery
                photos={taskPhotos.filter((p: any) => p.bookingId === activeBooking?.id)}
                title={`Foto kunjungan #${activeBooking?.bookingCode}`}
              />
            </div>
          )}

          {/**
           * Formulir catatan klinis hanya muncul kalau memang ADA kunjungan
           * yang sedang ditangani.
           *
           * Sebelumnya ia selalu dirender. Ns. Dwi — perawat baru, belum
           * satu pun kunjungan, izinnya bahkan belum diverifikasi — membuka
           * aplikasi dan disambut formulir SOAP berjudul "Catatan kunjungan
           * untuk #" (kosong), sudah terisi ukuran luka 2,8 × 1,8 cm milik
           * pasien lain, dengan tombol "Tanda tangani & selesaikan
           * kunjungan" di bawahnya dan nomor STR-nya di atas tombol itu.
           *
           * Ini ketahuan dari tangkapan layar aplikasi yang sedang berjalan.
           */}
          {activeBooking ? (
          <div className="bg-nh-panel rounded-2xl border border-nh-garis p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-nh-garis pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-nh-ungu">
                  Rekam medis elektronik
                </span>
                <h3 className="text-lg font-bold text-nh-putih">
                  Catatan kunjungan untuk #{activeBooking?.bookingCode}
                </h3>
              </div>
              <span className="px-3 py-1 rounded-full bg-nh-panel-2 text-nh-kabut text-xs font-semibold">
                Akses data pasien dibatasi seperlunya
              </span>
            </div>

          {/* ================= RINGKASAN KESELAMATAN =================
              Semua yang ada di kotak ini sudah tersimpan di basis data sejak
              awal — alergi, riwayat, status diabetes, kontak darurat, tanda
              bahaya triase, dan jawaban keluarga saat memesan. Tidak satu pun
              pernah ditampilkan ke perawat yang berangkat ke rumahnya.
              Pasien contoh punya "Penicillin (mild rash)" tersimpan rapi,
              dan perawat datang membawa balutan antimikroba tanpa tahu. */}
          <div className="p-4 rounded-2xl border border-nh-garis bg-nh-panel space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-nh-kabut-2">
              Sebelum berangkat
            </div>

            {activeBooking?.triageRedFlag && (
              <div className="p-3 rounded-xl bg-red-50 border-2 border-red-500 flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
                <div className="text-xs text-red-900">
                  <b className="block text-red-700 text-sm">Tanda bahaya dari pemesanan</b>
                  {activeBooking.triageNotes ||
                    "Keluarga menandai gejala berisiko saat memesan. Nilai ulang begitu tiba."}
                </div>
              </div>
            )}

            {adaAlergi && (
              <div className="p-3 rounded-xl bg-amber-50 border-2 border-amber-400 flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="text-xs text-amber-900">
                  <b className="block text-amber-800 text-sm">Alergi</b>
                  {pasien?.allergies}
                </div>
              </div>
            )}

            {/* Honor kunjungan ini. Pasien melihat totalnya sampai rupiah
                terakhir; perawat yang mengerjakan sebelumnya tidak melihat
                bagiannya sama sekali. */}
            {honorAktif && (
              <div className="p-3 rounded-xl bg-nh-panel-2 border border-nh-garis">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-nh-kabut-2">Honor kunjungan ini</span>
                  <span className="font-mono font-bold text-nh-ungu-muda">
                    {rp(honorAktif.diterima)}
                  </span>
                </div>
                <dl className="mt-2 pt-2 border-t border-nh-garis text-[11px] space-y-1">
                  <div className="flex justify-between gap-3">
                    <dt className="text-nh-kabut-2">
                      Jasa tindakan &mdash; bagian Anda {Math.round(PORSI_PERAWAT * 100)}%
                    </dt>
                    <dd className="font-mono text-nh-kabut">{rp(honorAktif.porsiPerawat)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-nh-kabut-2">Biaya jarak &mdash; utuh</dt>
                    <dd className="font-mono text-nh-kabut">{rp(honorAktif.jarak)}</dd>
                  </div>
                  {honorAktif.bahan > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-nh-kabut-2">Ganti bahan habis pakai</dt>
                      <dd className="font-mono text-nh-kabut">{rp(honorAktif.bahan)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 pt-1 border-t border-nh-garis">
                    <dt className="text-nh-kabut-2">Potongan platform</dt>
                    <dd className="font-mono text-nh-kabut-2">
                      &minus;{rp(honorAktif.potonganPlatform)}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {catatanKeselamatan.length > 0 ? (
              <dl className="divide-y divide-nh-garis text-xs">
                {catatanKeselamatan.map((c) => (
                  <div key={c.label} className="py-2 flex gap-3">
                    <dt className="w-28 shrink-0 text-nh-kabut-2">{c.label}</dt>
                    <dd className="text-nh-putih">{c.nilai}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-nh-kabut-2">
                Belum ada catatan riwayat untuk pasien ini.
              </p>
            )}

            {/* Jawaban keluarga saat memesan. Sebelumnya dioper ke komponen
                ini sebagai properti lalu tidak pernah dipakai — jadi usaha
                mereka mengisi formulir tidak pernah sampai ke siapa pun. */}
            {pengkajian && (
              <div className="pt-1">
                <div className="text-xs font-bold uppercase tracking-wider text-nh-kabut-2 mb-2">
                  Kata keluarga saat memesan
                </div>
                <dl className="divide-y divide-nh-garis text-xs">
                  {[
                    ["Lokasi", pengkajian.woundLocation],
                    ["Sudah berapa lama", pengkajian.woundDuration],
                    ["Kondisi perban", pengkajian.exudateAmount],
                  ]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={String(k)} className="py-2 flex gap-3">
                        <dt className="w-28 shrink-0 text-nh-kabut-2">{k}</dt>
                        <dd className="text-nh-putih">{v}</dd>
                      </div>
                    ))}
                </dl>
                <p className="text-[11px] text-nh-kabut-2 mt-2 leading-relaxed">
                  Diisi keluarga, bukan tenaga kesehatan. Ukuran dan jenis
                  jaringan dinilai sendiri saat tiba.
                </p>
              </div>
            )}
          </div>

          {/* AI Shorthand Note Converter */}
          <div className="p-4 rounded-xl bg-nh-ungu/70 border border-nh-ungu/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-nh-ungu-muda flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-nh-ungu" /> Penyusun catatan
              </div>
              <button
                type="button"
                disabled={isGeneratingSoap}
                onClick={handleAiStructureSoap}
                className="px-3 py-1.5 rounded-lg bg-nh-ungu-tekan text-nh-putih text-xs font-bold hover:bg-nh-ungu-tua transition flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isGeneratingSoap ? "Menyusun…" : "Susun jadi SOAP"}
              </button>
            </div>
            <p className="text-[10px] text-nh-kabut-2 leading-relaxed">
              Hanya memindahkan kalimat Anda sendiri ke bagian S/O/A/P. Tidak
              menambahkan apa pun, dan tidak menimpa kolom yang sudah Anda isi.
            </p>
            <textarea
              rows={3}
              value={roughNotes}
              onChange={(e) => setRoughNotes(e.target.value)}
              placeholder="Tulis catatan kasar Anda di sini — satu hal per baris…"
              className="w-full p-3 rounded-xl border border-nh-ungu bg-nh-panel text-xs"
            />

            {/* Apa yang tidak bisa ditempatkan DITUNJUKKAN, bukan dibuang.
                Kalimat perawat yang hilang diam-diam lebih buruk daripada
                kalimat yang tidak jadi dipindahkan. */}
            {kabarSusun && (
              <div className="space-y-2 pt-1">
                {kabarSusun.sisa.length > 0 && (
                  <div className="text-[11px] text-amber-300">
                    <div className="font-bold">
                      Belum tahu ini masuk bagian mana — silakan tempatkan sendiri:
                    </div>
                    {kabarSusun.sisa.map((k) => (
                      <div key={k}>• {k}</div>
                    ))}
                  </div>
                )}
                {kabarSusun.sangkalan && (
                  <p className="text-[10px] text-nh-kabut-2 leading-relaxed">
                    {kabarSusun.sangkalan}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Structured Clinical Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-nh-kabut mb-1">
                Panjang terukur (cm)
              </label>
              <input
                type="number"
                step="0.1"
                value={lengthCm}
                onChange={(e) =>
                  setLengthCm(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="—"
                className="w-full h-11 px-3 rounded-xl border border-nh-garis-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-nh-kabut mb-1">
                Lebar terukur (cm)
              </label>
              <input
                type="number"
                step="0.1"
                value={widthCm}
                onChange={(e) =>
                  setWidthCm(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="—"
                className="w-full h-11 px-3 rounded-xl border border-nh-garis-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-nh-kabut mb-1">
                Skala nyeri setelah tindakan (0–10)
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={painScorePost}
                onChange={(e) =>
                  setPainScorePost(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="—"
                className="w-full h-11 px-3 rounded-xl border border-nh-garis-2 text-sm font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-nh-kabut mb-1">
              Kondisi luka & ringkasan pengkajian
            </label>
            <textarea
              rows={3}
              value={assessmentSummary}
              onChange={(e) => setAssessmentSummary(e.target.value)}
              className="w-full p-3 rounded-xl border border-nh-garis-2 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-nh-kabut mb-1">
              Tindakan yang dikerjakan & bahan steril yang dipakai
            </label>
            <textarea
              rows={3}
              value={proceduresPerformed}
              onChange={(e) => setProceduresPerformed(e.target.value)}
              className="w-full p-3 rounded-xl border border-nh-garis-2 text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-nh-kabut mb-1">
                Cairan luka (eksudat)
              </label>
              {/* Dulu tidak ada kolomnya sama sekali: setiap catatan
                  terkirim dengan "Cairan bening, sedikit" — kalimat yang
                  ditulis mati di kode, untuk luka apa pun. */}
              <input
                type="text"
                value={exudateLevel}
                onChange={(e) => setExudateLevel(e.target.value)}
                placeholder="mis. bening sedikit / keruh sedang / berdarah"
                className="w-full h-11 px-3 rounded-xl border border-nh-garis-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-nh-kabut mb-1">
                Rencana kontrol berikutnya
              </label>
              {/* Dulu selalu "3 hari lagi", untuk setiap pasien. */}
              <input
                type="text"
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                placeholder="mis. 3 hari lagi, atau tanggalnya"
                className="w-full h-11 px-3 rounded-xl border border-nh-garis-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-nh-kabut mb-1">
              Instruksi untuk pasien & keluarga
            </label>
            <input
              type="text"
              value={homecareInstructions}
              onChange={(e) => setHomecareInstructions(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-nh-garis-2 text-xs"
            />
          </div>

          {galatCatatan && (
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              {galatCatatan}
            </p>
          )}

          <div className="pt-2 border-t border-nh-garis space-y-3">
            <div className="text-[11px] text-nh-kabut-2 leading-relaxed">
              Dengan menandatangani, Anda menyatakan isi catatan ini benar, atas
              nama {perawat?.licenseNumber ?? "STR Anda"}.
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {syaratTandaTangan ? (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
                  {syaratTandaTangan}
                </span>
              ) : (
                <span className="text-xs text-nh-kabut-2">Siap ditandatangani.</span>
              )}
              <button
                type="button"
                disabled={isSavingNote || !!syaratTandaTangan}
                onClick={handleSaveClinicalNote}
                className="px-6 py-3 rounded-xl bg-nh-ungu-tekan text-nh-putih text-xs font-bold hover:bg-nh-ungu-tua transition flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSavingNote ? "Menyimpan…" : "Tanda tangani & selesaikan kunjungan"}
              </button>
            </div>
          </div>
        </div>
          ) : (
            <div className="bg-nh-panel rounded-2xl border border-nh-garis p-6 text-center space-y-1.5">
              <h3 className="text-base font-bold text-nh-putih">
                Belum ada kunjungan yang ditangani
              </h3>
              <p className="text-xs text-nh-kabut leading-relaxed max-w-sm mx-auto">
                Catatan klinis muncul di sini begitu Anda mengambil sebuah
                permintaan. Belum ada yang perlu ditandatangani.
              </p>
            </div>
          )}
      </div>
      </div>
    </div>
  );
}
