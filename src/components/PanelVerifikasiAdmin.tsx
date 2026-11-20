"use client";

/**
 * Meja verifikasi admin.
 *
 * Ini layar tempat lencana "Terverifikasi" akhirnya punya dasar. Tiga hal
 * yang membentuknya:
 *
 * 1. **Meluluskan wajib menyebut di mana dicocokkan.** Tanpa itu, keputusan
 *    ini hanya berarti seseorang menekan tombol hijau — persis keadaan yang
 *    sedang diperbaiki, hanya dengan tombol.
 *
 * 2. **Menolak dan membekukan wajib beralasan.** Yang membacanya adalah
 *    perawat yang penghasilannya berhenti hari itu; "ditolak" tanpa kalimat
 *    tidak memberitahunya apa yang harus diperbaiki.
 *
 * 3. **Tidak ada tombol "luluskan semua".** Kalau ada, ia akan dipakai.
 */

import React, { useState } from "react";
import {
  NAMA_VERIFIKASI,
  PERINGATAN_SIP_HARI,
  TEMPAT_PERIKSA,
  penghalangPutusVerifikasi,
  sisaHariSIP,
  sipKedaluwarsa,
  type StatusVerifikasi,
} from "@/logic/verifikasi";
import { tanggalIndo } from "@/logic/sesi";
import { ShieldCheck, ShieldAlert, FileText, Loader2, ExternalLink } from "lucide-react";

interface Props {
  providers: any[];
  providerDocuments: any[];
  verificationReviews: any[];
  onSelesai: () => void;
}

/** Yang perlu ditangani lebih dulu, di atas. */
const URUTAN: Record<string, number> = {
  MENUNGGU_TINJAUAN: 0,
  KEDALUWARSA: 1,
  PERLU_PERBAIKAN: 2,
  BELUM_DIAJUKAN: 3,
  DIBEKUKAN: 4,
  TERVERIFIKASI: 5,
};

export function PanelVerifikasiAdmin({
  providers,
  providerDocuments,
  verificationReviews,
  onSelesai,
}: Props) {
  const daftar = [...(providers ?? [])].sort(
    (a, b) =>
      (URUTAN[a.verifiedStatus] ?? 9) - (URUTAN[b.verifiedStatus] ?? 9) ||
      String(a.fullName).localeCompare(String(b.fullName))
  );

  const perluDitangani = daftar.filter(
    (p) =>
      p.verifiedStatus === "MENUNGGU_TINJAUAN" ||
      sipKedaluwarsa(p.sipBerlakuSampai) ||
      (sisaHariSIP(p.sipBerlakuSampai) ?? 999) <= PERINGATAN_SIP_HARI
  ).length;

  return (
    <div className="nh-panel p-5 space-y-4">
      <div>
        <h3 className="text-base font-bold text-nh-putih">Verifikasi perawat</h3>
        <p className="text-xs text-nh-kabut leading-relaxed">
          {perluDitangani > 0
            ? `${perluDitangani} perawat perlu ditangani.`
            : "Tidak ada yang perlu ditangani sekarang."}
        </p>
      </div>

      {/* Diletakkan di sini, bukan di dokumentasi: yang membaca aturan ini
          adalah orang yang sedang memutuskan, bukan orang yang sedang
          membaca berkas README. */}
      <div className="rounded-xl bg-nh-panel-2 border border-nh-garis p-3">
        <p className="text-[11px] text-nh-kabut leading-relaxed">
          <span className="font-bold text-nh-putih">STR</span> membuktikan
          seseorang terdaftar sebagai perawat, berlaku seumur hidup sejak
          UU 17/2023.{" "}
          <span className="font-bold text-nh-putih">SIP / SIPP</span> membuktikan
          ia boleh berpraktik, ada masa berlakunya, dan diterbitkan pemerintah
          daerah. Yang menentukan boleh-tidaknya menerima kunjungan adalah SIP.
        </p>
      </div>

      <div className="space-y-3">
        {daftar.map((p) => (
          <Baris
            key={p.id}
            p={p}
            berkas={(providerDocuments ?? []).filter((d) => d.providerId === p.id)}
            riwayat={(verificationReviews ?? []).filter((r) => r.providerId === p.id)}
            onSelesai={onSelesai}
          />
        ))}
        {daftar.length === 0 && (
          <p className="text-xs text-nh-kabut-2">Belum ada perawat terdaftar.</p>
        )}
      </div>
    </div>
  );
}

function Baris({
  p,
  berkas,
  riwayat,
  onSelesai,
}: {
  p: any;
  berkas: any[];
  riwayat: any[];
  onSelesai: () => void;
}) {
  const [buka, setBuka] = useState(false);
  const [keputusan, setKeputusan] = useState("TERVERIFIKASI");
  const [diperiksaDi, setDiperiksaDi] = useState(TEMPAT_PERIKSA[0]);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [fotoCocok, setFotoCocok] = useState(false);

  /** Foto wajah terbaru — yang akan dilihat pasien bila diluluskan. */
  const fotoWajah = berkas
    .filter((b) => b.jenis === "FOTO" && !b.supersededAt)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
  const perluCocokFoto = keputusan === "TERVERIFIKASI" && !!fotoWajah && !fotoCocok;

  const status = (p.verifiedStatus ?? "BELUM_DIAJUKAN") as StatusVerifikasi;
  const sisa = sisaHariSIP(p.sipBerlakuSampai);
  const habis = sipKedaluwarsa(p.sipBerlakuSampai);
  const menunggu = status === "MENUNGGU_TINJAUAN";

  const tolak = penghalangPutusVerifikasi({ keputusan, alasan, diperiksaDi });

  const kirim = async () => {
    setSibuk(true);
    setGalat(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "PUTUS_VERIFIKASI",
          providerId: p.id,
          keputusan,
          alasan,
          diperiksaDi,
          fotoCocok,
        }),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(jawab?.error ?? "Keputusan gagal disimpan.");
        return;
      }
      setAlasan("");
      setBuka(false);
      onSelesai();
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  };

  const aktif = berkas.filter((b) => !b.supersededAt);

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        menunggu
          ? "border-nh-waspada/40 bg-nh-waspada/5"
          : habis
            ? "border-nh-bahaya/40 bg-nh-bahaya/5"
            : "border-nh-garis bg-nh-panel-2"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Nama perawat TIDAK dipotong.
            Di layar 390px `truncate` membuatnya jadi "Ns. Dwi…" dan
            "Ns. Hendra Wijaya…" — dan yang sedang dikerjakan admin di layar
            ini justru mencocokkan NAMA di layar dengan nama di dokumen STR.
            Nama yang terpotong membuat pekerjaannya mustahil. */}
        <div className="min-w-0">
          <div className="text-sm font-bold text-nh-putih break-words">{p.fullName}</div>
          <div className="text-[11px] text-nh-kabut">{p.specialty}</div>
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
            status === "TERVERIFIKASI" && !habis
              ? "bg-nh-sembuh/15 text-nh-sembuh"
              : menunggu
                ? "bg-nh-waspada/15 text-nh-waspada"
                : "bg-nh-bahaya/15 text-nh-bahaya"
          }`}
        >
          {habis && status === "TERVERIFIKASI"
            ? "SIP KEDALUWARSA"
            : NAMA_VERIFIKASI[status] ?? status}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <Data label="STR" nilai={p.licenseNumber} />
        <Data label="SIP / SIPP" nilai={p.sipNumber} />
        <Data
          label="SIP berlaku s.d."
          nilai={
            p.sipBerlakuSampai
              ? `${tanggalIndo(String(p.sipBerlakuSampai))}${
                  sisa != null ? (sisa < 0 ? " — sudah lewat" : ` — ${sisa} hari lagi`) : ""
                }`
              : null
          }
          bahaya={habis || (sisa != null && sisa <= PERINGATAN_SIP_HARI)}
        />
        <Data label="Diterbitkan" nilai={p.sipDiterbitkanOleh} />
      </div>

      {p.verifiedAt && (
        <div className="text-[11px] text-nh-kabut-2 leading-relaxed">
          Diluluskan {p.verifiedByName} pada{" "}
          {tanggalIndo(new Date(p.verifiedAt).toISOString().slice(0, 10))}
          {p.verifiedSumber ? `, dicocokkan di ${p.verifiedSumber}.` : "."}
        </div>
      )}

      {/* Berkas — dibuka di tab baru, bukan ditampilkan langsung.
          KTP dan STR memuat NIK dan tanda tangan; keduanya tidak perlu
          terpampang begitu saja di layar yang bisa terlihat orang lain. */}
      {aktif.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {aktif.map((b) => (
            <a
              key={b.id}
              href={b.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-nh-malam border border-nh-garis text-[11px] font-semibold text-nh-ungu-muda hover:border-nh-ungu/50"
            >
              <FileText className="w-3 h-3" /> {b.jenis}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ))}
        </div>
      )}

      {!buka ? (
        <button
          onClick={() => setBuka(true)}
          className="px-3.5 py-2 rounded-xl border border-nh-garis text-xs font-semibold text-nh-putih hover:border-nh-ungu/50"
        >
          {menunggu ? "Tinjau pengajuan" : "Ubah status"}
        </button>
      ) : (
        <div className="space-y-3 pt-2 border-t border-nh-garis">
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["TERVERIFIKASI", "Luluskan"],
                ["PERLU_PERBAIKAN", "Perlu perbaikan"],
                ["DIBEKUKAN", "Bekukan"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setKeputusan(k)}
                aria-pressed={keputusan === k}
                className={`py-2 rounded-xl text-[11px] font-bold border transition ${
                  keputusan === k
                    ? k === "TERVERIFIKASI"
                      ? "bg-nh-sembuh/15 border-nh-sembuh/50 text-nh-sembuh"
                      : "bg-nh-bahaya/15 border-nh-bahaya/50 text-nh-bahaya"
                    : "border-nh-garis text-nh-kabut hover:text-nh-putih"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {keputusan === "TERVERIFIKASI" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-nh-kabut">
                Di mana nomornya dicocokkan?
              </label>
              <select
                value={diperiksaDi}
                onChange={(e) => setDiperiksaDi(e.target.value)}
                className="nh-isian w-full px-3 py-2.5 text-sm"
              >
                {TEMPAT_PERIKSA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
                Tercatat permanen bersama nama Anda. Tidak ada pemeriksaan otomatis
                ke register pusat — tidak ada layanan resmi yang bisa dipanggil
                aplikasi, dan menebak isi halaman web akan menghasilkan lencana yang
                salah persis seperti sebelumnya.
              </p>

              {/* Foto wajah — inilah yang akan dilihat pasien di depan pintu.
                  Ditampilkan langsung (bukan tautan seperti KTP), karena
                  memang harus dibandingkan berdampingan dengan foto KTP. */}
              {fotoWajah && (
                <div className="flex items-start gap-3 rounded-xl border border-nh-garis p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fotoWajah.fileUrl}
                    alt={`Foto wajah ${p.fullName}`}
                    className="w-20 h-20 shrink-0 rounded-lg object-cover"
                  />
                  <label className="flex items-start gap-2 text-xs text-nh-putih leading-relaxed cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fotoCocok}
                      onChange={(e) => setFotoCocok(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Wajah di foto ini sama dengan wajah di KTP. Foto ini akan
                      ditunjukkan kepada pasien yang dikunjunginya.
                    </span>
                  </label>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-nh-kabut">
                Alasan — dibaca perawatnya
              </label>
              <textarea
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                rows={3}
                placeholder="Mis. foto SIP terpotong di bagian masa berlaku; mohon unggah ulang halaman penuh."
                className="nh-isian w-full px-3 py-2 text-xs leading-relaxed"
              />
              {keputusan === "DIBEKUKAN" && (
                <p className="text-[11px] text-nh-bahaya leading-relaxed">
                  Pembekuan langsung mengeluarkannya dari semua perangkat dan
                  menghentikan kunjungan barunya.
                </p>
              )}
            </div>
          )}

          {(galat || tolak) && (
            <p className="text-xs text-nh-bahaya leading-relaxed">{galat ?? tolak}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={kirim}
              disabled={sibuk || !!tolak || perluCocokFoto}
              className="nh-tombol px-4 py-2.5 text-xs flex items-center gap-2 disabled:opacity-40"
            >
              {sibuk ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : keputusan === "TERVERIFIKASI" ? (
                <ShieldCheck className="w-3.5 h-3.5" />
              ) : (
                <ShieldAlert className="w-3.5 h-3.5" />
              )}
              Simpan keputusan
            </button>
            <button
              onClick={() => setBuka(false)}
              className="px-4 py-2.5 rounded-xl border border-nh-garis text-xs font-semibold text-nh-kabut hover:text-nh-putih"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {riwayat.length > 0 && (
        <div className="pt-2 border-t border-nh-garis space-y-1">
          {riwayat.slice(0, 4).map((r) => (
            <div key={r.id} className="text-[11px] text-nh-kabut-2 leading-relaxed">
              <span className="font-semibold text-nh-kabut">
                {NAMA_VERIFIKASI[r.keputusan as StatusVerifikasi] ?? r.keputusan}
              </span>{" "}
              — {r.adminName} · {new Date(r.at).toISOString().slice(0, 10)}
              {r.diperiksaDi ? ` · ${r.diperiksaDi}` : ""}
              {r.alasan ? ` · ${r.alasan}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Data({
  label,
  nilai,
  bahaya,
}: {
  label: string;
  nilai?: string | null;
  bahaya?: boolean;
}) {
  return (
    <div className="flex gap-1.5 min-w-0">
      <span className="text-nh-kabut-2 shrink-0">{label}:</span>
      {/* Juga tidak dipotong: nomor SIP yang terpotong tidak bisa
          dicocokkan, dan "46 hari l…" menyembunyikan justru bagian yang
          membuat barisnya mendesak. */}
      <span
        className={`font-mono break-all ${bahaya ? "text-nh-bahaya font-bold" : "text-nh-putih"}`}
      >
        {nilai || "—"}
      </span>
    </div>
  );
}
