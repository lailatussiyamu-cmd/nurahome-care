"use client";

/**
 * Woundex di layar perawat: sinyal masuk, keputusan beserta alasannya keluar.
 *
 * Formulir dimulai KOSONG, sama seperti catatan klinis. Tidak ada angka
 * contoh yang bisa terkirim tanpa sengaja sebagai hasil ukur.
 *
 * Keputusan tidak dihitung di sini. Layar mengirim sinyal, server menilai
 * dengan logic/woundex.ts dan menyimpannya; yang tampil di bawah adalah
 * hasil yang tersimpan, persis yang tercatat di rekam medis.
 */

import React, { useMemo, useState } from "react";
import { S } from "@/logic/alur";
import { NAMA_TINGKAT, type HasilWoundex, type Tingkat } from "@/logic/woundex";
import { Activity, AlertTriangle } from "lucide-react";

interface Props {
  booking: any;
  pengkajian: any[];
  onSelesai: () => void;
}

const WARNA: Record<Tingkat, { teks: string; latar: string; garis: string }> = {
  MERAH: { teks: "text-nh-bahaya", latar: "bg-nh-bahaya/10", garis: "border-nh-bahaya/50" },
  KUNING: { teks: "text-nh-waspada", latar: "bg-nh-waspada/10", garis: "border-nh-waspada/50" },
  HIJAU: { teks: "text-nh-sembuh", latar: "bg-nh-sembuh/10", garis: "border-nh-sembuh/50" },
};
const TITIK: Record<string, string> = {
  MERAH: "bg-nh-bahaya",
  KUNING: "bg-nh-waspada",
  HIJAU: "bg-nh-sembuh",
  INFO: "bg-nh-garis-2",
};

const KOSONG = {
  panjangCm: "",
  lebarCm: "",
  kedalaman: "",
  eritemaCm: "",
  bengkak: false,
  hangat: false,
  nyeriTekan: false,
  nanah: false,
  nekrosisBaru: false,
  suhuC: "",
  nadi: "",
  napas: "",
  gulaDarah: "",
  nadiKakiTakTeraba: false,
  sensasiHilang: false,
  lokasi: "",
};

export function bacaHasil(baris: any): HasilWoundex | null {
  try {
    return JSON.parse(baris?.hasil ?? "null");
  } catch {
    return null;
  }
}

export function PanelWoundex({ booking, pengkajian, onSelesai }: Props) {
  const [isian, setIsian] = useState<typeof KOSONG>(KOSONG);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const bolehIsi = [S.PERAWAT_TIBA, S.DIKERJAKAN].includes(booking?.status);
  const terakhir = useMemo(
    () =>
      [...pengkajian].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0],
    [pengkajian]
  );
  const hasil = terakhir ? bacaHasil(terakhir) : null;

  if (!booking || booking.serviceCategory !== "WOUND_CARE") return null;
  if (!bolehIsi && !hasil) return null;

  const ubah = (k: keyof typeof KOSONG) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
    setIsian((s) => ({ ...s, [k]: v }));
  };

  const kirim = async () => {
    setSibuk(true);
    setGalat(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SIMPAN_WOUNDEX", bookingId: booking.id, sinyal: isian }),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(jawab?.error ?? "Gagal menyimpan pengkajian.");
        return;
      }
      setIsian(KOSONG);
      onSelesai();
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  };

  const Angka = ({ k, label, satuan }: { k: keyof typeof KOSONG; label: string; satuan: string }) => (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] text-nh-kabut">
        {label} <span className="text-nh-kabut-2">({satuan})</span>
      </span>
      <input
        id={`wx-${booking.id}-${k}`}
        inputMode="decimal"
        value={String(isian[k])}
        onChange={ubah(k)}
        className="nh-isian nh-angka px-3 py-2 text-sm w-full"
      />
    </label>
  );
  const Centang = ({ k, label }: { k: keyof typeof KOSONG; label: string }) => (
    <label
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs cursor-pointer select-none ${
        isian[k] ? "border-nh-ungu bg-nh-ungu/15 text-nh-putih" : "border-nh-garis text-nh-kabut"
      }`}
    >
      <input
        id={`wx-${booking.id}-${k}`}
        type="checkbox"
        checked={Boolean(isian[k])}
        onChange={ubah(k)}
        className="accent-nh-ungu w-4 h-4"
      />
      {label}
    </label>
  );

  return (
    <div className="nh-panel p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-nh-ungu/15 grid place-items-center shrink-0">
          <Activity className="w-5 h-5 text-nh-ungu-muda" />
        </div>
        <div>
          <h3 className="text-base font-bold text-nh-putih">Woundex · peringatan dini luka kaki diabetik</h3>
          <p className="text-xs text-nh-kabut mt-0.5 leading-relaxed">
            Isi yang Anda ukur di kunjungan ini. Keputusan dihitung server dengan aturan IWGDF/IDSA,
            SINBAD, dan tren luas 4 minggu — setiap peringatan menyebut alasannya.
          </p>
        </div>
      </div>

      {hasil && <HasilTampil hasil={hasil} waktu={terakhir?.createdAt} oleh={terakhir?.providerName} />}

      {bolehIsi && (
        <div className="space-y-4 border-t border-nh-garis pt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-nh-kabut-2">
            {hasil ? "Kaji ulang" : "Pengkajian kunjungan ini"}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Angka({ k: "panjangCm", label: "Panjang", satuan: "cm" })}
            {Angka({ k: "lebarCm", label: "Lebar", satuan: "cm" })}
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] text-nh-kabut">Jaringan terdalam</span>
              <select id={`wx-${booking.id}-kedalaman`} value={isian.kedalaman} onChange={ubah("kedalaman")} className="nh-isian px-3 py-2 text-sm">
                <option value="">Pilih…</option>
                <option value="KULIT">Kulit / subkutis</option>
                <option value="TENDON">Tendon / kapsul sendi</option>
                <option value="TULANG">Teraba sampai tulang</option>
              </select>
            </label>
            {Angka({ k: "eritemaCm", label: "Kemerahan dari tepi", satuan: "cm, 0 bila tidak ada" })}
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[11px] text-nh-kabut">Letak luka</span>
              <select id={`wx-${booking.id}-lokasi`} value={isian.lokasi} onChange={ubah("lokasi")} className="nh-isian px-3 py-2 text-sm">
                <option value="">Pilih…</option>
                <option value="DEPAN">Kaki depan</option>
                <option value="TENGAH">Kaki tengah</option>
                <option value="BELAKANG">Kaki belakang / tumit</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {Centang({ k: "bengkak", label: "Bengkak / indurasi" })}
            {Centang({ k: "hangat", label: "Teraba hangat" })}
            {Centang({ k: "nyeriTekan", label: "Nyeri tekan" })}
            {Centang({ k: "nanah", label: "Keluar nanah" })}
            {Centang({ k: "nekrosisBaru", label: "Nekrosis / hitam baru" })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Angka({ k: "suhuC", label: "Suhu", satuan: "°C" })}
            {Angka({ k: "nadi", label: "Nadi", satuan: "/menit" })}
            {Angka({ k: "napas", label: "Napas", satuan: "/menit" })}
            {Angka({ k: "gulaDarah", label: "Gula darah", satuan: "mg/dL, boleh kosong" })}
          </div>

          <div className="flex flex-wrap gap-2">
            {Centang({ k: "nadiKakiTakTeraba", label: "Nadi kaki tidak teraba" })}
            {Centang({ k: "sensasiHilang", label: "Sensasi protektif hilang" })}
          </div>

          {galat && (
            <p className="text-xs text-nh-bahaya flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {galat}
            </p>
          )}
          <button onClick={kirim} disabled={sibuk} className="nh-tombol w-full px-5 py-3 text-sm">
            {sibuk ? "Menilai…" : "Nilai dengan Woundex"}
          </button>
        </div>
      )}
    </div>
  );
}

export function HasilTampil({ hasil, waktu, oleh }: { hasil: HasilWoundex; waktu?: string; oleh?: string }) {
  const w = WARNA[hasil.tingkat];
  const p = hasil.proyeksi;
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border ${w.garis} ${w.latar} p-4`}>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-nh-kabut-2">Keputusan Woundex</div>
        <div className={`text-xl font-extrabold mt-0.5 ${w.teks}`}>{NAMA_TINGKAT[hasil.tingkat]}</div>
        <div className="text-sm text-nh-putih mt-1">{hasil.tindakan.utama}</div>
        {waktu && (
          <div className="text-[11px] text-nh-kabut-2 mt-2">
            {new Date(waktu).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
            {oleh ? ` · ${oleh}` : ""}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Kotak judul="IWGDF/IDSA" nilai={`Derajat ${hasil.derajatIwgdf}`} ket={`${hasil.namaDerajat} · ${hasil.tandaLokal}/5 lokal, ${hasil.tandaSistemik}/3 sistemik`} />
        <Kotak judul="SINBAD" nilai={`${hasil.sinbad}/6`} ket={hasil.sinbadRincian.length ? hasil.sinbadRincian.join(" · ") : "Tanpa faktor"} />
        <Kotak
          judul="Luas minggu ke-4"
          nilai={p ? `${p.reduksiMinggu4 >= 0 ? "−" : "+"}${Math.abs(Math.round(p.reduksiMinggu4 * 100))}%` : "—"}
          ket={p ? (p.terukur ? "Terukur sejak awal" : "Perkiraan dari tren") : "Perlu ≥ 2 pengukuran"}
          warna={p ? (p.reduksiMinggu4 >= 0.5 ? "text-nh-sembuh" : "text-nh-waspada") : undefined}
        />
      </div>

      <ul className="divide-y divide-nh-garis">
        {hasil.alasan.map((a, i) => (
          <li key={i} className="flex gap-2.5 py-2 text-sm text-nh-putih">
            <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${TITIK[a.tingkat]}`} />
            <span>{a.teks}</span>
          </li>
        ))}
      </ul>

      {hasil.tindakan.langkah.length > 0 && (
        <ol className="list-decimal pl-5 text-sm text-nh-kabut space-y-1">
          {hasil.tindakan.langkah.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
          <li>{hasil.tindakan.berikutnya}.</li>
        </ol>
      )}

      {hasil.titik.length >= 2 && <Tren hasil={hasil} />}
    </div>
  );
}

function Kotak({ judul, nilai, ket, warna }: { judul: string; nilai: string; ket: string; warna?: string }) {
  return (
    <div className="rounded-xl border border-nh-garis p-3 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-nh-kabut-2">{judul}</div>
      <div className={`nh-angka text-lg font-bold mt-0.5 ${warna ?? "text-nh-putih"}`}>{nilai}</div>
      <div className="text-[11px] text-nh-kabut leading-snug mt-0.5">{ket}</div>
    </div>
  );
}

/** Grafik luas terhadap hari, dengan garis target 50% dan proyeksi ke hari 28. */
function Tren({ hasil }: { hasil: HasilWoundex }) {
  const t = hasil.titik;
  const W = 520, H = 170, L = 38, R = 12, T = 12, B = 26;
  const maxH = Math.max(35, t[t.length - 1].hari + 7);
  const maxL = Math.max(...t.map((x) => x.luas), hasil.proyeksi?.luasMinggu4 ?? 0) * 1.18 || 1;
  const X = (h: number) => L + (h / maxH) * (W - L - R);
  const Y = (v: number) => T + (1 - v / maxL) * (H - T - B);
  const garis = t.map((q, i) => `${i ? "L" : "M"}${X(q.hari).toFixed(1)},${Y(q.luas).toFixed(1)}`).join("");
  const target = t[0].luas * 0.5;
  const akhir = t[t.length - 1];
  const p = hasil.proyeksi;
  const minggu = [0, 7, 14, 21, 28, 35, 42, 49, 56].filter((h) => h <= maxH);
  return (
    <div className="overflow-x-auto">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-nh-kabut-2 mb-1">Tren luas luka (cm²)</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[360px] h-auto" role="img" aria-label="Tren luas luka">
        {minggu.map((h) => (
          <text key={h} x={X(h)} y={H - 8} textAnchor="middle" fontSize="10" fill="#9488B8">
            h{h}
          </text>
        ))}
        <line x1={X(28)} x2={X(28)} y1={T} y2={H - B} stroke="#3B2C5C" />
        <text x={X(28) + 4} y={T + 10} fontSize="10" fill="#A498C4">minggu 4</text>
        <line x1={L} x2={W - R} y1={Y(target)} y2={Y(target)} stroke="#9488B8" strokeDasharray="2 4" />
        <text x={L} y={Y(target) - 4} fontSize="10" fill="#9488B8">target 50%</text>
        <path d={garis} fill="none" stroke="#D8B4FE" strokeWidth="2.5" strokeLinejoin="round" />
        {p && !p.terukur && (
          <path
            d={`M${X(akhir.hari)},${Y(akhir.luas)}L${X(28)},${Y(p.luasMinggu4)}`}
            stroke="#D8B4FE"
            strokeWidth="2"
            strokeDasharray="5 4"
            fill="none"
          />
        )}
        {t.map((q, i) => (
          <circle key={i} cx={X(q.hari)} cy={Y(q.luas)} r={i === t.length - 1 ? 5 : 3.5} fill={i === t.length - 1 ? "#FFB86B" : "#D8B4FE"} />
        ))}
        <text x={L - 6} y={Y(0) + 3} textAnchor="end" fontSize="10" fill="#9488B8">0</text>
        <text x={L - 6} y={Y(t[0].luas) + 3} textAnchor="end" fontSize="10" fill="#9488B8">
          {Math.round(t[0].luas * 10) / 10}
        </text>
      </svg>
    </div>
  );
}
