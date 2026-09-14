"use client";

/**
 * Yang dilihat PASIEN selama dan setelah kunjungan: perawat sudah sampai,
 * foto luka sebelum dan sesudah, lalu laporan tindakan.
 *
 * Pasangan dari PanelKunjungan (sisi perawat). Dipisah karena isinya memang
 * berbeda — perawat butuh tombol dan borang, keluarga butuh kepastian dan
 * kalimat yang bisa mereka mengerti. Menampilkan borang perawat ke keluarga
 * hanya membuat mereka bingung; menampilkan ringkasan saja ke perawat
 * membuatnya tidak bisa bekerja.
 */

import React from "react";
import { S, namaStatus, PENJELASAN_STATUS } from "@/logic/alur";
import { tanggalIndo } from "@/logic/sesi";
import { fotoSudahDihapus } from "@/logic/tugas";
import {
  MapPin,
  ShieldCheck,
  FileText,
  AlertTriangle,
  CalendarClock,
} from "lucide-react";

interface Props {
  booking: any;
  foto: any[];
  laporan: any;
  perawat: any;
}

export function PanelHasilKunjungan({ booking, foto, laporan, perawat }: Props) {
  if (!booking) return null;

  const cari = (jenis: string) => foto.find((f: any) => f.photoType === jenis);
  const fotoTiba = cari("ARRIVAL_CONFIRMATION");
  const sebelum = cari("WOUND_BEFORE");
  const sesudah = cari("WOUND_AFTER");

  const sedangBerjalan = [
    S.PERAWAT_BERANGKAT,
    S.PERAWAT_TIBA,
    S.DIKERJAKAN,
  ].includes(booking.status as never);

  return (
    <div className="space-y-4">
      {/* ---- status yang sedang berjalan ---- */}
      {sedangBerjalan && (
        <div className="rounded-xl border border-nh-ungu/30 bg-nh-ungu/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-nh-lampu animate-ping" />
            <span className="text-sm font-bold text-nh-putih">
              {namaStatus(booking.status)}
            </span>
          </div>
          <p className="text-xs text-nh-kabut leading-relaxed">
            {PENJELASAN_STATUS[booking.status]}
          </p>
        </div>
      )}

      {/* ---- konfirmasi kedatangan ----
          Foto pintu masuk yang dikirim perawat. Untuk keluarga yang menunggu
          di rumah, ini yang mengubah "katanya sudah jalan" jadi sesuatu yang
          bisa mereka lihat sendiri. */}
      {fotoTiba && (
        <div className="rounded-xl border border-nh-sembuh/30 bg-nh-sembuh/5 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-nh-sembuh shrink-0" />
            <span className="text-sm font-bold text-nh-putih">
              Perawat sudah tiba
            </span>
          </div>
          {fotoSudahDihapus(fotoTiba) ? (
            <div className="w-full h-36 rounded-xl border border-dashed border-nh-garis-2 flex items-center justify-center text-[11px] text-nh-kabut-2 text-center px-4 leading-relaxed">
              Gambar sudah dihapus setelah masa simpan 25 tahun.
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={fotoTiba.imageUrl}
              alt="Foto konfirmasi kedatangan perawat"
              className="w-full h-36 object-cover rounded-xl border border-nh-garis"
            />
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-nh-kabut">
            <ShieldCheck className="w-3.5 h-3.5 text-nh-sembuh shrink-0" />
            <span>
              {booking.providerName ?? "Perawat"}
              {perawat?.licenseNumber ? ` • STR ${perawat.licenseNumber}` : ""}
            </span>
          </div>
        </div>
      )}

      {/* ---- foto sebelum & sesudah ---- */}
      {(sebelum || sesudah) && (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-nh-kabut">
            Luka sebelum & sesudah
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { f: sebelum, label: "Sebelum" },
              { f: sesudah, label: "Sesudah" },
            ].map(({ f, label }) => (
              <div key={label} className="space-y-1">
                <div className="text-[11px] font-semibold text-nh-kabut">{label}</div>
                {!f ? (
                  <div className="w-full h-32 rounded-xl border border-dashed border-nh-garis-2 flex items-center justify-center text-[11px] text-nh-kabut-2 text-center px-2">
                    Belum ada
                  </div>
                ) : fotoSudahDihapus(f) ? (
                  /* Bukan "belum ada" — fotonya pernah ada, lalu dihapus
                     karena masa simpannya habis. Bedanya penting kalau
                     rekam ini dipakai untuk menjawab keluhan. */
                  <div className="w-full h-32 rounded-xl border border-dashed border-nh-garis-2 flex items-center justify-center text-[10px] text-nh-kabut-2 text-center px-2 leading-relaxed">
                    Dihapus setelah masa simpan 25 tahun
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={f.imageUrl}
                    alt={`Luka ${label.toLowerCase()} tindakan`}
                    className="w-full h-32 object-cover rounded-xl border border-nh-garis"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- laporan tindakan ---- */}
      {laporan && (
        <div className="rounded-xl border border-nh-garis bg-nh-panel-2 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-nh-ungu shrink-0" />
            <span className="text-sm font-bold text-nh-putih">Laporan tindakan</span>
          </div>

          <Bagian judul="Yang dikerjakan" isi={laporan.whatWasDone} />
          {laporan.woundCondition && (
            <Bagian judul="Keadaan luka setelah tindakan" isi={laporan.woundCondition} />
          )}
          <Bagian judul="Yang perlu dilakukan di rumah" isi={laporan.homeInstructions} />

          {laporan.warningSigns && (
            <div className="rounded-xl border border-nh-bahaya/35 bg-nh-bahaya/10 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-nh-bahaya shrink-0 mt-0.5" />
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-nh-bahaya">
                  Segera hubungi bila
                </div>
                <p className="text-xs text-nh-putih leading-relaxed mt-0.5">
                  {laporan.warningSigns}
                </p>
              </div>
            </div>
          )}

          {laporan.nextVisitSuggestion && (
            <div className="flex items-start gap-2 text-xs text-nh-kabut">
              <CalendarClock className="w-3.5 h-3.5 text-nh-ungu shrink-0 mt-0.5" />
              <span>Saran kunjungan berikutnya: {laporan.nextVisitSuggestion}</span>
            </div>
          )}

          {laporan.suppliesUsed && (
            <div className="text-[11px] text-nh-kabut-2 leading-relaxed">
              Bahan terpakai: {laporan.suppliesUsed}
            </div>
          )}

          {/* Tanda tangan. Nama dan nomor STR ditampilkan karena inilah yang
              membuat laporan ini dokumen, bukan pesan. */}
          <div className="pt-2.5 border-t border-nh-garis text-[11px] text-nh-kabut-2 leading-relaxed">
            Ditandatangani {laporan.providerName} • STR {laporan.providerLicense}
            {laporan.finishedAt
              ? ` • ${tanggalIndo(String(laporan.finishedAt).slice(0, 10))}`
              : ""}
            <br />
            Simpan sebagai catatan perawatan; tunjukkan ke dokter bila diminta.
          </div>
        </div>
      )}
    </div>
  );
}

function Bagian({ judul, isi }: { judul: string; isi: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-nh-kabut">
        {judul}
      </div>
      <p className="text-sm text-nh-putih leading-relaxed mt-0.5 whitespace-pre-wrap">
        {isi}
      </p>
    </div>
  );
}
