"use client";

/**
 * Kode kunjungan yang terkunci karena salah 5 kali.
 *
 * Bisa jadi perawatnya salah dengar. Bisa jadi juga yang berdiri di depan
 * pintu bukan perawat yang ditugaskan. Admin yang memastikan — dengan
 * menelepon pasien DAN perawatnya — baru membuka kuncinya. Kodenya
 * ditampilkan di sini supaya admin bisa mencocokkannya dengan pasien lewat
 * telepon, bukan untuk dibacakan ke orang di depan pintu.
 */

import React, { useState } from "react";
import { KeyRound } from "lucide-react";

export function PanelKodeTerkunci({ bookings, onSelesai }: { bookings: any[]; onSelesai: () => void }) {
  const terkunci = bookings.filter((b) => Number(b.kodeSalah ?? 0) >= 5 && b.status === "PERAWAT_BERANGKAT");
  if (!terkunci.length) return null;

  return (
    <div className="bg-nh-panel rounded-2xl border border-nh-bahaya/40 p-6 space-y-4">
      <div>
        <h2 className="text-base font-bold text-nh-putih flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-nh-bahaya" /> Kode kunjungan terkunci
        </h2>
        <p className="text-xs text-nh-kabut leading-relaxed">
          Telepon pasien dan perawatnya. Buka kunci hanya bila Anda yakin orang di
          depan pintu adalah perawat yang ditugaskan.
        </p>
      </div>
      {terkunci.map((b) => (
        <BarisKode key={b.id} b={b} onSelesai={onSelesai} />
      ))}
    </div>
  );
}

function BarisKode({ b, onSelesai }: { b: any; onSelesai: () => void }) {
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const buka = async () => {
    setSibuk(true);
    setGalat(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "BUKA_KUNCI_KODE", bookingId: b.id, alasan }),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) setGalat(jawab?.error ?? "Gagal membuka kunci.");
      else onSelesai();
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="rounded-xl bg-nh-panel-2 border border-nh-garis p-4 space-y-2">
      <div className="text-sm font-bold text-nh-putih">
        {b.bookingCode} — {b.providerName ?? "perawat"}
      </div>
      <div className="text-xs text-nh-kabut">
        {b.dependentName || b.patientName} • {b.addressText}
      </div>
      <div className="text-xs text-nh-kabut">
        Kode yang benar: <span className="font-mono font-bold text-nh-putih">{b.kodeKunjungan ?? "—"}</span>
      </div>
      <textarea
        value={alasan}
        onChange={(e) => setAlasan(e.target.value)}
        rows={2}
        placeholder="Apa yang sudah dipastikan? Mis. pasien dan perawat sudah ditelepon, perawatnya benar."
        className="nh-isian w-full px-3 py-2 text-xs"
      />
      {galat && <p className="text-xs text-nh-bahaya">{galat}</p>}
      <button
        onClick={buka}
        disabled={sibuk || alasan.trim().length < 10}
        className="px-3.5 py-2 rounded-xl border border-nh-garis text-xs font-semibold text-nh-putih hover:border-nh-ungu/50 disabled:opacity-50"
      >
        {sibuk ? "Membuka…" : "Buka kunci kode"}
      </button>
    </div>
  );
}
