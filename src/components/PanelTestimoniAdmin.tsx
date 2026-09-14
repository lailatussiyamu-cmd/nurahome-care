"use client";

/**
 * Panel admin untuk testimoni.
 *
 * Dirancang supaya batasnya terlihat, bukan sekadar berlaku di belakang
 * layar. Admin melihat tulisan asli pasien BERDAMPINGAN dengan versi tayang
 * yang sedang ia sunting, dan melihat sendiri bahwa:
 *
 * - bintang tidak punya tombol apa pun untuk diubah;
 * - testimoni yang pasiennya minta jangan ditayangkan memang tidak punya
 *   tombol tayang;
 * - setiap perubahan menuntut alasan sebelum bisa disimpan.
 *
 * Aturan yang sama diperiksa lagi di server. Yang di sini supaya orangnya
 * mengerti kenapa, yang di sana supaya tidak bisa dilewati.
 */

import React, { useState } from "react";
import {
  ASPEK,
  NAMA_IZIN,
  NAMA_TINJAUAN,
  NAMA_KE_PERAWAT,
  PENJELASAN_KE_PERAWAT,
  penghalangEdit,
  penghalangTayang,
  penghalangTahan,
  bolehDitahan,
  bintangTeks,
  type StatusTinjauan,
  type StatusKePerawat,
} from "@/logic/testimoni";
import { Star, Lock, Eye, EyeOff, ShieldAlert, UserCheck, PauseCircle, HeartPulse } from "lucide-react";

interface Props {
  testimoni: any[];
  bookings: any[];
  sesi: { nama: string | null; peran: string };
  onSelesai: () => void;
}

export function PanelTestimoniAdmin({ testimoni, bookings, sesi, onSelesai }: Props) {
  const [dibuka, setDibuka] = useState<number | null>(null);

  const belum = testimoni.filter((t) => t.statusTinjauan === "BARU");
  const keluhan = testimoni.filter((t) => t.keluhan);
  // Yang paling perlu perhatian: belum disortir ke perawat.
  const belumDisortir = testimoni.filter((t) => t.statusKePerawat === "BARU");

  return (
    <div className="bg-nh-panel rounded-2xl border border-nh-garis p-6 space-y-4">
      <div>
        <h2 className="text-base font-bold text-nh-putih">Testimoni pasien</h2>
        <p className="text-xs text-nh-kabut leading-relaxed">
          {testimoni.length} testimoni
          {belumDisortir.length > 0 && ` • ${belumDisortir.length} belum disortir ke perawat`}
          {belum.length > 0 && ` • ${belum.length} belum dibaca`}
          {keluhan.length > 0 && ` • ${keluhan.length} keluhan`}
        </p>
      </div>

      {testimoni.length === 0 ? (
        <p className="text-xs text-nh-kabut-2">
          Belum ada testimoni. Kolomnya muncul di portal pasien setelah
          kunjungan selesai.
        </p>
      ) : (
        <div className="space-y-2.5">
          {testimoni.map((t) => (
            <Kartu
              key={t.id}
              t={t}
              booking={bookings.find((b: any) => b.id === t.bookingId)}
              terbuka={dibuka === t.id}
              onBuka={() => setDibuka(dibuka === t.id ? null : t.id)}
              sesi={sesi}
              onSelesai={onSelesai}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Kartu({
  t,
  booking,
  terbuka,
  onBuka,
  sesi,
  onSelesai,
}: {
  t: any;
  booking: any;
  terbuka: boolean;
  onBuka: () => void;
  sesi: { nama: string | null; peran: string };
  onSelesai: () => void;
}) {
  const [isiTayang, setIsiTayang] = useState<string>(t.isiTayang ?? "");
  const [alasan, setAlasan] = useState("");
  const [catatan, setCatatan] = useState<string>(t.catatanUntukPerawat ?? "");
  const [alasanTahan, setAlasanTahan] = useState("");
  const [alasanSengketa, setAlasanSengketa] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const status = (t.statusTinjauan ?? "BARU") as StatusTinjauan;
  const berubah = isiTayang.trim() !== (t.isiTayang ?? "").trim();
  const halanganEdit = penghalangEdit({ isiTayang, isiAsli: t.isiAsli, alasan });
  const halanganTayang = penghalangTayang({ ...t, isiTayang });
  const keP = (t.statusKePerawat ?? "BARU") as StatusKePerawat;
  const bisaDitahan = bolehDitahan(t);
  const halanganTahan = penghalangTahan({ bahayaKlinis: t.bahayaKlinis, alasan: alasanTahan });

  const panggil = async (isi: Record<string, unknown>) => {
    setSibuk(true);
    setGalat(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isi),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(jawab?.error ?? "Gagal menyimpan.");
        return;
      }
      setAlasan("");
      setAlasanSengketa("");
      setAlasanTahan("");
      onSelesai();
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-3.5 space-y-2.5 ${
        t.keluhan
          ? "border-nh-bahaya/40 bg-nh-bahaya/5"
          : status === "BARU"
          ? "border-nh-ungu/35 bg-nh-ungu/5"
          : "border-nh-garis bg-nh-panel-2"
      }`}
    >
      {/* ---- ringkasan ---- */}
      <button onClick={onBuka} className="w-full text-left space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`w-3.5 h-3.5 ${
                  n <= t.bintang ? "fill-nh-lampu text-nh-lampu" : "text-nh-garis-2"
                }`}
              />
            ))}
            {t.bahayaKlinis ? (
              <span className="ml-1 text-[10px] font-bold text-nh-bahaya uppercase tracking-wider flex items-center gap-1">
                <HeartPulse className="w-3 h-3" /> Keselamatan
              </span>
            ) : t.keluhan ? (
              <span className="ml-1 text-[10px] font-bold text-nh-bahaya uppercase tracking-wider">
                Keluhan
              </span>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span className="text-[11px] font-semibold text-nh-kabut-2">
              {NAMA_TINJAUAN[status]}
            </span>
            {/* Status penyortiran ke perawat ditampilkan di ringkasan, bukan
                hanya setelah dibuka — inilah yang paling mudah terlupakan. */}
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                (t.statusKePerawat ?? "BARU") === "DITERUSKAN"
                  ? "text-nh-sembuh"
                  : "text-nh-waspada"
              }`}
            >
              {NAMA_KE_PERAWAT[(t.statusKePerawat ?? "BARU") as StatusKePerawat]}
            </span>
          </div>
        </div>
        <div className="text-xs text-nh-putih leading-relaxed line-clamp-2">
          {t.isiAsli}
        </div>
        <div className="text-[11px] text-nh-kabut-2">
          {t.patientName} • {t.providerName ?? "—"} • {t.serviceName}
        </div>
      </button>

      {terbuka && (
        <div className="pt-2.5 border-t border-nh-garis space-y-3">
          {/* ---- nilai per aspek: hanya dibaca ---- */}
          <div className="rounded-xl bg-nh-malam border border-nh-garis p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-nh-kabut uppercase tracking-wider">
              <Lock className="w-3 h-3" /> Nilai pasien — tidak bisa diubah
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-nh-kabut">Keseluruhan</span>
              <span className="font-mono font-bold text-nh-lampu">
                {bintangTeks(t.bintang)} ★
              </span>
            </div>
            {ASPEK.map((a) => (
              <div key={a.kunci} className="flex justify-between text-xs">
                <span className="text-nh-kabut">{a.label}</span>
                <span className="font-mono text-nh-kabut">
                  {t[a.kunci] ? `${bintangTeks(t[a.kunci])} ★` : "tidak diisi"}
                </span>
              </div>
            ))}
          </div>

          {/* ---- tulisan asli: hanya dibaca ---- */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-nh-kabut uppercase tracking-wider mb-1">
              <Lock className="w-3 h-3" /> Tulisan asli pasien
            </div>
            <p className="text-xs text-nh-putih leading-relaxed whitespace-pre-wrap rounded-xl bg-nh-malam border border-nh-garis p-3">
              {t.isiAsli}
            </p>
          </div>

          {/* ---- versi tayang: boleh dirapikan ---- */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-nh-kabut uppercase tracking-wider">
              Versi yang ditayangkan
            </div>
            <textarea
              value={isiTayang}
              onChange={(e) => setIsiTayang(e.target.value)}
              rows={4}
              className="nh-isian w-full px-3 py-2.5 text-xs leading-relaxed"
            />
            <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
              Boleh dipotong dan dibetulkan ketikannya. Bukan ditulis ulang —
              yang tayang harus tetap terbaca sebagai kalimat pasien.
            </p>
            {berubah && (
              <input
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                placeholder="Alasan perubahan — wajib, ikut tersimpan"
                className="nh-isian w-full px-3 py-2 text-xs"
              />
            )}
            {t.diedit && (
              <p className="text-[11px] text-nh-waspada leading-relaxed">
                Pernah dirapikan {t.dieditOleh} — {t.alasanEdit}. Pasien melihat
                kedua versinya di portalnya.
              </p>
            )}
          </div>

          {/* ---- izin dari pasien ---- */}
          <div
            className={`rounded-xl border p-3 text-xs leading-relaxed ${
              t.izinTayang === "JANGAN_TAYANG"
                ? "border-nh-bahaya/40 bg-nh-bahaya/10 text-nh-bahaya"
                : "border-nh-garis bg-nh-malam text-nh-kabut"
            }`}
          >
            <span className="font-bold">Izin pasien:</span>{" "}
            {NAMA_IZIN[t.izinTayang as keyof typeof NAMA_IZIN] ?? t.izinTayang}
            {t.namaTayang && (
              <>
                {" "}
                — tayang sebagai{" "}
                <span className="font-semibold text-nh-putih">{t.namaTayang}</span>
              </>
            )}
          </div>

          {/* ================= PENYORTIRAN KE PERAWAT =================
              Keputusan yang TERPISAH dari tayang publik. Yang Anda kendalikan
              di sini adalah kapan perawat membacanya dan pengantar apa yang
              menyertainya — bukan apakah ia boleh tahu. Begitu diteruskan,
              yang ia baca tetap kalimat asli pasien.
              ========================================================== */}
          <div className="rounded-xl border border-nh-garis bg-nh-malam p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-nh-kabut uppercase tracking-wider">
                <UserCheck className="w-3 h-3" /> Untuk {t.providerName ?? "perawat"}
              </div>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  keP === "DITERUSKAN" ? "text-nh-sembuh" : "text-nh-waspada"
                }`}
              >
                {NAMA_KE_PERAWAT[keP]}
              </span>
            </div>
            <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
              {PENJELASAN_KE_PERAWAT[keP]}
            </p>

            {/* Keluhan keselamatan: tidak ada tombol tahan sama sekali. */}
            {!bisaDitahan.boleh && (
              <div className="flex items-start gap-2 rounded-xl border border-nh-bahaya/40 bg-nh-bahaya/10 px-3 py-2.5">
                <HeartPulse className="w-3.5 h-3.5 text-nh-bahaya shrink-0 mt-0.5" />
                <p className="text-[11px] text-nh-putih leading-relaxed">
                  {bisaDitahan.alasan}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-nh-putih">
                Pengantar Anda
                <span className="font-normal text-nh-kabut-2">
                  {" "}— ikut terbaca perawat, di atas tulisan asli pasien
                </span>
              </div>
              <textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                rows={2}
                placeholder="Misalnya: sudah saya hubungi pasiennya — ada salah paham soal jadwal, bukan kesalahan Anda. Tapi tolong tetap kabari kalau terlambat."
                className="nh-isian w-full px-3 py-2 text-xs leading-relaxed"
              />
            </div>

            {/* Alasan menahan hanya diminta kalau memang boleh ditahan. */}
            {bisaDitahan.boleh && keP !== "DITERUSKAN" && (
              <input
                value={alasanTahan}
                onChange={(e) => setAlasanTahan(e.target.value)}
                placeholder="Alasan menahan — wajib bila belum diteruskan"
                className="nh-isian w-full px-3 py-2 text-xs"
              />
            )}

            {keP === "DITAHAN" && t.alasanTahan && (
              <p className="text-[11px] text-nh-waspada leading-relaxed">
                Ditahan dengan alasan: {t.alasanTahan}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  panggil({
                    action: "TINJAU_TESTIMONI",
                    testimoniId: t.id,
                    catatanUntukPerawat: catatan,
                    teruskanKePerawat: true,
                  })
                }
                disabled={sibuk || keP === "DITERUSKAN"}
                className="nh-tombol px-4 py-2.5 text-xs flex items-center gap-1.5 disabled:opacity-40"
              >
                <UserCheck className="w-3.5 h-3.5" />
                {keP === "DITERUSKAN" ? "Sudah diteruskan" : "Teruskan ke perawat"}
              </button>

              {bisaDitahan.boleh && keP !== "DITAHAN" && (
                <button
                  onClick={() =>
                    panggil({
                      action: "TINJAU_TESTIMONI",
                      testimoniId: t.id,
                      catatanUntukPerawat: catatan,
                      teruskanKePerawat: false,
                      alasanTahan,
                    })
                  }
                  disabled={sibuk || !!halanganTahan}
                  className="px-4 py-2.5 rounded-xl border border-nh-garis-2 text-nh-kabut text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
                >
                  <PauseCircle className="w-3.5 h-3.5" /> Tahan dulu
                </button>
              )}
            </div>

            {bisaDitahan.boleh && halanganTahan && keP !== "DITERUSKAN" && (
              <p className="text-[11px] text-nh-kabut-2 leading-relaxed">{halanganTahan}</p>
            )}
          </div>

          {t.balasanPerawat && (
            <div className="rounded-xl bg-nh-malam border border-nh-garis p-3">
              <div className="text-[11px] font-bold text-nh-ungu-muda mb-1">
                Balasan perawat
              </div>
              <p className="text-xs text-nh-kabut leading-relaxed whitespace-pre-wrap">
                {t.balasanPerawat}
              </p>
            </div>
          )}

          {galat && (
            <div className="flex items-start gap-2 text-xs text-nh-bahaya bg-nh-bahaya/10 border border-nh-bahaya/30 rounded-xl px-3 py-2 leading-relaxed">
              <span aria-hidden="true" className="font-bold">!</span>
              <span>{galat}</span>
            </div>
          )}

          {/* ---- tombol ---- */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                panggil({
                  action: "TINJAU_TESTIMONI",
                  testimoniId: t.id,
                  isiTayang,
                  alasanEdit: alasan,
                  catatanUntukPerawat: catatan,
                })
              }
              disabled={sibuk || !!halanganEdit}
              className="px-4 py-2.5 rounded-xl border border-nh-garis-2 text-nh-kabut text-xs font-bold hover:text-nh-putih disabled:opacity-40"
            >
              Simpan
            </button>

            {/* Tombol tayang memang TIDAK ADA untuk testimoni yang pasiennya
                minta jangan ditayangkan. Bukan disembunyikan setelah ditekan
                — memang tidak dirender. */}
            {halanganTayang ? (
              <span className="px-3 py-2.5 text-[11px] text-nh-kabut-2 leading-relaxed flex-1 min-w-[180px]">
                {halanganTayang}
              </span>
            ) : status === "TAYANG" ? (
              <button
                onClick={() =>
                  panggil({ action: "TINJAU_TESTIMONI", testimoniId: t.id, tayangkan: false })
                }
                disabled={sibuk}
                className="px-4 py-2.5 rounded-xl border border-nh-garis-2 text-nh-kabut text-xs font-bold flex items-center gap-1.5"
              >
                <EyeOff className="w-3.5 h-3.5" /> Turunkan
              </button>
            ) : (
              <button
                onClick={() =>
                  panggil({
                    action: "TINJAU_TESTIMONI",
                    testimoniId: t.id,
                    isiTayang,
                    alasanEdit: alasan,
                    catatanUntukPerawat: catatan,
                    tayangkan: true,
                  })
                }
                disabled={sibuk || !!halanganEdit}
                className="nh-tombol px-4 py-2.5 text-xs flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" /> Tayangkan
              </button>
            )}
          </div>

          {halanganEdit && (
            <p className="text-[11px] text-nh-waspada leading-relaxed">{halanganEdit}</p>
          )}

          {/* ---- sengketa ---- */}
          {booking && (
            <div className="pt-2.5 border-t border-nh-garis space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-nh-kabut uppercase tracking-wider">
                <ShieldAlert className="w-3 h-3" /> Penanda sengketa
              </div>
              <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
                {booking.sengketa
                  ? "Menyala. Foto dan catatan kunjungan ini dibekukan — tidak akan terhapus otomatis meski masa simpannya habis."
                  : "Nyalakan bila ada keluhan atau perselisihan. Selama menyala, bukti kunjungan ini tidak akan tersentuh tugas terjadwal."}
              </p>
              <input
                value={alasanSengketa}
                onChange={(e) => setAlasanSengketa(e.target.value)}
                placeholder={booking.sengketa ? "Alasan mencabut" : "Alasan menyalakan"}
                className="nh-isian w-full px-3 py-2 text-xs"
              />
              <button
                onClick={() =>
                  panggil({
                    action: "TANDAI_SENGKETA",
                    bookingId: booking.id,
                    sengketa: !booking.sengketa,
                    alasan: alasanSengketa,
                  })
                }
                disabled={sibuk || alasanSengketa.trim().length < 5}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 ${
                  booking.sengketa
                    ? "border border-nh-garis-2 text-nh-kabut"
                    : "border border-nh-bahaya/50 bg-nh-bahaya/10 text-nh-bahaya"
                }`}
              >
                {booking.sengketa ? "Cabut penanda sengketa" : "Tandai bersengketa"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
