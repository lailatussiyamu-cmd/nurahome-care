"use client";

/**
 * Bagi hasil, dari sisi admin.
 *
 * Layar ini tidak menghitung apa pun. Semua angkanya sudah dibekukan di
 * baris bagi hasil pada saat kunjungannya selesai dan lunas — kalau layar
 * ini ikut menghitung, akan ada dua sumber angka yang bisa berbeda, dan
 * yang dipercaya orang adalah yang kebetulan sedang dilihatnya.
 *
 * Yang bisa dilakukan di sini hanya satu: menandai bahwa honor yang sudah
 * tercatat itu benar-benar sudah ditransfer, beserta buktinya. Angkanya
 * tidak bisa disunting. Kalau angkanya salah, yang harus diperbaiki adalah
 * rincian penawarannya — bukan ditimpa diam-diam di tahap pembayaran, di
 * mana tidak ada lagi yang memeriksanya.
 */

import React from "react";
import { rp } from "@/logic/biaya";
import { NAMA_STATUS_BAGI_HASIL, type StatusBagiHasil } from "@/logic/bagihasil";
import { Wallet, AlertTriangle, CheckCircle2, Lock, RefreshCw } from "lucide-react";

type Baris = {
  id: number;
  bookingId: number;
  bookingCode: string;
  providerId: number;
  providerName: string;
  visitDate: string;
  totalBilledIdr: number;
  serviceIdr: number;
  providerShareIdr: number;
  platformFeeIdr: number;
  suppliesIdr: number;
  travelIdr: number;
  afterHoursIdr: number;
  providerTakeIdr: number;
  status: string;
  note: string | null;
  paidAt: string | null;
  paymentReference: string | null;
};

const WARNA: Record<string, string> = {
  TERKUMPUL: "bg-nh-ungu/15 text-nh-ungu border-nh-ungu/40",
  DIBAYARKAN: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  DITAHAN: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  PERLU_TINJAUAN: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

export function PanelBagiHasilAdmin({
  payouts,
  onSelesai,
}: {
  payouts: Baris[];
  onSelesai: () => void;
}) {
  const [bukti, setBukti] = React.useState<Record<number, string>>({});
  const [sibuk, setSibuk] = React.useState<number | null>(null);
  const [galat, setGalat] = React.useState<string>("");
  const [kabarSusulan, setKabarSusulan] = React.useState<string>("");

  const daftar = [...(payouts ?? [])].sort((a, b) => {
    /** Yang perlu tindakan admin naik ke atas; yang sudah beres turun. */
    const urut = (s: string) =>
      s === "PERLU_TINJAUAN" ? 0 : s === "TERKUMPUL" ? 1 : s === "DITAHAN" ? 2 : 3;
    return urut(a.status) - urut(b.status) || b.id - a.id;
  });

  const siap = daftar.filter((p) => p.status === "TERKUMPUL");
  const totalSiap = siap.reduce((t, p) => t + p.providerTakeIdr, 0);
  const perluTinjauan = daftar.filter((p) => p.status === "PERLU_TINJAUAN").length;

  async function tandai(p: Baris) {
    setGalat("");
    setSibuk(p.id);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TANDAI_HONOR_DIBAYARKAN",
          payoutId: p.id,
          bukti: bukti[p.id] ?? "",
        }),
      });
      const isi = await res.json().catch(() => ({}));
      if (!res.ok) setGalat(isi?.error ?? "Gagal menandai honor dibayarkan.");
      else onSelesai();
    } finally {
      setSibuk(null);
    }
  }

  async function catatSusulan() {
    setGalat("");
    setKabarSusulan("");
    const res = await fetch("/api/platform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CATAT_BAGI_HASIL_TERTINGGAL" }),
    });
    const isi = await res.json().catch(() => ({}));
    if (!res.ok) setGalat(isi?.error ?? "Gagal menjalankan pencatatan susulan.");
    else {
      setKabarSusulan(
        isi.dicatat > 0
          ? `${isi.dicatat} kunjungan baru dicatat honornya.`
          : "Tidak ada kunjungan yang tertinggal — semuanya sudah tercatat."
      );
      onSelesai();
    }
  }

  return (
    <div className="bg-nh-panel rounded-2xl border border-nh-garis p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-nh-putih flex items-center gap-2">
            <Wallet className="w-4 h-4 text-nh-ungu" /> Bagi hasil perawat
          </h2>
          <p className="text-xs text-nh-kabut mt-1 max-w-xl">
            Dicatat otomatis begitu kunjungan ditutup <em>dan</em> pembayarannya
            masuk. Yang dibagi 70/30 hanya jasa tindakan — bahan habis pakai,
            biaya perjalanan, dan biaya di luar jam kerja utuh ke perawat.
          </p>
        </div>
        <button
          onClick={catatSusulan}
          className="text-xs px-3 py-2 rounded-lg border border-nh-garis text-nh-kabut hover:text-nh-putih hover:border-nh-ungu/50 flex items-center gap-2 shrink-0"
        >
          <RefreshCw className="w-3 h-3" /> Catat yang tertinggal
        </button>
      </div>

      {kabarSusulan && (
        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
          {kabarSusulan}
        </p>
      )}
      {galat && (
        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {galat}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Angka label="Siap dibayarkan" nilai={rp(totalSiap)} sub={`${siap.length} kunjungan`} />
        <Angka
          label="Perlu ditinjau"
          nilai={String(perluTinjauan)}
          sub={perluTinjauan ? "angkanya tidak cocok" : "tidak ada"}
          waspada={perluTinjauan > 0}
        />
        <Angka
          label="Sudah dibayarkan"
          nilai={String(daftar.filter((p) => p.status === "DIBAYARKAN").length)}
          sub="kunjungan"
        />
      </div>

      {daftar.length === 0 ? (
        <p className="text-sm text-nh-kabut">
          Belum ada kunjungan yang selesai dan lunas, jadi belum ada honor yang
          tercatat.
        </p>
      ) : (
        <div className="space-y-3">
          {daftar.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-nh-garis bg-nh-latar/40 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-nh-putih">
                    {p.providerName}{" "}
                    <span className="text-nh-kabut font-normal">· {p.bookingCode}</span>
                  </p>
                  <p className="text-xs text-nh-kabut">Kunjungan {p.visitDate}</p>
                </div>
                <span
                  className={`text-[11px] px-2 py-1 rounded-full border ${
                    WARNA[p.status] ?? "border-nh-garis text-nh-kabut"
                  }`}
                >
                  {NAMA_STATUS_BAGI_HASIL[p.status as StatusBagiHasil] ?? p.status}
                </span>
              </div>

              {/* Rinciannya ditampilkan utuh, bukan hanya jumlah akhirnya.
                  Perawat berhak tahu dari mana angkanya datang, dan admin
                  berhak bisa memeriksanya tanpa membuka basis data. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                <Rinci label="Tagihan pasien" nilai={rp(p.totalBilledIdr)} />
                <Rinci label="Jasa tindakan" nilai={rp(p.serviceIdr)} />
                <Rinci label="Porsi perawat (70%)" nilai={rp(p.providerShareIdr)} />
                <Rinci label="Potongan platform" nilai={rp(p.platformFeeIdr)} />
                <Rinci label="Bahan (utuh)" nilai={rp(p.suppliesIdr)} />
                <Rinci label="Perjalanan (utuh)" nilai={rp(p.travelIdr)} />
                <Rinci label="Luar jam (utuh)" nilai={rp(p.afterHoursIdr)} />
                <Rinci label="Diterima perawat" nilai={rp(p.providerTakeIdr)} tebal />
              </div>

              {p.note && (
                <p className="text-xs text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {p.note}
                </p>
              )}

              {p.status === "DIBAYARKAN" ? (
                <p className="text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ditransfer
                  {p.paidAt ? ` ${new Date(p.paidAt).toLocaleDateString("id-ID")}` : ""} · bukti{" "}
                  <code className="text-nh-kabut">{p.paymentReference}</code>
                </p>
              ) : p.status === "TERKUMPUL" ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    value={bukti[p.id] ?? ""}
                    onChange={(e) => setBukti({ ...bukti, [p.id]: e.target.value })}
                    placeholder="Nomor referensi transfer"
                    className="flex-1 min-w-[200px] bg-nh-latar border border-nh-garis rounded-lg px-3 py-2 text-xs text-nh-putih placeholder:text-nh-kabut-2"
                  />
                  <button
                    onClick={() => tandai(p)}
                    disabled={sibuk === p.id}
                    className="nh-tombol text-xs px-4 py-2 rounded-lg disabled:opacity-50"
                  >
                    {sibuk === p.id ? "Menyimpan…" : "Tandai sudah ditransfer"}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-nh-kabut flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" /> Belum bisa dibayarkan.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Angka({
  label,
  nilai,
  sub,
  waspada,
}: {
  label: string;
  nilai: string;
  sub: string;
  waspada?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        waspada ? "border-rose-500/40 bg-rose-500/10" : "border-nh-garis bg-nh-latar/40"
      }`}
    >
      <p className="text-[11px] text-nh-kabut">{label}</p>
      <p className={`text-lg font-bold ${waspada ? "text-rose-300" : "text-nh-putih"}`}>{nilai}</p>
      <p className="text-[11px] text-nh-kabut-2">{sub}</p>
    </div>
  );
}

function Rinci({ label, nilai, tebal }: { label: string; nilai: string; tebal?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-nh-kabut">{label}</p>
      <p className={tebal ? "text-nh-putih font-bold" : "text-nh-putih"}>{nilai}</p>
    </div>
  );
}
