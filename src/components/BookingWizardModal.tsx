"use client";

import React, { useState } from "react";
import { hitungBiaya, rp } from "@/logic/biaya";
import { teksPersetujuanFoto } from "@/logic/consent";
import {
  BATAS_FOTO_PERMINTAAN,
  kecilkanGambar,
  penghalangBerkas,
} from "@/logic/gambar";
import {
  X,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Calendar,
  MapPin,
  CreditCard,
  Stethoscope,
  Scissors,
  UserCheck,
  ArrowRight,
  ArrowLeft,
  Camera,
} from "lucide-react";

interface BookingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: any[];
  dependents: any[];
  addresses: any[];
  initialService?: any | null;
  onBookingCreated: () => void;
}

export function BookingWizardModal({
  isOpen,
  onClose,
  services,
  dependents,
  addresses,
  initialService,
  onBookingCreated,
}: BookingWizardModalProps) {
  const [step, setStep] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<"WOUND_CARE" | "CIRCUMCISION">(
    initialService?.category || "WOUND_CARE"
  );
  const [selectedServiceId, setSelectedServiceId] = useState<number>(
    initialService?.id || services[0]?.id || 1
  );
  const [selectedPatientTarget, setSelectedPatientTarget] = useState<string>(
    dependents[0]?.fullName || "Ibu Siti Aminah (Mother)"
  );

  // Wound Care Pre-Assessment state
  const [woundLocation, setWoundLocation] = useState("Telapak kaki kanan");
  const [woundDuration, setWoundDuration] = useState("1 sampai 4 minggu");
  const [causeOfWound, setCauseOfWound] = useState("Post-Surgical / Diabetic Ulcer");
  const [lengthCm, setLengthCm] = useState(3.2);
  const [widthCm, setWidthCm] = useState(2.0);
  const [tissueType, setTissueType] = useState("Granulation (Pink/Red Healthy Bed)");
  const [exudateAmount, setExudateAmount] = useState("Moderate");
  const [exudateType, setExudateType] = useState("Serous (Clear Amber)");
  const [painScore, setPainScore] = useState(3);
  const [hasFever, setHasFever] = useState(false);
  const [hasSevereBleeding, setHasSevereBleeding] = useState(false);

  // Circumcision Pre-Assessment state
  const [patientAgeYears, setPatientAgeYears] = useState(9);
  const [weightKg, setWeightKg] = useState(29);
  const [methodPreferred, setMethodPreferred] = useState(
    "Smart Klamp / Super-Ring (bius tanpa jarum)"
  );
  const [bleedingDisorders, setBleedingDisorders] = useState("Tidak ada");
  const [guardianName, setGuardianName] = useState("Budi Santoso (Ayah)");
  const [consentGiven, setConsentGiven] = useState(true);

  // Address & Schedule state
  const [selectedAddress, setSelectedAddress] = useState(
    addresses[0]?.fullAddress || "Jl. Bunga Coklat No. 18, Jatimulyo, Lowokwaru, Kota Malang"
  );
  const [scheduledDate, setScheduledDate] = useState("2026-05-16");
  const [scheduledTimeSlot, setScheduledTimeSlot] = useState("09:00 - 10:30 WIB");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Foto luka dari pasien, beserta persetujuan pemakaiannya yang terpisah.
  const [fotoLuka, setFotoLuka] = useState<string[]>([]);
  const [sedangKecilkan, setSedangKecilkan] = useState(false);
  const [galatFoto, setGalatFoto] = useState<string | null>(null);
  const [persetujuanFoto, setPersetujuanFoto] = useState(false);
  const [lihatConsentFoto, setLihatConsentFoto] = useState(false);
  const [galatKirim, setGalatKirim] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentService =
    services.find((s) => s.id === Number(selectedServiceId)) || services[0];

  // Semua yang menyangkut uang lewat satu tempat: src/logic/biaya.ts.
  // Biaya bahan ikut layanannya, biaya jarak dihitung dari koordinat alamat.
  const alamatTerpilih = addresses.find((a: any) => a.fullAddress === selectedAddress) ?? addresses[0];
  const biaya = hitungBiaya({
    basePriceIdr: currentService?.basePriceIdr,
    suppliesFeeIdr: currentService?.suppliesFeeIdr,
    tujuan: alamatTerpilih ? { lat: alamatTerpilih.latitude, lng: alamatTerpilih.longitude } : null,
  });
  const basePriceIdr = biaya.dasar;
  const distanceFeeIdr = biaya.jarak.biaya;
  const suppliesFeeIdr = biaya.bahan;
  const totalPriceIdr = biaya.total;

  // Tanda bahaya kini dari centangnya sendiri, tidak lagi bergantung pada
  // skor nyeri yang sudah tidak ditanyakan ke keluarga.
  const isEmergencyRedFlag = hasSevereBleeding || hasFever;

  // Apa yang menghalangi langkah berikutnya. Sebelumnya tombol "Lanjut"
  // tidak pernah mati sekali pun: seluruh empat langkah bisa dilewati tanpa
  // mengisi apa-apa, dan perawat menerima pesanan berisi nilai bawaan.
  const penghalang: string | null =
    step === 1 && !currentService
      ? "Pilih layanan dulu."
    : step === 2 && selectedCategory === "WOUND_CARE" && !woundLocation.trim()
      ? "Isi dulu bagian tubuh mana yang luka."
    : step === 2 && selectedCategory === "WOUND_CARE" && isEmergencyRedFlag
      ? "Tanda bahaya tercentang — kunjungan rumah tidak bisa dilanjutkan."
    : step === 2 && selectedCategory === "CIRCUMCISION" && !guardianName.trim()
      ? "Isi dulu nama wali."
    : step === 3 && !selectedAddress.trim()
      ? "Isi dulu alamat kunjungan."
    // Foto sudah dilampirkan tapi persetujuannya belum dicentang. Menyimpan
    // data kesehatan tanpa persetujuan tegas melanggar UU 27/2022 Pasal 20
    // ayat (2) huruf a — jadi ditahan di sini, bukan diam-diam disimpan.
    : step === 4 && fotoLuka.length > 0 && !persetujuanFoto
      ? "Centang persetujuan pemakaian foto, atau hapus fotonya."
    : null;

  const handleConfirmBooking = async () => {
    setIsSubmitting(true);
    setGalatKirim(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_BOOKING",
          patientName: "Budi Santoso",
          dependentName: selectedPatientTarget,
          serviceId: currentService.id,
          serviceName: currentService.name,
          serviceCategory: selectedCategory,
          addressId: alamatTerpilih?.id ?? null,
          addressText: selectedAddress,
          scheduledDate,
          scheduledTimeSlot,
          patientId: 1,
          fotoLuka,
          persetujuanFoto,
          triageRedFlag: isEmergencyRedFlag,
          triageNotes: isEmergencyRedFlag
            ? "Keluarga menandai gejala berisiko saat memesan; perawat diberi tahu."
            : "Pengkajian awal terisi normal.",
          woundAssessment:
            selectedCategory === "WOUND_CARE"
              ? {
                  woundLocation,
                  woundDuration,
                  causeOfWound,
                  lengthCm,
                  widthCm,
                  depthCm: 0.3,
                  tissueType,
                  exudateAmount,
                  exudateType,
                  odor: "None",
                  periwoundCondition: "Intact",
                  painScore,
                  infectionSigns: hasFever,
                  fever: hasFever,
                  bleeding: hasSevereBleeding ? "Severe" : "Minimal",
                }
              : null,
          circumcisionAssessment:
            selectedCategory === "CIRCUMCISION"
              ? {
                  patientAgeYears,
                  weightKg,
                  methodPreferred,
                  bleedingDisorders,
                  allergies: "None",
                  guardianName,
                  guardianPhone: "+62 812-3456-7890",
                  consentGiven,
                }
              : null,
        }),
      });
      // Sebelumnya jawaban server tidak pernah diperiksa: modalnya tetap
      // tertutup dan pasien mengira permintaannya terkirim, padahal server
      // bisa saja menolaknya.
      const jawaban = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalatKirim(jawaban?.error || "Permintaan gagal dikirim. Coba lagi.");
        return;
      }
      onBookingCreated();
      onClose();
    } catch (e) {
      console.error("Gagal mengirim permintaan:", e);
      setGalatKirim("Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-nh-malam/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-nh-panel rounded-2xl max-w-3xl w-full shadow-2xl border border-nh-garis overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-nh-malam text-nh-putih flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-wider font-bold text-nh-ungu-muda">
              Langkah {step} dari 4
            </span>
            <h2 className="text-lg font-bold mt-0.5">
              {step === 1 && "1. Pilih layanan & untuk siapa"}
              {step === 2 &&
                (selectedCategory === "WOUND_CARE"
                  ? "2. Keadaan luka saat ini"
                  : "2. Circumcision Medical Screening & Method Selection")}
              {step === 3 && "3. Alamat & jadwal kunjungan"}
              {step === 4 && "4. Foto luka & kirim permintaan"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-nh-kabut-2 hover:text-nh-putih hover:bg-nh-panel-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-nh-panel-2 h-1.5">
          <div
            className="bg-nh-ungu-tekan h-1.5 transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        {/* Step Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* STEP 1: SERVICE & PATIENT */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut mb-3">
                  Pilih jenis layanan
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("WOUND_CARE");
                      const firstWound = services.find((s) => s.category === "WOUND_CARE");
                      if (firstWound) setSelectedServiceId(firstWound.id);
                    }}
                    className={`p-4 rounded-xl border-2 text-left transition flex items-start gap-3.5 ${
                      selectedCategory === "WOUND_CARE"
                        ? "border-nh-ungu bg-nh-ungu/60"
                        : "border-nh-garis hover:border-nh-garis-2"
                    }`}
                  >
                    <div className="p-2.5 rounded-xl bg-nh-ungu-tekan text-nh-putih">
                      <Stethoscope className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-nh-putih text-sm">
                        Perawatan luka
                      </div>
                      <p className="text-xs text-nh-kabut mt-0.5">
                        Luka jahitan operasi, ulkus kaki diabetik, luka tekan, dan ganti balut steril.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("CIRCUMCISION");
                      const firstCirc = services.find((s) => s.category === "CIRCUMCISION");
                      if (firstCirc) setSelectedServiceId(firstCirc.id);
                    }}
                    className={`p-4 rounded-xl border-2 text-left transition flex items-start gap-3.5 ${
                      selectedCategory === "CIRCUMCISION"
                        ? "border-nh-ungu bg-nh-ungu/60"
                        : "border-nh-garis hover:border-nh-garis-2"
                    }`}
                  >
                    <div className="p-2.5 rounded-xl bg-nh-ungu-tekan text-nh-putih">
                      <Scissors className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-nh-putih text-sm">
                        Sunat di rumah
                      </div>
                      <p className="text-xs text-nh-kabut mt-0.5">
                        Sunat anak tanpa jarum dengan Super-Ring / Smart Klamp, dan sunat dewasa dengan laser.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Select Specific Procedure */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut mb-2">
                  Pilih layanannya
                </label>
                <div className="space-y-2.5">
                  {services
                    .filter((s) => s.category === selectedCategory)
                    .map((service) => (
                      <div
                        key={service.id}
                        onClick={() => setSelectedServiceId(service.id)}
                        className={`p-4 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          selectedServiceId === service.id
                            ? "border-nh-ungu bg-nh-ungu/40 ring-2 ring-nh-ungu/20"
                            : "border-nh-garis hover:bg-nh-panel-2"
                        }`}
                      >
                        <div className="pr-4">
                          <div className="font-bold text-nh-putih text-sm">
                            {service.name}
                          </div>
                          <p className="text-xs text-nh-kabut mt-1">
                            {service.description}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-nh-ungu-muda text-sm">
                            {rp(service.basePriceIdr)}
                          </div>
                          <div className="text-[11px] text-nh-kabut">
                            {service.durationMinutes} mins visit
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Select Patient or Family Dependent */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut mb-2">
                  Who is receiving care? (Patient or Family Dependent)
                </label>
                <select
                  value={selectedPatientTarget}
                  onChange={(e) => setSelectedPatientTarget(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-nh-garis-2 text-sm font-medium bg-nh-panel focus:ring-2 focus:ring-nh-ungu focus:outline-none"
                >
                  <option value="Ibu Siti Aminah (ibu — 69 th, luka diabetes)">
                    Ibu Siti Aminah (ibu — 69 th, perawatan luka diabetes)
                  </option>
                  <option value="Rafa Santoso (anak — 9 th)">
                    Rafa Santoso (anak — 9 th)
                  </option>
                  <option value="Budi Santoso (Self — Primary Account Holder)">
                    Budi Santoso (Self — Primary Account Holder)
                  </option>
                </select>
              </div>
            </div>
          )}

          {/* ================= LANGKAH 2 — KONDISI LUKA =================
              Ditulis ulang. Versi sebelumnya meminta PASIEN mengukur luka
              dalam sentimeter dan menggolongkan jaringannya (granulasi,
              slough, nekrotik) — itu pengkajian perawat, bukan pertanyaan
              untuk keluarga. Keluarga harus membuka perban untuk menjawabnya,
              padahal petunjuk persiapan justru melarang itu; jawabannya
              tebakan; dan tebakan itu menentukan harga serta perawat yang
              dikirim.

              Sekarang: tiga pertanyaan yang bisa dijawab siapa pun, plus foto.
              Perawat yang mengukur dan menilai jaringannya saat tiba. */}
          {step === 2 && selectedCategory === "WOUND_CARE" && (
            <div className="space-y-5">
              <p className="text-sm text-nh-kabut leading-relaxed">
                Cukup jawab sebisanya. <strong>Jangan membuka perban</strong> untuk
                menjawab pertanyaan ini &mdash; perawat yang akan memeriksa dan
                mengukur lukanya saat tiba.
              </p>

              <div>
                <label className="block text-xs font-semibold text-nh-kabut mb-1">
                  Lukanya di bagian mana?
                </label>
                <input
                  type="text"
                  value={woundLocation}
                  onChange={(e) => setWoundLocation(e.target.value)}
                  placeholder="Misalnya: telapak kaki kanan"
                  className="w-full h-11 px-3.5 rounded-xl border border-nh-garis-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-nh-kabut mb-2">
                  Sudah berapa lama?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    "Kurang dari 1 minggu",
                    "1 sampai 4 minggu",
                    "1 sampai 3 bulan",
                    "Lebih dari 3 bulan",
                  ].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setWoundDuration(v)}
                      className={`h-11 px-3 rounded-xl border text-sm text-left ${
                        woundDuration === v
                          ? "border-nh-ungu bg-nh-ungu/10 text-nh-ungu-muda font-semibold"
                          : "border-nh-garis-2 text-nh-kabut"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-nh-kabut mb-2">
                  Perbannya bagaimana sekarang?
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { v: "None / Dry", t: "Kering", k: "Tidak ada cairan yang tembus" },
                    { v: "Scant", t: "Lembap sedikit", k: "Ada noda, tapi tidak tembus" },
                    { v: "Moderate", t: "Basah", k: "Cairan tembus ke perban" },
                    { v: "Heavy", t: "Basah sekali", k: "Perban perlu diganti lebih dari sekali sehari" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setExudateAmount(o.v)}
                      className={`w-full px-3.5 py-3 rounded-xl border text-left ${
                        exudateAmount === o.v
                          ? "border-nh-ungu bg-nh-ungu/10"
                          : "border-nh-garis-2"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-nh-putih">{o.t}</span>
                      <span className="block text-xs text-nh-kabut mt-0.5">{o.k}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Unggahan foto dulu ada di sini DAN di langkah 4 — dua
                  kotak "Foto luka" dalam satu wizard, yang satu tanpa
                  persetujuan pemakaian data. Sekarang tinggal satu, di
                  langkah 4, bersama persetujuannya. */}

              {/* ---- penyaringan keselamatan ---- */}
              <div className="pt-1 space-y-2">
                <span className="block text-xs font-semibold text-nh-kabut">
                  Ada tanda ini?
                </span>
                {[
                  { on: hasFever, set: setHasFever, t: "Demam di atas 38°C atau menggigil" },
                  { on: hasSevereBleeding, set: setHasSevereBleeding, t: "Perdarahan hebat yang tidak berhenti" },
                ].map((c) => (
                  <label
                    key={c.t}
                    className="flex items-center gap-3 p-3.5 rounded-xl border border-nh-garis cursor-pointer hover:bg-nh-panel-2"
                  >
                    <input
                      type="checkbox"
                      checked={c.on}
                      onChange={(e) => c.set(e.target.checked)}
                      className="w-4 h-4 accent-nh-ungu rounded"
                    />
                    <span className="text-sm text-nh-putih">{c.t}</span>
                  </label>
                ))}
              </div>

              {/* Tanda bahaya MENGHENTIKAN pemesanan, bukan sekadar
                  memperingatkan. Sebelumnya spanduk ini bilang "perawat kami
                  tetap bisa datang" sementara tombol Bayar tetap menyala —
                  padahal asisten AI di aplikasi yang sama menolak gejala
                  serupa dan menyuruh ke IGD. Dua jawaban berlawanan untuk satu
                  gejala, dan orang panik menekan tombol yang paling menonjol. */}
              {isEmergencyRedFlag && (
                <div className="p-4 rounded-xl bg-red-50 border-2 border-red-500 space-y-3">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="w-6 h-6 text-red-600 shrink-0" />
                    <div className="text-sm text-red-900">
                      <div className="font-bold text-red-700 mb-1">
                        Jangan tunggu kunjungan rumah
                      </div>
                      Perdarahan hebat atau demam tinggi bisa menandakan kondisi
                      yang butuh penanganan gawat darurat sekarang. Pemesanan
                      kami hentikan sampai tanda ini hilang.
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href="tel:119"
                      className="flex-1 text-center py-2.5 rounded-xl bg-red-600 text-nh-putih text-sm font-bold"
                    >
                      Telepon 119
                    </a>
                    <a
                      href="tel:+62341362101"
                      className="flex-1 text-center py-2.5 rounded-xl border border-red-400 text-red-700 text-sm font-bold"
                    >
                      IGD RSSA Malang
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}


          {/* STEP 2 FOR CIRCUMCISION */}
          {step === 2 && selectedCategory === "CIRCUMCISION" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-nh-kabut mb-1">
                    Usia (tahun)
                  </label>
                  <input
                    type="number"
                    value={patientAgeYears}
                    onChange={(e) => setPatientAgeYears(Number(e.target.value))}
                    className="w-full h-11 px-3.5 rounded-xl border border-nh-garis-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-nh-kabut mb-1">
                    Berat badan (kg)
                  </label>
                  <input
                    type="number"
                    value={weightKg}
                    onChange={(e) => setWeightKg(Number(e.target.value))}
                    className="w-full h-11 px-3.5 rounded-xl border border-nh-garis-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-nh-kabut mb-1">
                  Metode yang dipilih
                </label>
                <select
                  value={methodPreferred}
                  onChange={(e) => setMethodPreferred(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-nh-garis-2 text-sm bg-nh-panel"
                >
                  <option>
                    Modern Super-Ring / Smart Klamp (Needle-Free Anesthesia — Seamless Bathing)
                  </option>
                  <option>
                    Laser bipolar (perdarahan minimal)
                  </option>
                  <option>
                    Metode jahit klasik
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-nh-kabut mb-1">
                  Riwayat gangguan pembekuan darah
                </label>
                <input
                  type="text"
                  value={bleedingDisorders}
                  onChange={(e) => setBleedingDisorders(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-nh-garis-2 text-sm"
                />
              </div>

              <label className="flex items-start gap-3 p-4 rounded-xl bg-nh-ungu/10 border border-nh-ungu/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="w-4 h-4 accent-nh-ungu mt-0.5"
                />
                <span className="text-xs text-nh-ungu-muda leading-relaxed">
                  <strong>Parent / Legal Guardian Informed Consent:</strong> I confirm that I am the legal guardian/patient and consent to home pre-procedure clinical verification by a licensed STR-certified practitioner.
                </span>
              </label>
            </div>
          )}

          {/* STEP 3: ADDRESS & SCHEDULE */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut mb-2">
                  Alamat kunjungan
                </label>
                <textarea
                  rows={3}
                  value={selectedAddress}
                  onChange={(e) => setSelectedAddress(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-nh-garis-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut mb-2">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full h-12 px-3.5 rounded-xl border border-nh-garis-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut mb-2">
                    Pilih jam
                  </label>
                  <select
                    value={scheduledTimeSlot}
                    onChange={(e) => setScheduledTimeSlot(e.target.value)}
                    className="w-full h-12 px-3.5 rounded-xl border border-nh-garis-2 text-sm bg-nh-panel"
                  >
                    <option>08:00 - 09:30 WIB (Morning Window)</option>
                    <option>10:00 - 11:30 WIB (Late Morning)</option>
                    <option>13:30 - 15:00 WIB (Sesudahnoon Window)</option>
                    <option>16:00 - 17:30 WIB (Evening Visit)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: SMART PRICING & PAYMENT */}
          {/* ================= LANGKAH 4 — KIRIM PERMINTAAN =================
              Dulu langkah ini menampilkan rincian biaya lengkap lalu tombol
              "Bayar". Angkanya kelihatan pasti, padahal belum ada satu orang
              pun yang melihat lukanya — biaya bahan baru bisa dihitung
              setelah ada yang menilai. Sekarang langkah ini mengirim
              PERMINTAAN, dan angka yang ditampilkan disebut apa adanya:
              perkiraan kasar, bukan tagihan.
              ================================================================ */}
          {step === 4 && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-nh-ungu/30 bg-nh-ungu/5 p-4 space-y-2">
                <div className="text-sm font-bold text-nh-putih">
                  Belum ada yang ditagihkan
                </div>
                <p className="text-xs text-nh-kabut leading-relaxed">
                  Permintaan ini dikirim ke perawat. Ia akan melihat foto dan
                  keterangan Anda, lalu mengirim rincian bahan, biaya, dan
                  jadwal. Anda membayar hanya setelah menyetujui rinciannya.
                </p>
              </div>

              {/* Foto luka. Untuk perawatan luka inilah yang paling
                  menentukan tepat-tidaknya penawaran perawat. */}
              {selectedCategory === "WOUND_CARE" && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut">
                    Foto luka
                    <span className="ml-1.5 normal-case font-medium text-nh-kabut-2">
                      — boleh dilewati, tapi sangat membantu
                    </span>
                  </label>

                  {fotoLuka.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {fotoLuka.map((f, i) => (
                        <div key={i} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={f}
                            alt={`Foto luka ${i + 1}`}
                            className="w-full h-20 object-cover rounded-xl border border-nh-garis"
                          />
                          <button
                            type="button"
                            onClick={() => setFotoLuka(fotoLuka.filter((_, j) => j !== i))}
                            aria-label={`Hapus foto ${i + 1}`}
                            className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-nh-bahaya text-nh-malam text-xs font-bold"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {fotoLuka.length < BATAS_FOTO_PERMINTAAN && (
                    <label className={`flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed border-nh-garis-2 text-sm text-nh-kabut hover:bg-nh-panel-2 ${sedangKecilkan ? "opacity-50 cursor-wait" : "cursor-pointer"}`}>
                      <Camera className="w-4 h-4" />
                      {sedangKecilkan
                        ? "Menyiapkan foto…"
                        : `Ambil atau pilih foto (${fotoLuka.length}/${BATAS_FOTO_PERMINTAAN})`}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={sedangKecilkan}
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;
                          setGalatFoto(null);

                          /**
                           * Dikecilkan DI PONSEL sebelum dikirim.
                           *
                           * Sebelumnya berkasnya dibaca apa adanya —
                           * satu foto kamera menjadi 5,3 MB setelah base64,
                           * dan empat foto berarti kiriman 21 MB dari kuota
                           * pasien. Diukur pada aplikasi yang berjalan:
                           * kiriman sebesar itu diterima tanpa keluhan, lalu
                           * mengendap di basis data selamanya.
                           */
                          const halangan = penghalangBerkas(f);
                          if (halangan) {
                            setGalatFoto(halangan);
                            return;
                          }
                          setSedangKecilkan(true);
                          try {
                            const hasil = await kecilkanGambar(f);
                            setFotoLuka((lama) => [...lama, hasil.dataUrl].slice(0, BATAS_FOTO_PERMINTAAN));
                          } catch (err) {
                            setGalatFoto(
                              err instanceof Error ? err.message : "Foto ini tidak bisa diproses."
                            );
                          } finally {
                            setSedangKecilkan(false);
                          }
                        }}
                      />
                    </label>
                  )}

                  {galatFoto && (
                    <p className="text-xs text-nh-bahaya leading-relaxed">{galatFoto}</p>
                  )}

                  {/* Dikatakan terang-terangan: pasien tahu fotonya dikecilkan
                      dulu, jadi tidak heran kalau yang tersimpan tidak setajam
                      aslinya — dan tahu kuotanya tidak terpakai besar. */}
                  <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
                    Foto dikecilkan otomatis di ponsel Anda sebelum dikirim, supaya
                    hemat kuota. Ketajamannya tetap cukup untuk menilai luka.
                  </p>

                  {/* Persetujuan foto DIPISAH dari persetujuan tindakan.
                      Foto luka adalah data kesehatan — data pribadi bersifat
                      spesifik menurut UU 27/2022 Pasal 4 ayat (2) — dan
                      Pasal 20 ayat (2) huruf a menuntut persetujuan yang
                      tegas untuk tujuan tertentu. Satu kotak centang untuk
                      dua hal berbeda bukan persetujuan yang tegas. */}
                  {fotoLuka.length > 0 && (
                    <label className="flex items-start gap-2.5 p-3 rounded-xl border border-nh-garis bg-nh-panel-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={persetujuanFoto}
                        onChange={(e) => setPersetujuanFoto(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-[#A855F7] shrink-0"
                      />
                      <span className="text-[11px] text-nh-kabut leading-relaxed">
                        Saya setuju foto ini disimpan dan dipakai untuk menilai
                        luka serta membandingkan hasil perawatan. Hanya perawat
                        yang menangani dan penanggung jawab klinis yang bisa
                        melihatnya. Disimpan 25 tahun sesuai kewajiban rekam medis
                        (Permenkes 24/2022), tidak dipakai untuk iklan, dan
                        bisa saya tarik persetujuannya kapan saja.{" "}
                        <button
                          type="button"
                          onClick={() => setLihatConsentFoto((v) => !v)}
                          className="underline font-semibold text-nh-ungu-muda"
                        >
                          {lihatConsentFoto ? "Tutup" : "Baca selengkapnya"}
                        </button>
                      </span>
                    </label>
                  )}

                  {lihatConsentFoto && (
                    <pre className="text-[10px] text-nh-kabut whitespace-pre-wrap bg-nh-malam border border-nh-garis rounded-xl p-3 max-h-56 overflow-y-auto leading-relaxed font-mono">
                      {teksPersetujuanFoto(selectedPatientTarget || "saya")}
                    </pre>
                  )}
                </div>
              )}

              {/* Perkiraan kasar. Disebut perkiraan, bukan total. */}
              <div className="bg-nh-panel-2 rounded-2xl p-4 border border-nh-garis space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-nh-kabut">
                  Perkiraan kasar
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-nh-kabut">{currentService?.name}</span>
                  <span className="font-mono">{rp(basePriceIdr)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-nh-kabut">
                    Perjalanan perawat
                    <span className="block text-[11px] text-nh-kabut-2">
                      {biaya.jarak.km > 0
                        ? `${biaya.jarak.label} — ${biaya.jarak.km
                            .toFixed(1)
                            .replace(".", ",")} km`
                        : biaya.jarak.label}
                    </span>
                  </span>
                  <span className="font-mono">{rp(distanceFeeIdr)}</span>
                </div>
                {suppliesFeeIdr > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-nh-kabut">Bahan (paket standar)</span>
                    <span className="font-mono">{rp(suppliesFeeIdr)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-nh-garis flex justify-between items-baseline">
                  <span className="text-sm font-bold text-nh-putih">Sekitar</span>
                  <span className="font-bold text-lg text-nh-kabut font-mono">
                    {rp(totalPriceIdr)}
                  </span>
                </div>
                <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
                  Angka ini belum mengikat. Bahan yang benar-benar dibutuhkan
                  ditentukan perawat setelah melihat luka, dan setiap
                  perubahannya harus ia beri alasan.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="px-6 py-4 bg-nh-panel-2 border-t border-nh-garis space-y-3">
          {/* Alasan tombol terkunci diletakkan di barisnya sendiri.
              Sebelumnya ia diselipkan di antara "Kembali" dan "Lanjut" di
              baris yang sama; di layar ponsel kolomnya tinggal ~60px, jadi
              kalimatnya patah satu kata per baris lalu terpotong. Yang
              tidak terbaca justru pesan keselamatannya. */}
          {(penghalang || galatKirim) && (
            <div className="flex items-start gap-2 text-xs text-nh-bahaya bg-nh-bahaya/10 border border-nh-bahaya/30 rounded-xl px-3 py-2 leading-relaxed">
              <span aria-hidden="true" className="font-bold">!</span>
              <span>{galatKirim ?? penghalang}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-4 py-2.5 rounded-xl border border-nh-garis-2 text-nh-kabut text-xs font-semibold hover:bg-nh-panel-2 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" /> Kembali
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              type="button"
              disabled={!!penghalang}
              onClick={() => setStep(step + 1)}
              className="nh-tombol px-6 py-3 text-xs flex items-center gap-2"
            >
              Lanjut <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting || !!penghalang || isEmergencyRedFlag}
              onClick={handleConfirmBooking}
              className="nh-tombol px-6 py-3 text-xs flex items-center gap-2"
            >
              {isSubmitting ? "Mengirim…" : "Kirim permintaan"}
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
