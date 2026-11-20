"use client";

import React, { useState } from "react";
import { bolehBatal, tanggalIndo } from "@/logic/sesi";
import { S, namaStatus, PENJELASAN_STATUS, TAHAP, tahapSekarang, inisial } from "@/logic/alur";
import { PanelPersetujuan } from "./PanelPersetujuan";
import { PanelPembayaran } from "./PanelPembayaran";
import { PanelHasilKunjungan } from "./PanelHasilKunjungan";
import { PanelTestimoni } from "./PanelTestimoni";
import { ringkasNilai, bintangTeks } from "@/logic/testimoni";

/** Status yang berarti perawatnya pasti datang — sama dengan penjaga di /api/foto-perawat. */
const KUNJUNGAN_PASTI: string[] = [S.DIBAYAR, S.PERAWAT_BERANGKAT, S.PERAWAT_TIBA, S.DIKERJAKAN, S.SELESAI];
import { rp } from "@/logic/biaya";
import {
  ShieldCheck,
  MapPin,
  Clock,
  CheckCircle2,
  Stethoscope,
  Scissors,
  Sparkles,
  MessageSquare,
  TrendingDown,
  PhoneCall,
  HeartHandshake,
  Star,
  Plus,
  UserPlus,
  Send,
  Activity,
  Camera,
  ClipboardList,
} from "lucide-react";
import { PhotoGallery } from "./PhotoGallery";

interface PatientPortalProps {
  services: any[];
  providers: any[];
  bookings: any[];
  woundTimelineEntries: any[];
  clinicalNotes: any[];
  dependents: any[];
  reviews: any[];
  messages: any[];
  taskPhotos: any[];
  onOpenBookingWizard: (service?: any) => void;
  onOpenAiAssistant: () => void;
  onSendMessage: (content: string) => void;
  onAddDependent: (dep: any) => void;
  onCancelBooking: (bookingId: number, alasan: string) => void | Promise<void>;
  quoteItems: any[];
  visitReports: any[];
  testimoni: any[];
  addresses: any[];
  sesi: { userId: number | null; nama: string | null; peran: string };
  onRefresh: () => void;
}

export function PatientPortal({
  services,
  providers,
  bookings,
  woundTimelineEntries,
  clinicalNotes,
  dependents,
  reviews,
  messages,
  taskPhotos,
  onOpenBookingWizard,
  onOpenAiAssistant,
  onSendMessage,
  onAddDependent,
  onCancelBooking,
  quoteItems,
  visitReports,
  testimoni,
  sesi,
  onRefresh,
}: PatientPortalProps) {
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "WOUND_CARE" | "CIRCUMCISION">("ALL");
  const [chatInput, setChatInput] = useState("");
  const [showAddDependentModal, setShowAddDependentModal] = useState(false);
  const [depName, setDepName] = useState("");
  const [depRelation, setDepRelation] = useState("Orang tua");
  const [depDob, setDepDob] = useState("1958-04-10");
  const [depNotes, setDepNotes] = useState("");

  /**
   * Kunjungan yang sedang berjalan.
   *
   * Dulu ini `bookings[0]` — pemesanan pertama yang kebetulan dikembalikan
   * basis data. Begitu ada riwayat kunjungan yang sudah selesai, kartu
   * berlabel "KUNJUNGAN BERJALAN" di layar depan menampilkan kunjungan yang
   * sudah lewat: pasien melihat perawat "sedang menuju rumah" untuk
   * kunjungan minggu lalu, dan tombol batalnya ikut hilang. Sekarang yang
   * dipilih adalah kunjungan yang benar-benar belum selesai, yang paling
   * dekat jadwalnya.
   */
  /**
   * Nilai statusnya "SELESAI" dan "DIBATALKAN", bukan bahasa Inggris.
   * Dengan daftar yang salah, saringan ini tidak pernah membuang apa pun:
   * kunjungan yang sudah selesai ikut dihitung sebagai "sedang berjalan",
   * dan kartu di layar depan pasien bisa menunjuk kunjungan minggu lalu.
   */
  const SELESAI: string[] = [S.SELESAI, S.DIBATALKAN];
  const kunjunganBerjalan = [...bookings]
    .filter((b: any) => !SELESAI.includes(b.status))
    .sort((a: any, b: any) =>
      String(a.scheduledDate ?? "").localeCompare(String(b.scheduledDate ?? ""))
    );

  /**
   * Daftar semua kunjungan pasien: yang akan datang lebih dulu, lalu yang
   * sudah lewat (terbaru di atas).
   *
   * Sampai sekarang portal pasien hanya menampilkan SATU kunjungan dan tidak
   * pernah memetakan sisanya — `bookings.map` tidak ada di berkas ini sama
   * sekali. Akibatnya Pak Budi yang memesan dua kunjungan hanya bisa melihat
   * satu: yang satunya tidak bisa dilihat, tidak bisa dibatalkan, dan catatan
   * klinis kunjungan yang sudah lewat tidak bisa dibuka lagi.
   */
  const daftarKunjungan = [
    ...kunjunganBerjalan,
    ...[...bookings]
      .filter((b: any) => SELESAI.includes(b.status))
      .sort((a: any, b: any) =>
        String(b.scheduledDate ?? "").localeCompare(String(a.scheduledDate ?? ""))
      ),
  ];

  const [idDipilih, setIdDipilih] = useState<number | null>(null);
  const activeBooking =
    daftarKunjungan.find((b: any) => b.id === idDipilih) ??
    kunjunganBerjalan[0] ??
    bookings[0];

  // Catatan klinis untuk kunjungan yang sedang dibuka.
  const catatanKunjungan = clinicalNotes.find((c: any) => c.bookingId === activeBooking?.id);
  const statusBatal = bolehBatal(activeBooking);
  const tahapIni = tahapSekarang(activeBooking?.status);

  /**
   * Testimoni yang boleh tampil di halaman depan.
   *
   * Dua syarat, keduanya keputusan PASIEN lalu disetujui admin: statusnya
   * TAYANG, dan izinnya bukan JANGAN_TAYANG. Syarat kedua terlihat berlebihan
   * karena API sudah menolaknya — tapi kalau nanti ada jalan masuk data lain
   * (impor, perbaikan manual di basis data), layar ini tetap tidak akan
   * menayangkan tulisan orang yang memintanya tidak ditayangkan.
   */
  const tayang = (testimoni ?? []).filter(
    (t: any) => t.statusTinjauan === "TAYANG" && t.izinTayang !== "JANGAN_TAYANG"
  );

  /**
   * Angka bintang di halaman depan dihitung dari SELURUH testimoni, bukan
   * hanya yang ditayangkan.
   *
   * Bedanya besar. Data contoh di sini berisi satu testimoni 5★ yang tayang
   * dan satu testimoni 3★ yang pasiennya minta tidak ditayangkan. Kalau
   * hanya yang tayang yang dihitung, halaman depan berbunyi "5,0 ★" —
   * angka yang benar secara aritmetika tapi menyesatkan, karena yang
   * menaikkannya adalah keputusan admin memilih mana yang tampil.
   *
   * Yang boleh dipilih admin adalah CERITA mana yang tampil. Angkanya tidak.
   */
  const ringkasPublik = ringkasNilai(testimoni ?? []);
  const perawatKunjungan = providers.find(
    (p: any) => p.id === activeBooking?.providerId
  );

  const filteredServices = services.filter((s) =>
    categoryFilter === "ALL" ? true : s.category === categoryFilter
  );

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    onSendMessage(chatInput);
    setChatInput("");
  };

  const handleCreateDependent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!depName.trim()) return;
    onAddDependent({
      fullName: depName,
      relationship: depRelation,
      dateOfBirth: depDob,
      gender: "Female",
      weightKg: 58,
      medicalNotes: depNotes || "Tidak ada alergi yang diketahui",
    });
    setDepName("");
    setDepNotes("");
    setShowAddDependentModal(false);
  };

  return (
    <div className="space-y-12 pb-16">
      {/* HERO SECTION */}
      {/* Sebelumnya gradasi biru-toska muda dari templat asal. Teks di
          dalamnya sudah diubah jadi putih, jadi hasilnya putih di atas
          putih — kalimat pembuka aplikasi tidak terbaca sama sekali. */}
      <section className="relative bg-gradient-to-br from-nh-panel-2 via-nh-panel to-nh-malam border-b border-nh-garis/80 py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Hero Copy (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-nh-ungu/10 border border-nh-ungu/20 text-nh-ungu-muda text-xs font-bold">
              <ShieldCheck className="w-4 h-4 text-nh-ungu shrink-0" />
              Perawat ber-STR • Kota Malang, Kota Batu, Singosari & Kepanjen
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-nh-putih tracking-tight leading-[1.15]">
              Perawatan luka & sunat{" "}
              <span className="text-nh-ungu-muda">di rumah Anda</span>
            </h1>

            <p className="text-base sm:text-lg text-nh-kabut leading-relaxed max-w-2xl">
              Perawat bersertifikat perawatan luka (CWCS) dan sunat tanpa jarum
              datang ke rumah — kesterilan standar rumah sakit, tanpa perlu
              menempuh perjalanan sambil menahan sakit.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={() => onOpenBookingWizard()}
                className="nh-tombol px-7 py-4 text-sm flex items-center gap-2"
              >
                <Stethoscope className="w-4 h-4" /> Pesan kunjungan
              </button>

              <button
                onClick={onOpenAiAssistant}
                className="px-6 py-4 rounded-xl bg-nh-panel text-nh-putih font-bold text-sm border-2 border-nh-garis hover:border-nh-ungu transition flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-nh-ungu" /> Tanya dulu soal luka
              </button>
            </div>

            {/* Tiga alasan untuk percaya. Di layar kecil tiga kolom membuat
                tiap kolom selebar 100px dan judulnya patah jadi tiga baris,
                jadi di ponsel ditumpuk. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-nh-garis/70">
              <div>
                <div className="font-bold text-nh-putih text-sm">Semua ber-STR</div>
                <div className="text-xs text-nh-kabut">Perawat ICU & bersertifikat CWCS</div>
              </div>
              <div>
                <div className="font-bold text-nh-putih text-sm">Tanpa jarum</div>
                <div className="text-xs text-nh-kabut">Smart Klamp & Super-Ring</div>
              </div>
              <div>
                {/* Angka ini dulu ditulis mati "4,97 ★ — lebih dari 1.500
                    kunjungan". Sekarang dihitung dari testimoni yang
                    benar-benar ada; kalau belum ada, dikatakan belum ada. */}
                <div className="font-bold text-nh-putih text-sm">
                  {ringkasPublik.jumlah
                    ? `${bintangTeks(ringkasPublik.rata)} ★ dari pasien`
                    : "Layanan baru"}
                </div>
                <div className="text-xs text-nh-kabut">
                  {ringkasPublik.jumlah
                    ? `Dari ${ringkasPublik.jumlah} testimoni`
                    : "Testimoni pertama menyusul"}
                </div>
              </div>
            </div>
          </div>

          {/* Right Hero Card: Live Active Dispatch Tracker (5 cols) */}
          <div className="lg:col-span-5">
            {activeBooking && (
              <div className="bg-nh-panel rounded-2xl border-2 border-nh-ungu/30 shadow-xl p-6 space-y-5 relative overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  {/* Label ini dulu selalu berbunyi "KUNJUNGAN BERJALAN",
                      termasuk untuk kunjungan yang sudah selesai atau
                      dibatalkan. Sekarang mengikuti statusnya. */}
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                      tahapIni === -1
                        ? "bg-nh-kabut-2/15 text-nh-kabut"
                        : tahapIni >= TAHAP.length - 1
                        ? "bg-nh-sembuh/15 text-nh-sembuh"
                        : "bg-nh-ungu/15 text-nh-ungu-muda"
                    }`}
                  >
                    {tahapIni !== -1 && tahapIni < TAHAP.length - 1 && (
                      <span className="w-2 h-2 rounded-full bg-nh-ungu-tekan animate-ping" />
                    )}
                    {namaStatus(activeBooking.status)}
                  </span>
                  <span className="font-mono text-xs font-bold text-nh-kabut">
                    #{activeBooking.bookingCode}
                  </span>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase text-nh-kabut-2">
                    Pasien & layanan
                  </div>
                  <div className="text-base font-bold text-nh-putih mt-0.5">
                    {activeBooking.dependentName || activeBooking.patientName}
                  </div>
                  <div className="text-xs font-semibold text-nh-ungu-muda">
                    {activeBooking.serviceName}
                  </div>
                </div>

                {/* Kartu perawat. Inisial, nama, dan nomor STR diambil dari
                    data — dulu "RD" dan "Ns. Ratna Dewi, CWCS" ditulis mati,
                    begitu juga "perkiraan tiba 14 menit ke Sawojajar" yang
                    muncul apa pun status dan alamatnya. */}
                {activeBooking.providerName ? (
                  <div className="p-3.5 rounded-xl bg-nh-panel-2 border border-nh-garis space-y-3">
                    <div className="flex items-center gap-3">
                      {/* Foto wajah hanya setelah kunjungannya pasti (sudah
                          dibayar), dan hanya yang sudah dicocokkan admin
                          dengan KTP — server yang menjaga keduanya. */}
                      {perawatKunjungan?.adaFoto && KUNJUNGAN_PASTI.includes(activeBooking.status) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/foto-perawat?id=${activeBooking.providerId}`}
                          alt={`Foto ${activeBooking.providerName}`}
                          className="w-16 h-16 shrink-0 rounded-xl object-cover border border-nh-garis"
                        />
                      ) : (
                        <div className="w-11 h-11 shrink-0 rounded-xl bg-nh-ungu-tekan text-white font-bold flex items-center justify-center">
                          {inisial(activeBooking.providerName)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-nh-putih">
                          {activeBooking.providerName}
                        </div>
                        <div className="text-[11px] text-nh-kabut">
                          {perawatKunjungan?.licenseNumber
                            ? `STR ${perawatKunjungan.licenseNumber}`
                            : "Perawat ber-STR"}
                        </div>
                        {KUNJUNGAN_PASTI.includes(activeBooking.status) && !perawatKunjungan?.adaFoto && (
                          <div className="text-[11px] text-nh-kabut-2 mt-0.5">
                            Foto perawat belum tersedia — cocokkan nama dan STR-nya.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Kode di depan pintu. Hanya layar pasien yang
                        menerimanya; perawat harus mendengarnya dari pasien. */}
                    {activeBooking.kodeKunjungan &&
                      [S.DIBAYAR, S.PERAWAT_BERANGKAT].includes(activeBooking.status) && (
                        <div className="rounded-xl border border-nh-ungu/40 bg-nh-ungu/10 p-3 space-y-1.5">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-nh-ungu-muda">
                            Kode kunjungan
                          </div>
                          <div className="font-mono text-3xl font-bold tracking-[0.3em] text-nh-putih">
                            {activeBooking.kodeKunjungan}
                          </div>
                          <p className="text-[11px] text-nh-kabut leading-relaxed">
                            Sebutkan kode ini <b className="text-nh-putih">hanya</b> kepada perawat
                            yang wajah dan namanya sama dengan di atas. Perawat yang benar
                            tidak bisa melihat kode ini di aplikasinya — ia harus
                            mendengarnya dari Anda. Kalau ragu, jangan buka pintu dan
                            hubungi kami.
                          </p>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-nh-panel-2 border border-dashed border-nh-garis text-xs text-nh-kabut leading-relaxed">
                    Belum ada perawat yang ditugaskan. Perawat ditentukan setelah
                    ada yang meninjau keluhan Anda.
                  </div>
                )}

                {/* Jenjang tahap — mengikuti status sesungguhnya. Di ponsel
                    label enam tahap tidak muat berjajar, jadi barisnya bisa
                    digulir dan tahap yang aktif diberi tanda. */}
                {tahapIni !== -1 && (
                  <div className="space-y-2">
                    <div className="-mx-1 px-1 overflow-x-auto">
                      <div className="flex gap-3 text-[11px] font-bold whitespace-nowrap">
                        {TAHAP.map((t, i) => (
                          <span
                            key={t.label}
                            className={
                              i < tahapIni
                                ? "text-nh-kabut-2"
                                : i === tahapIni
                                ? "text-nh-ungu-muda"
                                : "text-nh-kabut-2/60"
                            }
                          >
                            {i < tahapIni ? "✓ " : ""}
                            {t.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="w-full bg-nh-panel-2 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-nh-ungu-tekan h-full rounded-full transition-all"
                        style={{
                          width: `${((tahapIni + 1) / TAHAP.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* ================= HASIL KUNJUNGAN =================
                    Perawat menulis catatan SOAP lengkap, menandatanganinya
                    dengan nomor STR, dan mengunggah foto sebelum-sesudah —
                    lalu clinicalNotes tidak pernah dibaca di layar ini.
                    Keluarga yang membayar tidak pernah tahu apa yang
                    dikerjakan. Setengah nilai layanan ini ada di
                    dokumentasinya; menahannya di sistem membuang nilai itu. */}
                {catatanKunjungan && (
                  <div className="pt-3 border-t border-nh-garis space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-nh-kabut flex items-center gap-1.5">
                        <ClipboardList className="w-3.5 h-3.5 text-nh-ungu" /> Hasil kunjungan
                      </span>
                      <span className="text-[11px] text-nh-kabut-2">
                        {catatanKunjungan.providerName}
                      </span>
                    </div>

                    <div className="rounded-xl bg-nh-panel-2 border border-nh-garis p-3 space-y-2.5 text-xs">
                      {[
                        ["Kondisi luka", catatanKunjungan.assessmentSummary],
                        ["Ukuran", catatanKunjungan.woundDimensions],
                        ["Yang dikerjakan", catatanKunjungan.proceduresPerformed],
                        ["Bahan dipakai", catatanKunjungan.suppliesUsed],
                      ]
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={String(k)}>
                            <div className="text-nh-kabut-2 text-[11px] uppercase tracking-wider">{k}</div>
                            <div className="text-nh-putih mt-0.5 leading-relaxed">{v}</div>
                          </div>
                        ))}
                    </div>

                    {catatanKunjungan.homecareInstructions && (
                      <div className="rounded-xl bg-nh-ungu/10 border border-nh-ungu/30 p-3">
                        <div className="text-[11px] uppercase tracking-wider text-nh-ungu-muda font-bold">
                          Yang perlu dilakukan di rumah
                        </div>
                        <div className="text-xs text-nh-putih mt-1 leading-relaxed">
                          {catatanKunjungan.homecareInstructions}
                        </div>
                      </div>
                    )}

                    {catatanKunjungan.nextFollowUpDate && (
                      <div className="text-xs text-nh-kabut">
                        Kunjungan berikutnya:{" "}
                        <b className="text-nh-putih">{catatanKunjungan.nextFollowUpDate}</b>
                      </div>
                    )}

                    <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
                      Ditandatangani perawat berlisensi. Simpan sebagai catatan
                      perawatan; tunjukkan ke dokter bila diminta.
                    </p>
                  </div>
                )}

                {/* ---- tahap alur: penawaran, pembayaran, hasil ----
                    Satu kartu yang isinya berubah mengikuti status. Ini
                    yang membuat pasien tidak perlu mencari-cari "sekarang
                    saya harus apa" — layar itu sendiri yang mengatakannya. */}
                {activeBooking.status === S.DITAWARKAN && (
                  <PanelPersetujuan
                    booking={activeBooking}
                    itemPenawaran={quoteItems.filter(
                      (q: any) => q.bookingId === activeBooking.id
                    )}
                    perawat={providers.find(
                      (p: any) => p.id === activeBooking.quotedByProviderId
                    )}
                    sesi={sesi}
                    onSelesai={onRefresh}
                  />
                )}

                {activeBooking.status === S.DISETUJUI && (
                  <PanelPembayaran
                    booking={activeBooking}
                    sesi={sesi}
                    onSelesai={onRefresh}
                  />
                )}

                {[S.MENUNGGU_TINJAUAN, S.DITINJAU, S.DITOLAK_PASIEN, S.DIBAYAR].includes(
                  activeBooking.status
                ) && (
                  <div className="rounded-xl border border-nh-garis bg-nh-panel-2 p-3.5">
                    <div className="text-sm font-bold text-nh-putih">
                      {namaStatus(activeBooking.status)}
                    </div>
                    <p className="text-xs text-nh-kabut leading-relaxed mt-1">
                      {PENJELASAN_STATUS[activeBooking.status]}
                    </p>
                  </div>
                )}

                <PanelHasilKunjungan
                  booking={activeBooking}
                  foto={taskPhotos.filter((f: any) => f.bookingId === activeBooking.id)}
                  laporan={visitReports.find(
                    (l: any) => l.bookingId === activeBooking.id
                  )}
                  perawat={providers.find((p: any) => p.id === activeBooking.providerId)}
                />

                {/* Testimoni hanya ditawarkan setelah kunjungan selesai.
                    Menanyakan "bagaimana pelayanannya" sebelum perawatnya
                    datang tidak masuk akal, dan jawabannya tidak berguna. */}
                {activeBooking.status === S.SELESAI && (
                  <PanelTestimoni
                    booking={activeBooking}
                    testimoniSaya={
                      testimoni.find((t: any) => t.bookingId === activeBooking.id) ?? null
                    }
                    sesi={sesi}
                    onSelesai={onRefresh}
                  />
                )}

                {/* ---- pembatalan ---- */}
                <div className="pt-3 border-t border-nh-garis">
                  {statusBatal.boleh ? (
                    <button
                      type="button"
                      onClick={() => {
                        const alasan = window.prompt("Alasan pembatalan (boleh dikosongkan):") ?? "";
                        if (window.confirm("Batalkan kunjungan ini?"))
                          onCancelBooking(activeBooking.id, alasan);
                      }}
                      className="text-xs font-semibold text-nh-bahaya underline underline-offset-2"
                    >
                      Batalkan kunjungan
                    </button>
                  ) : (
                    <p className="text-[11px] text-nh-kabut-2 leading-relaxed">{statusBatal.alasan}</p>
                  )}
                </div>

                {/* ---- kunjungan lain ---- */}
                {daftarKunjungan.length > 1 && (
                  <div className="pt-3 border-t border-nh-garis space-y-1.5">
                    <div className="text-xs font-bold text-nh-kabut flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5 text-nh-ungu" /> Kunjungan
                      saya ({daftarKunjungan.length})
                    </div>
                    {daftarKunjungan.map((b: any) => {
                      const dipilih = b.id === activeBooking?.id;
                      const lewat = SELESAI.includes(b.status);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setIdDipilih(b.id)}
                          aria-pressed={dipilih}
                          className={`w-full text-left px-3 py-2 rounded-xl border text-[11px] transition ${
                            dipilih
                              ? "border-nh-ungu bg-nh-ungu/10"
                              : "border-nh-garis hover:border-nh-garis-2"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-nh-kabut">
                              #{b.bookingCode}
                            </span>
                            <span
                              className={`font-semibold ${
                                lewat ? "text-nh-kabut-2" : "text-nh-ungu-muda"
                              }`}
                            >
                              {namaStatus(b.status)}
                            </span>
                          </div>
                          <div className="text-nh-putih mt-0.5">{b.serviceName}</div>
                          <div className="text-nh-kabut-2">
                            {tanggalIndo(b.scheduledDate)} • {b.scheduledTimeSlot}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Photo Verification Progress */}
                <div className="pt-3 border-t border-nh-garis space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-nh-kabut flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-nh-ungu" /> Foto dokumentasi
                    </span>
                    <span className="text-[11px] font-bold text-nh-ungu-muda">
                      {taskPhotos.filter((p: any) => p.bookingId === activeBooking.id).length} dari 4 foto
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { type: "ARRIVAL_CONFIRMATION", label: "Tiba" },
                      { type: "SUPPLY_VERIFICATION", label: "Bahan" },
                      { type: "WOUND_BEFORE", label: "Sebelum" },
                      { type: "WOUND_AFTER", label: "Sesudah" },
                    ].map((pt) => {
                      const has = taskPhotos.some(
                        (p: any) =>
                          p.bookingId === activeBooking.id && p.photoType === pt.type
                      );
                      return (
                        <div
                          key={pt.type}
                          className={`px-2 py-1.5 rounded-lg text-center text-[10px] font-bold ${
                            has
                              ? "bg-nh-sembuh/15 text-nh-sembuh"
                              : "bg-nh-panel-2 text-nh-kabut-2"
                          }`}
                        >
                          {has ? "✓" : "○"} {pt.label}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Patient <-> Nurse Encrypted Chat Preview */}
                <div className="pt-3 border-t border-nh-garis space-y-2">
                  <div className="text-xs font-bold text-nh-kabut flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-nh-ungu" /> Pesan langsung ke perawat ({messages.length})
                  </div>
                  <div className="bg-nh-panel-2 rounded-xl p-3 max-h-28 overflow-y-auto space-y-2">
                    {messages.slice(-2).map((m, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-bold text-nh-ungu-muda">{m.senderName}: </span>
                        <span className="text-nh-kabut">{m.content}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                      placeholder="Tulis balasan untuk perawat..."
                      className="flex-1 h-9 px-3 rounded-lg border border-nh-garis-2 text-xs"
                    />
                    <button
                      onClick={handleSendChat}
                      className="px-3 h-9 rounded-lg bg-nh-ungu-tekan text-nh-putih text-xs font-bold hover:bg-nh-ungu-tua"
                    >
                      Kirim
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* MAIN CONTENT CONTAINER */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
        {/* SECTION 1: LONGITUDINAL WOUND HEALING TIMELINE & AREA CONTRACTION CHART */}
        <section className="bg-nh-panel rounded-2xl border border-nh-garis p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-nh-garis pb-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-nh-ungu">
                Hasil perawatan dari waktu ke waktu
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-nh-putih mt-0.5">
                Perkembangan luka — Ibu Siti Aminah (luka diabetes di kaki)
              </h2>
              <p className="text-xs text-nh-kabut mt-1">
                Penyusutan luas luka (cm²) dan penurunan skor nyeri selama 4 kali kunjungan.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-xl bg-nh-sembuh/10 border border-nh-sembuh/40 text-right">
                <div className="text-[11px] font-bold text-nh-sembuh uppercase">
                  Penyusutan luas luka
                </div>
                <div className="text-lg font-bold text-nh-sembuh font-mono">
                  Menyusut 69,4% (9,6 → 2,94 cm²)
                </div>
              </div>
            </div>
          </div>

          {/* 4-Visit Progress Timeline Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {woundTimelineEntries.map((entry, index) => {
              const areaRatioPercent = Math.min(100, Math.round((entry.areaSqCm / 10) * 100));
              return (
                <div
                  key={entry.id || index}
                  className="rounded-2xl border border-nh-garis p-5 bg-nh-panel-2/60 flex flex-col justify-between space-y-4 hover:border-nh-ungu transition"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full bg-nh-ungu-tekan text-nh-putih text-[11px] font-bold">
                        Kunjungan {index + 1}
                      </span>
                      <span className="text-xs font-mono text-nh-kabut">
                        {entry.dateRecorded}
                      </span>
                    </div>

                    <div className="font-bold text-nh-putih text-sm">
                      {entry.visitDayLabel}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="p-2.5 rounded-xl bg-nh-panel border border-nh-garis">
                        <div className="text-[10px] text-nh-kabut uppercase font-bold">
                          Luas luka
                        </div>
                        <div className="text-sm font-bold text-nh-ungu-muda font-mono">
                          {entry.areaSqCm} cm²
                        </div>
                        <div className="text-[10px] text-nh-kabut-2 font-mono">
                          ({entry.lengthCm}x{entry.widthCm} cm)
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-nh-panel border border-nh-garis">
                        <div className="text-[10px] text-nh-kabut uppercase font-bold">
                          Skor nyeri
                        </div>
                        <div className="text-sm font-bold text-nh-putih font-mono">
                          {entry.painScore} / 10
                        </div>
                        <div className="text-[10px] text-nh-sembuh font-semibold">
                          {entry.exudateStatus}
                        </div>
                      </div>
                    </div>

                    {/* Visual Penyusutan luas luka Bar */}
                    <div className="pt-2">
                      <div className="flex justify-between text-[10px] text-nh-kabut mb-1">
                        <span>Ukuran relatif</span>
                        <span>{entry.areaSqCm} cm²</span>
                      </div>
                      <div className="w-full bg-nh-garis h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-nh-ungu-tekan h-full rounded-full transition-all"
                          style={{ width: `${areaRatioPercent}%` }}
                        />
                      </div>
                    </div>

                    <p className="text-xs text-nh-kabut pt-1 leading-relaxed">
                      {entry.notes}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-nh-garis/80 text-[11px] text-nh-kabut">
                    Dressing: <strong className="text-nh-kabut">{entry.dressingType}</strong>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Photo Verification Gallery (Nurse Captured) */}
          {taskPhotos.length > 0 && (
            <div className="pt-6 border-t border-nh-garis">
              <div className="flex items-center gap-2 mb-4">
                <Camera className="w-5 h-5 text-nh-ungu" />
                <h3 className="font-bold text-nh-putih">
                  Foto bukti dari perawat
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-nh-sembuh/15 text-nh-sembuh text-[11px] font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Tamper-Evident & Time-Stamped
                </span>
              </div>
              <PhotoGallery
                photos={taskPhotos}
                title="Foto bukti kunjungan"
              />
            </div>
          )}
        </section>

        {/* SECTION 2: SPECIALIZED SERVICE CATALOG (WOUND CARE & CIRCUMCISION) */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-nh-ungu">
                Tindakan standar rumah sakit, di rumah
              </span>
              <h2 className="text-2xl font-bold text-nh-putih mt-0.5">
                Daftar layanan perawatan luka & sunat di rumah
              </h2>
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCategoryFilter("ALL")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  categoryFilter === "ALL"
                    ? "bg-nh-malam text-nh-putih"
                    : "bg-nh-panel border border-nh-garis text-nh-kabut hover:bg-nh-panel-2"
                }`}
              >
                Semua layanan ({services.length})
              </button>
              <button
                onClick={() => setCategoryFilter("WOUND_CARE")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  categoryFilter === "WOUND_CARE"
                    ? "bg-nh-ungu-tekan text-nh-putih"
                    : "bg-nh-panel border border-nh-garis text-nh-kabut hover:bg-nh-panel-2"
                }`}
              >
                Perawatan luka
              </button>
              <button
                onClick={() => setCategoryFilter("CIRCUMCISION")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  categoryFilter === "CIRCUMCISION"
                    ? "bg-nh-ungu-tekan text-nh-putih"
                    : "bg-nh-panel border border-nh-garis text-nh-kabut hover:bg-nh-panel-2"
                }`}
              >
                Sunat
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredServices.map((service) => (
              <div
                key={service.id}
                className="bg-nh-panel rounded-2xl border border-nh-garis p-6 shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        service.category === "WOUND_CARE"
                          ? "bg-nh-ungu/10 text-nh-ungu-muda border border-nh-ungu/30"
                          : "bg-nh-ungu/10 text-nh-ungu-muda border border-nh-garis"
                      }`}
                    >
                      {service.category === "WOUND_CARE"
                        ? "Perawatan luka"
                        : "Sunat di rumah"}
                    </span>
                    <span className="text-xs font-semibold text-nh-kabut">
                      sekitar {service.durationMinutes} menit
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-nh-putih">
                    {service.name}
                  </h3>

                  <p className="text-xs text-nh-kabut leading-relaxed">
                    {service.description}
                  </p>

                  <div className="p-3 rounded-xl bg-nh-panel-2 border border-nh-garis/80 text-[11px] text-nh-kabut space-y-1">
                    <div className="font-bold text-nh-putih">
                      Alat steril yang sudah termasuk:
                    </div>
                    <div>{service.requiredEquipment}</div>
                  </div>
                </div>

                <div className="pt-4 border-t border-nh-garis flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-nh-kabut">Harga layanan</div>
                    <div className="text-base font-bold text-nh-ungu-muda font-mono">
                      {rp(service.basePriceIdr)}
                    </div>
                  </div>
                  <button
                    onClick={() => onOpenBookingWizard(service)}
                    className="px-4 py-2.5 rounded-xl bg-nh-ungu-tekan text-nh-putih text-xs font-bold hover:bg-nh-ungu-tua transition shadow-xs"
                  >
                    Pesan kunjungan
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 3: FAMILY DEPENDENTS & VERIFIED PATIENT REVIEWS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Family Dependents (5 Cols) */}
          <div className="lg:col-span-5 bg-nh-panel rounded-2xl border border-nh-garis p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-nh-putih">
                  Registered Family & Dependents
                </h3>
                <p className="text-xs text-nh-kabut">
                  Pesan kunjungan untuk orang tua atau anak hanya dengan sekali tekan.
                </p>
              </div>
              <button
                onClick={() => setShowAddDependentModal(!showAddDependentModal)}
                className="px-3 py-1.5 rounded-xl bg-nh-ungu/10 text-nh-ungu-muda border border-nh-ungu/30 text-xs font-bold flex items-center gap-1 hover:bg-nh-ungu/15"
              >
                <UserPlus className="w-3.5 h-3.5" /> Tambah anggota
              </button>
            </div>

            {showAddDependentModal && (
              <form
                onSubmit={handleCreateDependent}
                className="p-4 rounded-xl bg-nh-panel-2 border border-nh-garis space-y-3"
              >
                <div className="text-xs font-bold text-nh-putih">
                  Add Family Dependent Profile
                </div>
                <input
                  type="text"
                  required
                  placeholder="Full Name (e.g. Bapak Hendra Santoso)"
                  value={depName}
                  onChange={(e) => setDepName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-nh-garis-2 text-xs bg-nh-panel"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={depRelation}
                    onChange={(e) => setDepRelation(e.target.value)}
                    className="h-10 px-3 rounded-lg border border-nh-garis-2 text-xs bg-nh-panel"
                  >
                    <option value="Parent">Orang tua</option>
                    <option value="Child">Anak</option>
                    <option value="Spouse">Spouse</option>
                  </select>
                  <input
                    type="date"
                    value={depDob}
                    onChange={(e) => setDepDob(e.target.value)}
                    className="h-10 px-3 rounded-lg border border-nh-garis-2 text-xs bg-nh-panel"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Relevant medical notes (e.g. Diabetes, Drug Allergies)"
                  value={depNotes}
                  onChange={(e) => setDepNotes(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-nh-garis-2 text-xs bg-nh-panel"
                />
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-nh-ungu-tekan text-nh-putih text-xs font-bold"
                >
                  Save Dependent Profile
                </button>
              </form>
            )}

            <div className="space-y-3">
              {dependents.map((dep) => (
                <div
                  key={dep.id}
                  className="p-4 rounded-xl border border-nh-garis flex items-start justify-between"
                >
                  <div>
                    <div className="font-bold text-nh-putih text-sm">
                      {dep.fullName}
                    </div>
                    <div className="text-xs text-nh-ungu-muda font-semibold">
                      Hubungan: {dep.relationship} • Lahir {tanggalIndo(dep.dateOfBirth)}
                    </div>
                    <div className="text-xs text-nh-kabut mt-1">
                      Catatan medis: {dep.medicalNotes}
                    </div>
                  </div>
                  <button
                    onClick={() => onOpenBookingWizard()}
                    className="px-3 py-1.5 rounded-lg bg-nh-panel-2 text-nh-kabut text-xs font-semibold hover:bg-nh-ungu-tekan hover:text-nh-putih transition"
                  >
                    Pesankan
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Verified Patient Reviews (7 Cols) */}
          <div className="lg:col-span-7 bg-nh-panel rounded-2xl border border-nh-garis p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold text-nh-putih">
                Ulasan pasien & keluarga
              </h3>
              <p className="text-xs text-nh-kabut">
                Cerita keluarga yang pernah memakai layanan perawatan luka dan sunat di rumah.
              </p>
            </div>

            {/* Hanya testimoni yang BENAR-BENAR ditulis pasien dan sudah
                mereka izinkan tayang. Sebelumnya bagian ini menampilkan dua
                ulasan dari data contoh — nama lengkap, cerita lengkap, tidak
                pernah ada orangnya. Untuk halaman depan sebuah layanan
                kesehatan, itu ulasan palsu, apa pun niatnya. */}
            {tayang.length === 0 ? (
              <p className="text-xs text-nh-kabut-2 leading-relaxed">
                Belum ada testimoni yang ditayangkan. Bagian ini terisi sendiri
                setelah ada pasien yang mengisi dan mengizinkannya tayang —
                tidak diisi contoh.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {tayang.map((t: any) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-xl bg-nh-panel-2 border border-nh-garis space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-nh-putih text-sm">
                        {t.namaTayang || "Pasien"}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`w-3.5 h-3.5 ${
                              n <= t.bintang
                                ? "fill-nh-lampu text-nh-lampu"
                                : "text-nh-garis-2"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-nh-ungu-muda">
                      {t.serviceName}
                      {t.providerName ? ` • ${t.providerName}` : ""}
                    </div>
                    <p className="text-xs text-nh-kabut leading-relaxed italic">
                      &ldquo;{t.isiTayang}&rdquo;
                    </p>
                    {/* Kalau versi tayangnya dirapikan, dikatakan apa adanya.
                        Pembaca berhak tahu ini bukan kalimat mentah pasien. */}
                    {t.diedit && (
                      <p className="text-[10px] text-nh-kabut-2">
                        Diringkas oleh admin; tulisan asli tersimpan.
                      </p>
                    )}
                    {t.balasanPerawat && (
                      <div className="pt-2 border-t border-nh-garis">
                        <div className="text-[10px] font-bold text-nh-ungu-muda">
                          Balasan {t.providerName ?? "perawat"}
                        </div>
                        <p className="text-[11px] text-nh-kabut leading-relaxed mt-0.5">
                          {t.balasanPerawat}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
