"use client";

/**
 * Yang dilihat PERAWAT tentang izin praktiknya sendiri.
 *
 * Sebelum layar ini ada, nomor STR di aplikasi ini hanya teks yang diketik
 * sendiri lalu ditampilkan besar-besar dengan lencana "Terverifikasi" —
 * lencana yang tidak pernah punya dasar apa pun. Yang paling penting di
 * layar ini bukan formulirnya, melainkan kalimat paling atas: boleh atau
 * tidak Anda menerima kunjungan hari ini, dan kalau tidak, apa sebabnya.
 */

import React, { useState } from "react";
import {
  BERKAS_DIMINTA,
  NAMA_VERIFIKASI,
  NADA_VERIFIKASI,
  PERINGATAN_SIP_HARI,
  bolehMenerimaKunjungan,
  penghalangAjuVerifikasi,
  sisaHariSIP,
  type JenisBerkas,
  type StatusVerifikasi,
} from "@/logic/verifikasi";
import { tanggalIndo } from "@/logic/sesi";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Upload,
  Check,
  Loader2,
  FileText,
} from "lucide-react";

interface Props {
  perawat: any;
  berkas: any[];
  onSelesai: () => void;
}

const NADA_KELAS = {
  baik: "border-nh-sembuh/40 bg-nh-sembuh/10 text-nh-sembuh",
  tunggu: "border-nh-waspada/40 bg-nh-waspada/10 text-nh-waspada",
  buruk: "border-nh-bahaya/40 bg-nh-bahaya/10 text-nh-bahaya",
};

export function PanelVerifikasiPerawat({ perawat, berkas, onSelesai }: Props) {
  const [buka, setBuka] = useState(false);
  const [str, setStr] = useState(String(perawat?.licenseNumber ?? ""));
  const [sip, setSip] = useState(String(perawat?.sipNumber ?? ""));
  const [sampai, setSampai] = useState(String(perawat?.sipBerlakuSampai ?? ""));
  const [penerbit, setPenerbit] = useState(String(perawat?.sipDiterbitkanOleh ?? ""));
  const [unggahan, setUnggahan] = useState<Record<string, string>>({});
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  if (!perawat) return null;

  const hasil = bolehMenerimaKunjungan(perawat);
  const status = hasil.status as StatusVerifikasi;
  const nada = NADA_VERIFIKASI[status] ?? "buruk";
  const sisa = sisaHariSIP(perawat.sipBerlakuSampai);

  const bacaBerkas = (jenis: JenisBerkas, file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setGalat("Berkas maksimal 5 MB. Foto dokumennya saja sudah cukup.");
      return;
    }
    const r = new FileReader();
    r.onloadend = () => setUnggahan((u) => ({ ...u, [jenis]: String(r.result) }));
    r.readAsDataURL(file);
  };

  const daftarBerkas = Object.entries(unggahan).map(([jenis, fileUrl]) => ({
    jenis,
    fileUrl,
  }));

  /**
   * Berkas yang sudah pernah diunggah dihitung ikut memenuhi syarat.
   *
   * Kalau tidak, perawat yang hanya memperpanjang SIP-nya harus mengunggah
   * ulang KTP dan STR-nya juga setiap kali — dan yang terjadi berikutnya
   * bukan ia mengunggah semuanya, melainkan ia menunda memperbarui SIP-nya.
   */
  const sudahAda = new Set(
    (berkas ?? []).filter((b) => !b.supersededAt).map((b) => String(b.jenis))
  );
  const gabungan = [
    ...daftarBerkas,
    ...[...sudahAda]
      .filter((j) => !unggahan[j])
      .map((j) => ({ jenis: j, fileUrl: "(sudah ada)" })),
  ];

  const tolak = penghalangAjuVerifikasi({
    strNumber: str,
    sipNumber: sip,
    sipBerlakuSampai: sampai,
    berkas: gabungan,
  });

  const kirim = async () => {
    setSibuk(true);
    setGalat(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "AJUKAN_VERIFIKASI",
          strNumber: str,
          sipNumber: sip,
          sipBerlakuSampai: sampai,
          sipDiterbitkanOleh: penerbit,
          berkas: daftarBerkas,
        }),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(jawab?.error ?? "Pengajuan gagal dikirim.");
        return;
      }
      setUnggahan({});
      setBuka(false);
      onSelesai();
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="nh-panel p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-nh-putih">Izin praktik</h3>
          <p className="text-xs text-nh-kabut">STR dan SIP Anda di NuraHome Care.</p>
        </div>
        <span
          className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${NADA_KELAS[nada]}`}
        >
          {NAMA_VERIFIKASI[status] ?? status}
        </span>
      </div>

      {/* Kalimat paling penting di layar ini. */}
      <div
        className={`rounded-xl border px-3.5 py-3 flex items-start gap-2.5 ${NADA_KELAS[nada]}`}
      >
        {hasil.boleh ? (
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
        ) : (
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        )}
        <p className="text-xs text-nh-putih leading-relaxed">
          {hasil.boleh ? (
            <>
              <span className="font-bold">Anda boleh menerima kunjungan.</span>{" "}
              Diperiksa {perawat.verifiedByName ?? "admin"}
              {perawat.verifiedAt
                ? ` pada ${tanggalIndo(String(new Date(perawat.verifiedAt).toISOString()).slice(0, 10))}`
                : ""}
              {perawat.verifiedSumber ? `, dicocokkan di ${perawat.verifiedSumber}.` : "."}
            </>
          ) : (
            <>
              <span className="font-bold">Belum boleh menerima kunjungan.</span>{" "}
              {hasil.alasan}
            </>
          )}
        </p>
      </div>

      {/* Peringatan SIP mendekati habis. Muncul jauh sebelum tanggalnya,
          karena mengurus perpanjangan SIP butuh berminggu-minggu — bukan
          sesuatu yang bisa diselesaikan pada hari terakhir. */}
      {sisa != null && sisa >= 0 && sisa <= PERINGATAN_SIP_HARI && (
        <div className="rounded-xl border border-nh-waspada/40 bg-nh-waspada/10 px-3.5 py-3 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-nh-waspada shrink-0 mt-0.5" />
          <p className="text-xs text-nh-putih leading-relaxed">
            <span className="font-bold">SIP Anda habis dalam {sisa} hari</span> (
            {tanggalIndo(String(perawat.sipBerlakuSampai))}). Setelah tanggal itu
            Anda otomatis berhenti menerima kunjungan sampai SIP baru diunggah dan
            ditinjau.
          </p>
        </div>
      )}

      {perawat.verificationNote && status !== "TERVERIFIKASI" && (
        <div className="rounded-xl bg-nh-panel-2 border border-nh-garis p-3">
          <div className="text-[11px] font-bold text-nh-kabut mb-1">Catatan admin</div>
          <p className="text-xs text-nh-putih leading-relaxed whitespace-pre-wrap">
            {perawat.verificationNote}
          </p>
        </div>
      )}

      {/* ---- ringkasan yang tersimpan ---- */}
      <div className="grid sm:grid-cols-2 gap-2.5">
        <Kotak label="Nomor STR" nilai={perawat.licenseNumber} catatan="Berlaku seumur hidup" />
        <Kotak
          label="Nomor SIP / SIPP"
          nilai={perawat.sipNumber}
          catatan={
            perawat.sipBerlakuSampai
              ? `Berlaku s.d. ${tanggalIndo(String(perawat.sipBerlakuSampai))}`
              : "Masa berlaku belum diisi"
          }
        />
      </div>

      {!buka ? (
        <button onClick={() => setBuka(true)} className="nh-tombol px-4 py-2.5 text-xs">
          {status === "TERVERIFIKASI" ? "Perbarui berkas izin" : "Ajukan verifikasi"}
        </button>
      ) : (
        <div className="space-y-3 pt-1 border-t border-nh-garis">
          <Isian label="Nomor STR (angka saja)" nilai={str} set={setStr} placeholder="12045892341" />
          <Isian
            label="Nomor SIP / SIPP"
            nilai={sip}
            set={setSip}
            placeholder="503/SIPP/…/35.73.302/2026"
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-nh-kabut">
                SIP berlaku sampai
              </label>
              <input
                type="date"
                value={sampai}
                onChange={(e) => setSampai(e.target.value)}
                className="nh-isian w-full px-3 py-2.5 text-sm"
              />
            </div>
            <Isian
              label="Diterbitkan oleh"
              nilai={penerbit}
              set={setPenerbit}
              placeholder="Dinas Kesehatan Kota Malang"
            />
          </div>

          <div className="space-y-2">
            {BERKAS_DIMINTA.map((b) => {
              const punya = !!unggahan[b.jenis] || sudahAda.has(b.jenis);
              return (
                <label
                  key={b.jenis}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                    punya
                      ? "border-nh-sembuh/40 bg-nh-sembuh/5"
                      : "border-nh-garis bg-nh-panel-2 hover:border-nh-ungu/40"
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {punya ? (
                      <Check className="w-4 h-4 text-nh-sembuh" />
                    ) : (
                      <Upload className="w-4 h-4 text-nh-kabut" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-nh-putih">
                      {b.label}
                      {!b.wajib && (
                        <span className="ml-1.5 font-normal text-nh-kabut-2">
                          (tidak wajib)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-nh-kabut leading-relaxed mt-0.5">
                      {b.penjelasan}
                    </p>
                    {unggahan[b.jenis] && (
                      <p className="text-[11px] text-nh-sembuh mt-1">Berkas baru siap dikirim</p>
                    )}
                    {!unggahan[b.jenis] && sudahAda.has(b.jenis) && (
                      <p className="text-[11px] text-nh-kabut-2 mt-1">
                        Sudah ada — biarkan kosong bila tidak berubah
                      </p>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="sr-only"
                    onChange={(e) => bacaBerkas(b.jenis, e.target.files?.[0])}
                  />
                </label>
              );
            })}
          </div>

          {(galat || tolak) && (
            <p className="text-xs text-nh-bahaya leading-relaxed">{galat ?? tolak}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={kirim}
              disabled={sibuk || !!tolak}
              className="nh-tombol px-4 py-2.5 text-xs flex items-center gap-2 disabled:opacity-40"
            >
              {sibuk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Kirim untuk ditinjau admin
            </button>
            <button
              onClick={() => setBuka(false)}
              className="px-4 py-2.5 rounded-xl border border-nh-garis text-xs font-semibold text-nh-kabut hover:text-nh-putih"
            >
              Batal
            </button>
          </div>

          {/* Dikatakan sejak awal, supaya tidak ada yang mengira menekan
              "kirim" sudah membuatnya boleh bekerja. */}
          <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
            Pengajuan tidak langsung berlaku. Admin mencocokkan nomor STR dan SIP
            Anda ke sumber resmi lebih dulu, dan mencatat di mana ia mencocokkannya.
          </p>
        </div>
      )}

      {/* ---- riwayat berkas ---- */}
      {berkas?.length > 0 && (
        <div className="pt-3 border-t border-nh-garis space-y-1.5">
          <div className="text-[11px] font-bold text-nh-kabut">Riwayat berkas</div>
          {berkas.slice(0, 8).map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-[11px] text-nh-kabut-2">
              <FileText className="w-3 h-3 shrink-0" />
              <span className="font-semibold text-nh-kabut">{b.jenis}</span>
              <span className="truncate">
                {b.nomor ?? "-"}
                {b.berlakuSampai ? ` · s.d. ${b.berlakuSampai}` : ""}
              </span>
              {b.supersededAt && <span className="shrink-0 italic">diganti</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kotak({
  label,
  nilai,
  catatan,
}: {
  label: string;
  nilai?: string | null;
  catatan?: string;
}) {
  return (
    <div className="rounded-xl bg-nh-panel-2 border border-nh-garis p-3">
      <div className="text-[11px] text-nh-kabut">{label}</div>
      <div className="text-sm font-mono font-bold text-nh-putih break-all">
        {nilai || "—"}
      </div>
      {catatan && <div className="text-[11px] text-nh-kabut-2 mt-0.5">{catatan}</div>}
    </div>
  );
}

function Isian({
  label,
  nilai,
  set,
  placeholder,
}: {
  label: string;
  nilai: string;
  set: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-nh-kabut">{label}</label>
      <input
        value={nilai}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className="nh-isian w-full px-3 py-2.5 text-sm"
      />
    </div>
  );
}
