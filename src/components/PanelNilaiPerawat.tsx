"use client";

/**
 * Yang dilihat PERAWAT tentang penilaian dirinya.
 *
 * Dua keputusan yang membentuk layar ini:
 *
 * 1. **Semua testimoni ikut dihitung**, termasuk yang tidak ditayangkan dan
 *    yang berupa keluhan. Angka yang hanya menghitung testimoni yang lolos
 *    seleksi admin adalah rata-rata dari testimoni terpilih, bukan dari
 *    pelayanan yang sebenarnya — dan tidak berguna untuk memperbaiki apa pun.
 *
 * 2. **Perawat melihat kritiknya, bukan hanya nilainya.** Angka 3,2 tanpa
 *    kalimatnya tidak memberitahu apa yang harus diubah. Yang menaikkan mutu
 *    layanan adalah kalimat "datangnya telat 40 menit dan ibu saya menunggu
 *    dengan luka terbuka", bukan bintangnya.
 */

import React, { useState } from "react";
import {
  ASPEK,
  ringkasNilai,
  bintangTeks,
  NAMA_TINJAUAN,
  bolehDibacaPerawat,
  type StatusTinjauan,
} from "@/logic/testimoni";
import { tanggalIndo } from "@/logic/sesi";
import { Star, MessageSquare, Send, AlertTriangle, Clock } from "lucide-react";

interface Props {
  testimoni: any[];
  sesi: { providerId: number | null; peran: string };
  onSelesai: () => void;
}

export function PanelNilaiPerawat({ testimoni, sesi, onSelesai }: Props) {
  const milikSaya = testimoni.filter(
    (t) => sesi.peran === "ADMIN" || t.providerId === sesi.providerId
  );

  /**
   * Nilainya dari SEMUA, teksnya hanya yang sudah diteruskan admin.
   *
   * Keputusan 8 September 2026. Kalau angkanya juga ikut disaring, yang
   * tampil adalah rata-rata dari masukan yang lolos meja admin — bukan
   * cerminan pelayanan. Jadi bintangnya menghitung semua; yang ditahan
   * hanya kalimatnya, dan jumlahnya dikatakan terang-terangan supaya
   * perawat tidak melihat angkanya turun tanpa tahu sebabnya.
   */
  const ringkasan = ringkasNilai(milikSaya);
  const bisaDibaca = milikSaya.filter(bolehDibacaPerawat);
  const masihDisortir = milikSaya.length - bisaDibaca.length;

  if (!milikSaya.length) {
    return (
      <div className="nh-panel p-5">
        <h3 className="text-base font-bold text-nh-putih">Penilaian pasien</h3>
        <p className="text-xs text-nh-kabut leading-relaxed mt-1">
          Belum ada testimoni. Pasien bisa mengisinya setelah kunjungan selesai.
        </p>
      </div>
    );
  }

  return (
    <div className="nh-panel p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-nh-putih">Penilaian pasien</h3>
        <p className="text-xs text-nh-kabut">
          {ringkasan.jumlah} testimoni — nilainya menghitung semuanya, termasuk
          yang belum diteruskan admin.
        </p>
      </div>

      {/* ---- ringkasan angka ---- */}
      <div className="rounded-xl bg-nh-panel-2 border border-nh-garis p-4 space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold font-mono text-nh-lampu">
            {bintangTeks(ringkasan.rata)}
          </span>
          <Star className="w-5 h-5 fill-nh-lampu text-nh-lampu" />
          <span className="text-xs text-nh-kabut-2">keseluruhan</span>
        </div>

        <div className="space-y-2 pt-1 border-t border-nh-garis">
          {ringkasan.perAspek.map((a) => (
            <div key={a.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-nh-kabut">{a.label}</span>
                <span className="font-mono font-semibold text-nh-putih">
                  {bintangTeks(a.rata)}
                  {a.jumlah === 0 && (
                    <span className="text-nh-kabut-2 font-normal"> belum dinilai</span>
                  )}
                </span>
              </div>
              {a.rata != null && (
                <div className="w-full bg-nh-malam h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      a.rata >= 4 ? "bg-nh-sembuh" : a.rata >= 3 ? "bg-nh-waspada" : "bg-nh-bahaya"
                    }`}
                    style={{ width: `${(a.rata / 5) * 100}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Masukan yang belum sampai. Dikatakan ada dan berapa banyak, tapi
          isinya tidak diintipkan — kalau jumlahnya disembunyikan juga,
          perawat melihat bintangnya turun tanpa satu pun penjelasan, dan
          itu lebih buruk daripada membaca kritiknya. */}
      {masihDisortir > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-nh-waspada/40 bg-nh-waspada/10 px-3 py-2.5">
          <Clock className="w-4 h-4 text-nh-waspada shrink-0 mt-0.5" />
          <p className="text-xs text-nh-putih leading-relaxed">
            <span className="font-bold">
              {masihDisortir} masukan sedang ditinjau admin.
            </span>{" "}
            Nilainya sudah ikut terhitung di atas; isinya sampai ke Anda setelah
            admin selesai memeriksanya.
          </p>
        </div>
      )}

      {/* ---- daftar testimoni yang sudah diteruskan ---- */}
      <div className="space-y-2.5">
        {bisaDibaca.map((t) => (
          <Baris key={t.id} t={t} sesi={sesi} onSelesai={onSelesai} />
        ))}
        {bisaDibaca.length === 0 && masihDisortir > 0 && (
          <p className="text-xs text-nh-kabut-2 leading-relaxed">
            Belum ada masukan yang diteruskan ke Anda.
          </p>
        )}
      </div>
    </div>
  );
}

function Baris({
  t,
  sesi,
  onSelesai,
}: {
  t: any;
  sesi: { providerId: number | null; peran: string };
  onSelesai: () => void;
}) {
  const [balasan, setBalasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async () => {
    setSibuk(true);
    setGalat(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "BALAS_TESTIMONI",
          testimoniId: t.id,
          balasan,
        }),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(jawab?.error ?? "Balasan gagal dikirim.");
        return;
      }
      setBalasan("");
      onSelesai();
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-3.5 space-y-2 ${
        t.keluhan ? "border-nh-bahaya/40 bg-nh-bahaya/5" : "border-nh-garis bg-nh-panel-2"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`w-3.5 h-3.5 ${
                n <= t.bintang ? "fill-nh-lampu text-nh-lampu" : "text-nh-garis-2"
              }`}
            />
          ))}
          {t.keluhan && (
            <span className="ml-1 text-[10px] font-bold text-nh-bahaya uppercase tracking-wider">
              Keluhan
            </span>
          )}
        </div>
        <span className="text-[11px] text-nh-kabut-2 shrink-0">
          {NAMA_TINJAUAN[(t.statusTinjauan ?? "BARU") as StatusTinjauan]}
        </span>
      </div>

      {/* Perawat melihat tulisan ASLI pasien, bukan versi yang sudah
          dirapikan admin. Untuk memperbaiki diri, yang berguna adalah
          kalimat apa adanya. */}
      <p className="text-xs text-nh-putih leading-relaxed whitespace-pre-wrap">
        {t.isiAsli}
      </p>
      <div className="text-[11px] text-nh-kabut-2">
        {t.serviceName} • {tanggalIndo(String(t.createdAt).slice(0, 10))}
      </div>

      {/* Nilai per aspek untuk testimoni ini */}
      {ASPEK.some((a) => t[a.kunci]) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-nh-kabut">
          {ASPEK.map((a) =>
            t[a.kunci] ? (
              <span key={a.kunci}>
                {a.label}: <span className="font-mono text-nh-putih">{t[a.kunci]}★</span>
              </span>
            ) : null
          )}
        </div>
      )}

      {/* Pengantar admin diletakkan DI ATAS tulisan pasien, tidak
          menggantikannya. Perawat tetap membaca kalimat aslinya. */}
      {t.catatanUntukPerawat && (
        <div className="rounded-xl border border-nh-waspada/40 bg-nh-waspada/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-nh-waspada shrink-0 mt-0.5" />
          <div>
            <div className="text-[11px] font-bold text-nh-waspada">Pengantar admin</div>
            <p className="text-xs text-nh-putih leading-relaxed mt-0.5 whitespace-pre-wrap">
              {t.catatanUntukPerawat}
            </p>
          </div>
        </div>
      )}

      {/* Balasan */}
      {t.balasanPerawat ? (
        <div className="rounded-xl bg-nh-malam border border-nh-garis p-3">
          <div className="text-[11px] font-bold text-nh-ungu-muda mb-1">Balasan Anda</div>
          <p className="text-xs text-nh-kabut leading-relaxed whitespace-pre-wrap">
            {t.balasanPerawat}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-nh-kabut">
            <MessageSquare className="w-3 h-3" /> Balas
            <span className="font-normal text-nh-kabut-2">
              — ikut tayang bila testimoninya tayang
            </span>
          </div>
          <textarea
            value={balasan}
            onChange={(e) => setBalasan(e.target.value)}
            rows={2}
            placeholder="Terima kasih atas masukannya…"
            className="nh-isian w-full px-3 py-2 text-xs leading-relaxed"
          />
          {galat && <p className="text-[11px] text-nh-bahaya">{galat}</p>}
          <button
            onClick={kirim}
            disabled={sibuk || balasan.trim().length < 3}
            className="nh-tombol px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" /> {sibuk ? "Mengirim…" : "Kirim balasan"}
          </button>
        </div>
      )}
    </div>
  );
}
