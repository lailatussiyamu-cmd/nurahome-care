"use client";

/**
 * Checkout pasien: membaca penawaran, menandatangani persetujuan tindakan,
 * lalu membayar.
 *
 * Yang membuat bagian ini berbeda dari checkout toko:
 *
 * - Teks persetujuan ditampilkan LENGKAP, bukan tautan "syarat & ketentuan".
 *   Orang yang menyetujui tindakan pada tubuhnya berhak membaca isinya di
 *   layar yang sama tempat ia menyetujuinya.
 *
 * - Tombol setuju tidak bisa ditekan sebelum teksnya benar-benar digulir
 *   sampai bawah. Ini bukan basa-basi: persetujuan yang isinya tidak pernah
 *   terlihat bukan informed consent, hanya klik.
 *
 * - Menolak penawaran juga tersedia, sejelas menyetujuinya. Checkout yang
 *   hanya punya satu pintu keluar bukan persetujuan, melainkan jebakan.
 */

import React, { useMemo, useRef, useState } from "react";
import { rp } from "@/logic/biaya";
import { NAMA_JENIS, subtotalItem, type ItemPenawaran } from "@/logic/alur";
import {
  teksPersetujuanTindakan,
  NAMA_HUBUNGAN,
  penghalangTandaTangan,
  type HubunganPenandaTangan,
} from "@/logic/consent";
import { tanggalIndo } from "@/logic/sesi";
import { CheckCircle2, Calendar, MapPin, X } from "lucide-react";

interface Props {
  booking: any;
  itemPenawaran: any[];
  perawat: any;
  sesi: { userId: number | null; nama: string | null; peran: string };
  onSelesai: () => void;
}

export function PanelPersetujuan({
  booking,
  itemPenawaran,
  perawat,
  sesi,
  onSelesai,
}: Props) {
  const [sudahGulir, setSudahGulir] = useState(false);
  const [sudahBaca, setSudahBaca] = useState(false);
  const [hubungan, setHubungan] = useState<HubunganPenandaTangan | "">("");
  const [namaTandaTangan, setNamaTandaTangan] = useState("");
  const [persetujuanFoto, setPersetujuanFoto] = useState(true);
  const [modeTolak, setModeTolak] = useState(false);
  const [alasanTolak, setAlasanTolak] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const kotakTeks = useRef<HTMLPreElement>(null);

  const item: ItemPenawaran[] = useMemo(
    () =>
      (itemPenawaran ?? []).map((i: any) => ({
        kind: i.kind,
        label: i.label,
        qty: i.qty,
        unitPriceIdr: i.unitPriceIdr,
        fromCatalog: i.fromCatalog,
        originalUnitPriceIdr: i.originalUnitPriceIdr,
        reason: i.reason,
      })),
    [itemPenawaran]
  );

  const total = item.reduce((t, i) => t + subtotalItem(i), 0);

  // Teks yang ditampilkan disusun dari data yang sama dengan yang nanti
  // disimpan server. Kalau keduanya dirakit terpisah, cepat atau lambat
  // yang dibaca pasien dan yang tersimpan sebagai bukti akan berbeda.
  const teks = useMemo(
    () =>
      teksPersetujuanTindakan({
        namaPasien: booking?.dependentName || booking?.patientName || "-",
        namaLayanan: booking?.serviceName ?? "-",
        kategori: booking?.serviceCategory ?? "WOUND_CARE",
        namaPerawat: booking?.quotedByProviderName ?? "-",
        nomorSTR: perawat?.licenseNumber ?? "-",
        temuanPerawat: booking?.reviewFindings ?? "-",
        item,
        total,
        tanggalKunjungan: tanggalIndo(booking?.scheduledDate),
        jamKunjungan: booking?.scheduledTimeSlot ?? "-",
        alamat: booking?.addressText ?? "-",
      }),
    [booking, perawat, item, total]
  );

  const halangan =
    !sudahGulir
      ? "Gulir persetujuan sampai bawah dulu."
      : penghalangTandaTangan({ namaTandaTangan, sudahBacaTindakan: sudahBaca, hubungan });

  const cekGulir = () => {
    const el = kotakTeks.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setSudahGulir(true);
  };

  const putuskan = async (setuju: boolean) => {
    setSibuk(true);
    setGalat(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "PUTUSKAN_PENAWARAN",
          bookingId: booking.id,
          setuju,
          alasanTolak: setuju ? undefined : alasanTolak,
          namaTandaTangan: setuju ? namaTandaTangan.trim() : undefined,
          hubungan: setuju ? hubungan : undefined,
          persetujuanFoto: setuju ? persetujuanFoto : undefined,
        }),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(jawab?.error ?? "Gagal menyimpan keputusan.");
        return;
      }
      onSelesai();
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  };

  if (!booking) return null;

  return (
    <div className="nh-panel p-5 space-y-5">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-nh-ungu-muda">
          Menunggu persetujuan Anda
        </div>
        <h3 className="text-base font-bold text-nh-putih mt-0.5">
          Rincian dari {booking.quotedByProviderName ?? "perawat"}
        </h3>
        <p className="text-xs text-nh-kabut mt-1 leading-relaxed">
          Belum ada yang ditagihkan. Anda membayar setelah menyetujui rincian
          di bawah ini.
        </p>
      </div>

      {/* ---- penilaian perawat ---- */}
      {booking.reviewFindings && (
        <div className="rounded-xl bg-nh-panel-2 border border-nh-garis p-3.5 space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-nh-kabut">
            Penilaian perawat
          </div>
          <p className="text-sm text-nh-putih leading-relaxed whitespace-pre-wrap">
            {booking.reviewFindings}
          </p>
        </div>
      )}

      {/* ---- rincian biaya ---- */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-nh-kabut">
          Rincian biaya
        </div>
        {item.map((i, idx) => (
          <div key={idx} className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-nh-garis last:border-0">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-nh-kabut-2">
                {NAMA_JENIS[i.kind]}
              </div>
              <div className="text-nh-putih leading-snug">{i.label}</div>
              <div className="text-[11px] text-nh-kabut-2">
                {i.qty} × {rp(i.unitPriceIdr)}
              </div>
              {/* Alasan perubahan ditampilkan ke pasien, bukan hanya
                  tersimpan di basis data. Inilah gunanya diwajibkan. */}
              {i.reason && (
                <div className="text-[11px] text-nh-waspada mt-0.5 leading-relaxed">
                  Alasan perawat: {i.reason}
                </div>
              )}
            </div>
            <span className="font-mono font-semibold text-nh-putih shrink-0">
              {rp(subtotalItem(i))}
            </span>
          </div>
        ))}
        <div className="flex items-baseline justify-between pt-2 border-t border-nh-garis">
          <span className="text-sm font-bold text-nh-putih">Total</span>
          <span className="text-xl font-bold font-mono text-nh-ungu-muda">{rp(total)}</span>
        </div>
      </div>

      {/* ---- jadwal ---- */}
      <div className="rounded-xl bg-nh-panel-2 border border-nh-garis p-3.5 space-y-1.5 text-sm">
        <div className="flex items-start gap-2">
          <Calendar className="w-4 h-4 text-nh-ungu shrink-0 mt-0.5" />
          <span className="text-nh-putih">
            {tanggalIndo(booking.scheduledDate)} • {booking.scheduledTimeSlot}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-nh-ungu shrink-0 mt-0.5" />
          <span className="text-nh-kabut leading-relaxed">{booking.addressText}</span>
        </div>
      </div>

      {!modeTolak ? (
        <>
          {/* ---- persetujuan tindakan ---- */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-nh-kabut">
              Persetujuan tindakan
            </div>
            <pre
              ref={kotakTeks}
              onScroll={cekGulir}
              tabIndex={0}
              className="text-[11px] text-nh-kabut whitespace-pre-wrap bg-nh-malam border border-nh-garis rounded-xl p-3.5 h-64 overflow-y-auto leading-relaxed font-mono"
            >
              {teks}
            </pre>
            {!sudahGulir && (
              <p className="text-[11px] text-nh-waspada">
                Gulir sampai bawah untuk membaca seluruhnya.
              </p>
            )}

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-nh-garis bg-nh-panel-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sudahBaca}
                disabled={!sudahGulir}
                onChange={(e) => setSudahBaca(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#A855F7] shrink-0"
              />
              <span className="text-xs text-nh-putih leading-relaxed">
                Saya sudah membaca dan memahami seluruh keterangan di atas,
                termasuk risiko dan biayanya.
              </span>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-nh-garis bg-nh-panel-2 cursor-pointer">
              <input
                type="checkbox"
                checked={persetujuanFoto}
                onChange={(e) => setPersetujuanFoto(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#A855F7] shrink-0"
              />
              <span className="text-xs text-nh-kabut leading-relaxed">
                Saya setuju perawat memotret luka sebelum dan sesudah tindakan
                sebagai bukti pekerjaan dan bahan pemantauan. Menolak tidak
                membatalkan kunjungan.
              </span>
            </label>
          </div>

          {/* ---- tanda tangan ---- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut mb-1.5">
                Saya menandatangani sebagai
              </label>
              <select
                value={hubungan}
                onChange={(e) => setHubungan(e.target.value as HubunganPenandaTangan)}
                className="nh-isian w-full px-3 py-2.5 text-sm"
              >
                <option value="">— pilih —</option>
                {Object.entries(NAMA_HUBUNGAN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut mb-1.5">
                Nama lengkap
              </label>
              <input
                value={namaTandaTangan}
                onChange={(e) => setNamaTandaTangan(e.target.value)}
                placeholder="Ketik nama Anda"
                className="nh-isian w-full px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          {galat && (
            <div className="flex items-start gap-2 text-xs text-nh-bahaya bg-nh-bahaya/10 border border-nh-bahaya/30 rounded-xl px-3 py-2 leading-relaxed">
              <span aria-hidden="true" className="font-bold">!</span>
              <span>{galat}</span>
            </div>
          )}
          {!galat && halangan && (
            <p className="text-[11px] text-nh-kabut-2">{halangan}</p>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={() => putuskan(true)}
              disabled={!!halangan || sibuk}
              className="nh-tombol flex-1 px-5 py-3.5 text-sm flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {sibuk ? "Menyimpan…" : `Setuju — ${rp(total)}`}
            </button>
            <button
              onClick={() => setModeTolak(true)}
              className="px-5 py-3.5 rounded-xl border border-nh-garis-2 text-nh-kabut text-sm font-semibold hover:border-nh-bahaya hover:text-nh-bahaya transition"
            >
              Tolak penawaran
            </button>
          </div>
        </>
      ) : (
        /* ---- menolak ---- */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-nh-putih">Menolak penawaran</div>
            <button
              onClick={() => setModeTolak(false)}
              aria-label="Batal menolak"
              className="text-nh-kabut"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-nh-kabut leading-relaxed">
            Permintaan Anda akan diteruskan ke perawat lain. Alasan Anda
            dibaca perawat berikutnya supaya ia tidak mengulang penawaran yang
            sama.
          </p>
          <textarea
            value={alasanTolak}
            onChange={(e) => setAlasanTolak(e.target.value)}
            rows={3}
            placeholder="Misalnya: biayanya di luar kemampuan saya, atau jadwalnya tidak cocok."
            className="nh-isian w-full px-3 py-2.5 text-sm leading-relaxed"
          />
          {galat && <p className="text-xs text-nh-bahaya">{galat}</p>}
          <button
            onClick={() => putuskan(false)}
            disabled={sibuk || alasanTolak.trim().length < 4}
            className="w-full px-5 py-3.5 rounded-xl border border-nh-bahaya/50 bg-nh-bahaya/10 text-nh-bahaya text-sm font-bold disabled:opacity-40"
          >
            {sibuk ? "Menyimpan…" : "Tolak & cari perawat lain"}
          </button>
        </div>
      )}
    </div>
  );
}
