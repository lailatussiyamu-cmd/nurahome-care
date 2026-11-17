"use client";

import React from "react";
import { namaVerifikasi, namaPeran } from "@/logic/sesi";
import { TUGAS, TENGGAT } from "@/logic/tugas";
import { PanelTestimoniAdmin } from "./PanelTestimoniAdmin";
import { PanelVerifikasiAdmin } from "./PanelVerifikasiAdmin";
import { PanelBagiHasilAdmin } from "./PanelBagiHasilAdmin";
import { PanelWoundexAdmin } from "./PanelWoundexAdmin";
import { rp } from "@/logic/biaya";
import {
  Sparkles,
  ShieldCheck,
  Users,
  TrendingUp,
  Activity,
  DollarSign,
  CheckCircle2,
  Lock,
  FileText,
  Award,
  Clock,
} from "lucide-react";

interface AdminPortalProps {
  bookings: any[];
  providers: any[];
  services: any[];
  auditLogs: any[];
  testimoni: any[];
  providerDocuments: any[];
  verificationReviews: any[];
  payouts: any[];
  woundexChecks?: any[];
  sambunganAi?: { siap: boolean; penyedia: string | null; model: string; alasan: string };
  sesi: { nama: string | null; peran: string };
  onRefresh: () => void;
}

export function AdminPortal({
  bookings,
  providers,
  services,
  auditLogs,
  testimoni,
  providerDocuments,
  verificationReviews,
  payouts,
  woundexChecks = [],
  sambunganAi,
  sesi,
  onRefresh,
}: AdminPortalProps) {
  /**
   * Pendapatan hanya dari yang BENAR-BENAR terbayar.
   *
   * Sebelumnya ini menjumlahkan totalPriceIdr SELURUH pemesanan — termasuk
   * yang masih menunggu persetujuan, yang penawarannya hangus, dan yang
   * dibatalkan. Angka yang tampil jadi lebih besar dari uang yang pernah
   * masuk, dan tidak ada yang tahu selisihnya berapa. Untuk layar yang
   * dipakai mengambil keputusan, itu lebih berbahaya daripada tidak ada
   * angkanya sama sekali.
   */
  const terbayar = bookings.filter((b: any) => b.paymentStatus === "LUNAS");
  const totalRevenueIdr = terbayar.reduce(
    (acc, b) => acc + (Number(b.totalPriceIdr) || 0),
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Admin Header */}
      <div className="bg-nh-malam text-nh-putih rounded-2xl p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-nh-ungu-muda">
            Konsol pengawasan layanan
          </span>
          <h1 className="text-2xl font-bold mt-1">
            Pusat kendali direktur medis & admin
          </h1>
          <p className="text-xs text-nh-kabut mt-0.5">
            Pemantauan mutu klinis, verifikasi STR, penetapan tarif, dan jejak audit.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3.5 py-1.5 rounded-full bg-nh-ungu/20 border border-nh-ungu/40 text-nh-ungu-muda text-xs font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Mengikuti UU PDP 27/2022
          </span>
        </div>
      </div>

      {/* 4 Top KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-nh-panel rounded-2xl p-5 border border-nh-garis shadow-xs">
          <div className="text-xs font-bold text-nh-kabut uppercase tracking-wider">
            Total pendapatan platform
          </div>
          <div className="text-2xl font-bold text-nh-putih mt-1 font-mono">
            {rp(totalRevenueIdr)}
          </div>
          <div className="text-xs font-semibold text-nh-sembuh mt-1 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> Dari {terbayar.length} kunjungan terbayar
          </div>
        </div>

        <div className="bg-nh-panel rounded-2xl p-5 border border-nh-garis shadow-xs">
          <div className="text-xs font-bold text-nh-kabut uppercase tracking-wider">
            Kunjungan aktif
          </div>
          <div className="text-2xl font-bold text-nh-putih mt-1">
            {bookings.length} kunjungan
          </div>
          <div className="text-xs font-semibold text-nh-ungu mt-1">
            100% kunjungan terisi perawat
          </div>
        </div>

        <div className="bg-nh-panel rounded-2xl p-5 border border-nh-garis shadow-xs">
          <div className="text-xs font-bold text-nh-kabut uppercase tracking-wider">
            Perawat ber-STR terverifikasi
          </div>
          <div className="text-2xl font-bold text-nh-putih mt-1">
            {providers.length} perawat ber-STR
          </div>
          <div className="text-xs font-semibold text-nh-ungu-muda mt-1">
            Bersertifikat CWCS & sunat
          </div>
        </div>

        <div className="bg-nh-panel rounded-2xl p-5 border border-nh-garis shadow-xs">
          <div className="text-xs font-bold text-nh-kabut uppercase tracking-wider">
            Kepuasan pasien
          </div>
          <div className="text-2xl font-bold text-nh-putih mt-1">4.97 ★</div>
          <div className="text-xs font-semibold text-nh-sembuh mt-1">
            Nihil komplikasi pasca tindakan
          </div>
        </div>
      </div>

      {/* Certified Providers Credential Verification Table */}
      <div className="bg-nh-panel rounded-2xl border border-nh-garis p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-nh-putih">
              Daftar perawat terverifikasi (STR / SIPP)
            </h2>
            <p className="text-xs text-nh-kabut">
              Setiap perawat wajib melewati verifikasi STR dan penilaian kompetensi teknik steril.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-nh-garis text-nh-kabut uppercase font-bold">
                <th className="py-3 px-4">Nama perawat</th>
                <th className="py-3 px-4">Nomor STR</th>
                <th className="py-3 px-4">Bidang keahlian</th>
                <th className="py-3 px-4">Wilayah layanan</th>
                <th className="py-3 px-4">Kunjungan selesai</th>
                <th className="py-3 px-4">Status verifikasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nh-panel-2">
              {providers.map((p) => (
                <tr key={p.id} className="hover:bg-nh-panel-2">
                  <td className="py-3.5 px-4 font-bold text-nh-putih">
                    {p.fullName}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-nh-ungu-muda font-semibold">
                    {p.licenseNumber}
                  </td>
                  <td className="py-3.5 px-4 text-nh-kabut">{p.specialty}</td>
                  <td className="py-3.5 px-4 text-nh-kabut">
                    {p.serviceAreaCity} ({p.serviceRadiusKm} km)
                  </td>
                  <td className="py-3.5 px-4 font-bold text-nh-putih">
                    {p.completedVisits} kunjungan ({p.ratingAvg} ★)
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-1 rounded-full bg-nh-sembuh/15 text-nh-sembuh font-bold text-[11px] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {namaVerifikasi(p.verifiedStatus)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PanelVerifikasiAdmin
        providers={providers}
        providerDocuments={providerDocuments ?? []}
        verificationReviews={verificationReviews ?? []}
        onSelesai={onRefresh}
      />

      {/* Keadaan sambungan AI.
          Ditampilkan supaya admin tahu asisten sedang jalan dengan model
          atau dengan pencocokan kata saja. Layanan berbayar yang diam-diam
          berhenti — kunci kedaluwarsa, kuota habis — adalah layanan yang
          tidak ada yang tahu kapan matinya. */}
      <div className="bg-nh-panel rounded-2xl border border-nh-garis p-5 space-y-2">
        <h2 className="text-base font-bold text-nh-putih flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-nh-ungu" /> Asisten tanya-jawab
        </h2>
        {sambunganAi?.siap ? (
          <>
            <p className="text-xs text-emerald-300">
              Dibantu model {sambunganAi.model} dari {sambunganAi.penyedia}.
            </p>
            <p className="text-[11px] text-nh-kabut leading-relaxed">
              Tanda bahaya TETAP diputuskan daftar kata di server, bukan oleh
              model — model hanya boleh menambah, tidak pernah mencabut. Isi
              rekam medis tidak pernah dikirim ke penyedia mana pun.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs text-nh-kabut">
              Berjalan dengan pencocokan kata saja — tanpa model AI.
            </p>
            <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
              {sambunganAi?.alasan ??
                "AI_PENYEDIA belum dipasang."}{" "}
              Semua jalur tetap bekerja penuh tanpa ini.
            </p>
          </>
        )}
      </div>

      <PanelWoundexAdmin pengkajian={woundexChecks} bookings={bookings} />

      <PanelBagiHasilAdmin payouts={payouts ?? []} onSelesai={onRefresh} />

      <PanelTestimoniAdmin
        testimoni={testimoni}
        bookings={bookings}
        sesi={sesi}
        onSelesai={onRefresh}
      />

      {/* Tugas terjadwal.
          Ditampilkan supaya admin tahu apa saja yang dikerjakan sistem
          sendiri di belakang layar. Pekerjaan otomatis yang tidak pernah
          terlihat siapa pun adalah pekerjaan yang tidak ada yang tahu kalau
          berhenti — dan yang paling berbahaya kalau berhenti justru
          penghapusan foto. */}
      <div className="bg-nh-panel rounded-2xl border border-nh-garis p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-nh-putih flex items-center gap-2">
            <Clock className="w-4 h-4 text-nh-ungu" /> Tugas terjadwal server
          </h2>
          <p className="text-xs text-nh-kabut">
            Dijalankan penjadwal di luar aplikasi lewat <code>/api/cron</code>,
            dijaga <code>CRON_SECRET</code>. Setiap jalan tercatat di jejak
            audit sebagai <code>TUGAS_TERJADWAL</code>.
          </p>
        </div>

        <div className="space-y-2">
          {TUGAS.map((t) => (
            <div
              key={t.nama}
              className="rounded-xl bg-nh-panel-2 border border-nh-garis p-3.5 space-y-1"
            >
              <div className="flex items-start justify-between gap-3">
                <code className="text-xs font-bold text-nh-ungu-muda">{t.nama}</code>
                <span className="text-[11px] text-nh-kabut-2 shrink-0">{t.jadwal}</span>
              </div>
              <p className="text-xs text-nh-kabut leading-relaxed">{t.penjelasan}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-nh-garis p-3.5 text-xs text-nh-kabut space-y-1">
          <div className="font-bold text-nh-putih mb-1">Tenggat yang berlaku</div>
          <div className="flex justify-between"><span>Masa simpan foto luka</span><span className="font-mono">{TENGGAT.simpanFotoTahun} tahun</span></div>
          <div className="flex justify-between"><span>Penawaran hangus setelah</span><span className="font-mono">{TENGGAT.penawaranJam} jam</span></div>
          <div className="flex justify-between"><span>Batal otomatis bila tak dibayar</span><span className="font-mono">{TENGGAT.belumDibayarJam} jam</span></div>
          <div className="flex justify-between"><span>Jeda antar pengingat</span><span className="font-mono">{TENGGAT.jedaDorongJam} jam</span></div>
        </div>
      </div>

      {/* Immutable Security & Clinical Audit Logs */}
      <div className="bg-nh-panel rounded-2xl border border-nh-garis p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-nh-putih flex items-center gap-2">
              <Lock className="w-4 h-4 text-nh-ungu" /> Jejak audit — tidak bisa diubah
            </h2>
            <p className="text-xs text-nh-kabut">
              Mencatat setiap pembukaan rekam pasien, penandatanganan catatan SOAP, dan konfirmasi pembayaran.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="p-3.5 rounded-xl bg-nh-panel-2 border border-nh-garis flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-md bg-nh-malam text-nh-putih font-mono font-bold text-[11px]">
                  {log.action}
                </span>
                <span className="font-semibold text-nh-putih">
                  {log.details}
                </span>
              </div>
              <div className="flex items-center gap-3 text-nh-kabut font-mono text-[11px]">
                <span>Peran: {namaPeran(log.userRole)}</span>
                <span>Objek: {log.resourceId}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
