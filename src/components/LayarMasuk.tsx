"use client";

/**
 * Layar masuk dan daftar.
 *
 * Sampai layar ini ada, cara berpindah peran di aplikasi ini adalah tiga
 * tombol di bilah atas: Pasien / Perawat / Admin. Sekali tekan, dan siapa
 * pun melihat berkas siapa pun. Itu memang alat peragaan, tapi alat
 * peragaan yang tersambung ke basis data sungguhan dan tidak punya penjaga
 * satu pun.
 *
 * Beberapa keputusan di layar ini yang tidak kelihatan tapi terasa:
 *
 * 1. SATU kotak untuk nomor telepon MAUPUN surel. Perawat biasanya punya
 *    surel; pasien — terutama yang memesan untuk orang tuanya — sering
 *    hanya punya nomor WhatsApp. Memaksa keduanya lewat satu jenis
 *    pengenal mengunci salah satu kelompok.
 *
 * 2. Kalimat gagal SELALU sama, baik nomornya tidak terdaftar maupun
 *    sandinya salah. Kalau dibedakan, kotak ini menjadi alat memeriksa
 *    siapa saja yang memakai layanan perawatan luka.
 *
 * 3. Tidak ada tombol "ingat saya". Sesi sudah punya umurnya sendiri di
 *    server, berbeda menurut peran. Tombol yang membuat sesi hidup
 *    selamanya di ponsel yang dibawa ke rumah orang lain bukan kemudahan.
 */

import React, { useState } from "react";
import { Eye, EyeOff, Loader2, Phone, ShieldCheck, LogIn } from "lucide-react";

interface Props {
  onMasuk: () => void;
}

type Mode = "MASUK" | "DAFTAR" | "LUPA";

export function LayarMasuk({ onMasuk }: Props) {
  const [mode, setMode] = useState<Mode>("MASUK");
  const [pengenal, setPengenal] = useState("");
  const [sandi, setSandi] = useState("");
  const [nama, setNama] = useState("");
  const [telepon, setTelepon] = useState("");
  const [lihatSandi, setLihatSandi] = useState(false);
  const [tahapLupa, setTahapLupa] = useState<"MINTA" | "KODE">("MINTA");
  const [kode, setKode] = useState("");
  const [kabar, setKabar] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    setSibuk(true);
    setGalat(null);
    try {
      const isi =
        mode === "MASUK"
          ? { aksi: "MASUK", pengenal, sandi }
          : mode === "DAFTAR"
            ? { aksi: "DAFTAR", nama, telepon, sandi }
            : tahapLupa === "MINTA"
              ? { aksi: "MINTA_KODE", pengenal }
              : { aksi: "PULIHKAN_SANDI", pengenal, kode, sandiBaru: sandi };
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isi),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(jawab?.error ?? "Tidak bisa masuk. Coba lagi.");
        return;
      }
      if (mode === "LUPA") {
        if (tahapLupa === "MINTA") {
          setTahapLupa("KODE");
          setKabar(jawab?.pesan ?? null);
        } else {
          setMode("MASUK");
          setTahapLupa("MINTA");
          setKode("");
          setSandi("");
          setKabar(jawab?.pesan ?? "Kata sandi berhasil diganti. Silakan masuk.");
        }
        return;
      }
      onMasuk();
    } catch {
      setGalat("Tidak bisa menghubungi server. Periksa sambungan Anda.");
    } finally {
      setSibuk(false);
    }
  };

  const siap =
    mode === "MASUK"
      ? pengenal.trim().length >= 6 && sandi.length >= 1
      : mode === "DAFTAR"
        ? nama.trim().length >= 2 && telepon.trim().length >= 8 && sandi.length >= 8
        : tahapLupa === "MINTA"
          ? pengenal.trim().length >= 6
          : kode.trim().length === 6 && sandi.length >= 8;

  return (
    <div className="min-h-screen bg-nh-malam text-nh-putih flex flex-col">
      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm space-y-6">
          {/* ---- kepala ---- */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-nh-ungu/20 border border-nh-ungu/40 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6 text-nh-ungu-muda" />
            </div>
            <h1 className="text-xl font-extrabold">NuraHome Care</h1>
            <p className="text-xs text-nh-kabut leading-relaxed">
              Perawatan luka dan sunat di rumah — Malang, Batu, Singosari,
              Kepanjen.
            </p>
          </div>

          {/* ---- pemilih ---- */}
          <div
            role="tablist"
            className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-nh-panel-2 border border-nh-garis"
          >
            {(["MASUK", "DAFTAR"] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setGalat(null);
                  setKabar(null);
                  setTahapLupa("MINTA");
                }}
                className={`py-2.5 rounded-xl text-xs font-bold transition ${
                  mode === m || (m === "MASUK" && mode === "LUPA")
                    ? "bg-nh-ungu-tekan text-nh-putih"
                    : "text-nh-kabut hover:text-nh-putih"
                }`}
              >
                {m === "MASUK" ? "Masuk" : "Daftar baru"}
              </button>
            ))}
          </div>

          <form onSubmit={kirim} className="nh-panel p-5 space-y-4">
            {mode === "MASUK" && (
              <button
                type="button"
                onClick={() => {
                  setMode("LUPA");
                  setTahapLupa("MINTA");
                  setGalat(null);
                  setKabar(null);
                  setSandi("");
                }}
                className="w-full text-center text-[11px] text-nh-ungu-muda hover:underline"
              >
                Lupa kata sandi?
              </button>
            )}

            {mode === "LUPA" && (
              <button
                type="button"
                onClick={() => {
                  setMode("MASUK");
                  setTahapLupa("MINTA");
                  setGalat(null);
                  setKabar(null);
                  setKode("");
                  setSandi("");
                }}
                className="w-full text-center text-[11px] text-nh-kabut hover:underline"
              >
                ← Kembali ke halaman masuk
              </button>
            )}

            {mode === "DAFTAR" && (
              <div className="space-y-1.5">
                <label htmlFor="nama" className="text-xs font-semibold text-nh-kabut">
                  Nama lengkap
                </label>
                <input
                  id="nama"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  autoComplete="name"
                  className="nh-isian w-full px-3 py-2.5 text-sm"
                  placeholder="Nama sesuai KTP"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="pengenal"
                className="text-xs font-semibold text-nh-kabut"
              >
                {mode === "MASUK" ? "Nomor HP atau surel" : "Nomor HP (WhatsApp)"}
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-nh-kabut-2 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="pengenal"
                  value={mode === "MASUK" ? pengenal : telepon}
                  onChange={(e) =>
                    mode === "MASUK"
                      ? setPengenal(e.target.value)
                      : setTelepon(e.target.value)
                  }
                  inputMode={mode === "DAFTAR" ? "tel" : "text"}
                  autoComplete={mode === "MASUK" ? "username" : "tel"}
                  className="nh-isian w-full pl-9 pr-3 py-2.5 text-sm"
                  placeholder="0812-3456-7890"
                />
              </div>
              {mode === "DAFTAR" && (
                <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
                  Dipakai perawat untuk menghubungi Anda sebelum berangkat.
                </p>
              )}
            </div>

            {mode === "LUPA" && tahapLupa === "KODE" && (
              <div className="space-y-1.5">
                <label htmlFor="kode" className="text-xs font-semibold text-nh-kabut">
                  Kode dari WhatsApp
                </label>
                <input
                  id="kode"
                  value={kode}
                  onChange={(e) => setKode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6 angka"
                  className="nh-isian w-full px-3 py-2.5 text-sm font-mono tracking-[0.3em]"
                />
                <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
                  Berlaku 15 menit, sekali pakai. Jangan berikan kode ini kepada
                  siapa pun — termasuk yang mengaku dari NuraHome Care.
                </p>
              </div>
            )}

            {!(mode === "LUPA" && tahapLupa === "MINTA") && (
            <div className="space-y-1.5">
              <label htmlFor="sandi" className="text-xs font-semibold text-nh-kabut">
                {mode === "LUPA" ? "Kata sandi baru" : "Kata sandi"}
              </label>
              <div className="relative">
                <input
                  id="sandi"
                  type={lihatSandi ? "text" : "password"}
                  value={sandi}
                  onChange={(e) => setSandi(e.target.value)}
                  autoComplete={mode === "MASUK" ? "current-password" : "new-password"}
                  className="nh-isian w-full pl-3 pr-11 py-2.5 text-sm"
                  placeholder={mode === "DAFTAR" ? "Minimal 8 karakter" : "••••••••"}
                />
                {/* Tombol lihat sandi bukan hiasan: mengetik sandi di ponsel
                    sambil menahan luka orang lain adalah keadaan nyata bagi
                    aplikasi ini. */}
                <button
                  type="button"
                  onClick={() => setLihatSandi((v) => !v)}
                  aria-label={lihatSandi ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-nh-kabut hover:text-nh-putih"
                >
                  {lihatSandi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            )}

            {kabar && (
              <div className="rounded-xl border border-nh-sembuh/40 bg-nh-sembuh/10 px-3 py-2.5">
                <p className="text-xs text-nh-putih leading-relaxed">{kabar}</p>
              </div>
            )}

            {galat && (
              <div
                role="alert"
                className="rounded-xl border border-nh-bahaya/40 bg-nh-bahaya/10 px-3 py-2.5"
              >
                <p className="text-xs text-nh-putih leading-relaxed">{galat}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!siap || sibuk}
              className="nh-tombol w-full py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {sibuk ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {sibuk
                ? "Sebentar…"
                : mode === "MASUK"
                  ? "Masuk"
                  : mode === "DAFTAR"
                    ? "Buat akun"
                    : tahapLupa === "MINTA"
                      ? "Kirim kode"
                      : "Simpan kata sandi baru"}
            </button>

            {mode === "DAFTAR" && (
              /**
               * Dikatakan terang-terangan di layar pendaftaran, bukan
               * dikubur di halaman syarat: akun perawat tidak dibuat sendiri.
               */
              <p className="text-[11px] text-nh-kabut-2 leading-relaxed text-center">
                Akun ini untuk pasien dan keluarga. Perawat tidak mendaftar
                sendiri — akunnya dibuat admin setelah STR dan SIP-nya
                diperiksa.
              </p>
            )}
          </form>

          <div className="text-center text-[11px] text-nh-kabut-2 leading-relaxed">
            Keadaan gawat darurat —{" "}
            <a href="tel:119" className="text-nh-bahaya font-bold underline">
              telepon 119
            </a>
            , jangan menunggu kunjungan.
          </div>
        </div>
      </div>
    </div>
  );
}
