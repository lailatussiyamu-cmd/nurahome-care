"use client";

/**
 * Daftar pasien luka menurut risiko — layar koordinator.
 *
 * Satu baris per pasien, memakai pengkajian Woundex TERAKHIRNYA. Diurutkan
 * MERAH dulu, lalu KUNING, lalu HIJAU, supaya perawat berikutnya dikirim ke
 * pasien yang paling membutuhkan, bukan ke yang kebetulan berikutnya di rute.
 */

import React, { useMemo, useState } from "react";
import { NAMA_TINGKAT, type Tingkat } from "@/logic/woundex";
import { bacaHasil, HasilTampil } from "./PanelWoundex";

const PERINGKAT: Record<string, number> = { MERAH: 3, KUNING: 2, HIJAU: 1 };
const PIL: Record<Tingkat, string> = {
  MERAH: "bg-nh-bahaya/15 text-nh-bahaya",
  KUNING: "bg-nh-waspada/15 text-nh-waspada",
  HIJAU: "bg-nh-sembuh/15 text-nh-sembuh",
};
const GARIS: Record<Tingkat, string> = { MERAH: "bg-nh-bahaya", KUNING: "bg-nh-waspada", HIJAU: "bg-nh-sembuh" };

export function PanelWoundexAdmin({ pengkajian, bookings }: { pengkajian: any[]; bookings: any[] }) {
  const [buka, setBuka] = useState<number | null>(null);

  const baris = useMemo(() => {
    const terakhir = new Map<number, any>();
    for (const w of pengkajian) {
      const ada = terakhir.get(w.patientId);
      if (!ada || new Date(w.createdAt) > new Date(ada.createdAt)) terakhir.set(w.patientId, w);
    }
    return [...terakhir.values()]
      .map((w) => ({ w, b: bookings.find((x: any) => x.id === w.bookingId) }))
      .sort(
        (x, y) =>
          PERINGKAT[y.w.tingkat] - PERINGKAT[x.w.tingkat] ||
          new Date(y.w.createdAt).getTime() - new Date(x.w.createdAt).getTime()
      );
  }, [pengkajian, bookings]);

  const hitung = (t: Tingkat) => baris.filter((r) => r.w.tingkat === t).length;

  return (
    <div className="nh-panel p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-nh-putih">Woundex · pasien luka menurut risiko</h3>
          <p className="text-xs text-nh-kabut mt-0.5">Pengkajian terakhir tiap pasien. Kirim perawat ke yang merah lebih dulu.</p>
        </div>
        <div className="flex gap-1.5">
          {(["MERAH", "KUNING", "HIJAU"] as Tingkat[]).map((t) => (
            <span key={t} title={NAMA_TINGKAT[t]} className={`nh-angka text-xs px-2.5 py-0.5 rounded-full ${PIL[t]}`}>
              {hitung(t)}
            </span>
          ))}
        </div>
      </div>

      {baris.length === 0 ? (
        <p className="text-sm text-nh-kabut">
          Belum ada pengkajian Woundex. Pengkajian muncul di sini setelah perawat menilai luka saat kunjungan.
        </p>
      ) : (
        <div>
          {baris.map(({ w, b }) => {
            const hasil = bacaHasil(w);
            const terbuka = buka === w.id;
            return (
              <div key={w.id} className="nh-baris" data-terpilih={terbuka}>
                <button
                  onClick={() => setBuka(terbuka ? null : w.id)}
                  className="w-full flex items-center gap-3 py-3 pr-2 text-left"
                  aria-expanded={terbuka}
                >
                  <span className={`w-1.5 self-stretch rounded-full ${GARIS[w.tingkat as Tingkat]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-nh-putih truncate">
                      {b?.dependentName || b?.patientName || `Pasien #${w.patientId}`}
                    </span>
                    <span className="block text-[11px] text-nh-kabut-2 truncate">
                      {b?.bookingCode ?? `#${w.bookingId}`} · hari ke-{w.hariKe} · IWGDF {w.derajatIwgdf} · SINBAD {w.sinbad}/6 ·{" "}
                      {w.providerName}
                    </span>
                  </span>
                  <span className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap ${PIL[w.tingkat as Tingkat]}`}>
                    {NAMA_TINGKAT[w.tingkat as Tingkat]}
                  </span>
                </button>
                {terbuka && hasil && (
                  <div className="pb-4 pl-4">
                    <HasilTampil hasil={hasil} waktu={w.createdAt} oleh={w.providerName} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
