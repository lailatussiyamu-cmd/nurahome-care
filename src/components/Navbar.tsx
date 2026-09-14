"use client";

/**
 * Kepala halaman.
 *
 * Dua hal yang diperbaiki di sini, dua-duanya baru kelihatan setelah
 * aplikasinya benar-benar dibuka di ukuran ponsel:
 *
 * 1. Lebar. Merek, tiga tombol peran, dan dua tombol aksi dulu berjajar
 *    dalam satu baris yang tidak boleh patah. Di layar 390px isinya jadi
 *    selebar 892px — halamannya bisa digeser ke samping dan judulnya
 *    menabrak baris darurat di atasnya.
 *
 * 2. Tinggi. Seluruh kepala halaman menempel di atas layar: 173px, seperlima
 *    layar ponsel, hilang terus-menerus. Sekarang yang menempel hanya baris
 *    merek (64px). Baris darurat dan pemindah peran ikut tergulir naik —
 *    keduanya dibaca sekali, tidak perlu ikut ke mana-mana. Supaya nomor
 *    119 tetap sejangkauan, ada tombol merah kecil di baris yang menempel.
 */

import React, { useState } from "react";
import { Sparkles, Layers, PhoneCall, LogOut, User } from "lucide-react";

interface NavbarProps {
  activeRole: "PATIENT" | "PROVIDER" | "ADMIN";
  namaPemakai: string | null;
  onKeluar: () => void;
  onOpenArchitecture: () => void;
  onOpenAiAssistant: () => void;
  onOpenBookingWizard: () => void;
}

const NAMA_PERAN: Record<NavbarProps["activeRole"], string> = {
  PATIENT: "Pasien",
  PROVIDER: "Perawat",
  ADMIN: "Admin",
};

export function Navbar({
  activeRole,
  namaPemakai,
  onKeluar,
  onOpenArchitecture,
  onOpenAiAssistant,
  onOpenBookingWizard,
}: NavbarProps) {
  const [bukaAkun, setBukaAkun] = useState(false);

  /**
   * Yang dulu ada di sini: tiga tombol Pasien / Perawat / Admin yang bisa
   * ditekan siapa saja, dan seluruh isi aplikasi berganti. Sekarang peran
   * hanya ditampilkan — asalnya dari cookie sesi di server, dan tidak ada
   * satu pun cara mengubahnya dari layar.
   */
  const kartuAkun = (
    <div className="relative">
      <button
        onClick={() => setBukaAkun((v) => !v)}
        aria-expanded={bukaAkun}
        aria-haspopup="menu"
        className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-nh-panel-2 border border-nh-garis hover:border-nh-ungu/50 transition max-w-[52vw] sm:max-w-none"
      >
        <div className="w-6 h-6 shrink-0 rounded-lg bg-nh-ungu/25 border border-nh-ungu/40 flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-nh-ungu-muda" />
        </div>
        <div className="text-left min-w-0 hidden sm:block">
          <div className="text-[11px] font-bold text-nh-putih truncate max-w-[140px]">
            {namaPemakai ?? "Akun"}
          </div>
          <div className="text-[10px] text-nh-kabut-2">{NAMA_PERAN[activeRole]}</div>
        </div>
      </button>

      {bukaAkun && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setBukaAkun(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 mt-2 w-60 z-50 rounded-2xl bg-nh-panel border border-nh-garis shadow-2xl p-2"
          >
            <div className="px-3 py-2 border-b border-nh-garis mb-1">
              <div className="text-xs font-bold text-nh-putih break-words">
                {namaPemakai ?? "Akun"}
              </div>
              <div className="text-[11px] text-nh-kabut-2">
                Masuk sebagai {NAMA_PERAN[activeRole]}
              </div>
            </div>
            <button
              role="menuitem"
              onClick={() => {
                setBukaAkun(false);
                onKeluar();
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold text-nh-bahaya hover:bg-nh-bahaya/10 flex items-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" /> Keluar
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Baris darurat — tergulir naik bersama halaman.
          Nomornya tautan tel: supaya di ponsel langsung bisa ditekan; orang
          yang membutuhkan baris ini tidak sedang dalam keadaan tenang
          menyalin nomor. */}
      <div className="bg-nh-malam px-4 py-1.5 text-[11px]">
        <div className="max-w-7xl mx-auto flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="flex items-start gap-2 min-w-0">
            <a
              href="tel:119"
              className="px-2 py-0.5 rounded bg-nh-bahaya text-nh-malam font-bold shrink-0 hover:brightness-110"
            >
              DARURAT 119
            </a>
            <span className="text-nh-kabut">
              Perdarahan menyembur, demam tinggi, atau tidak sadar — telepon 119
              atau langsung ke IGD.
            </span>
          </div>
          {/* Pintasan teknis; disembunyikan di ponsel karena bukan untuk pasien. */}
          <button
            onClick={onOpenArchitecture}
            className="hidden lg:flex items-center gap-1 text-nh-ungu-muda font-semibold hover:underline shrink-0"
          >
            <Layers className="w-3.5 h-3.5" /> Arsitektur sistem & ERD
          </button>
        </div>
      </div>

      {/* Satu-satunya baris yang menempel. */}
      <header className="sticky top-0 z-40 bg-nh-panel/95 backdrop-blur-md border-b border-nh-garis">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-nh-ungu-tekan flex items-center justify-center text-white font-extrabold text-lg">
              N+
            </div>
            <div className="min-w-0">
              {/* Di layar 320–360px, "NuraHome Care" + tiga tombol tidak
                  muat dan namanya terpotong di tengah kata. Lebih baik
                  memendekkan dengan sengaja daripada terpotong. */}
              <div className="hidden min-[360px]:block font-extrabold text-[15px] sm:text-base text-nh-putih tracking-tight whitespace-nowrap">
                NuraHome<span className="hidden min-[380px]:inline"> Care</span>
              </div>
              <div className="hidden sm:block text-[11px] text-nh-kabut truncate">
                Perawatan luka & sunat di rumah — Malang
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 119 tetap sejangkauan setelah baris darurat tergulir. */}
            <a
              href="tel:119"
              aria-label="Telepon gawat darurat 119"
              className="sm:hidden w-9 h-9 rounded-xl bg-nh-bahaya/15 border border-nh-bahaya/40 text-nh-bahaya flex items-center justify-center"
            >
              <PhoneCall className="w-4 h-4" />
            </a>

            <button
              onClick={onOpenAiAssistant}
              aria-label="Tanya asisten soal luka"
              className="px-3 py-2 rounded-xl bg-nh-ungu/10 text-nh-ungu-muda border border-nh-ungu/30 text-xs font-bold hover:bg-nh-ungu/20 transition flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-nh-ungu" />
              <span className="hidden md:inline">Tanya dulu</span>
            </button>

            {/* Tombol "Pesan" hanya untuk pasien. Perawat dan admin tidak
                memesan kunjungan untuk dirinya sendiri, dan tombol yang
                tidak pernah dipakai tetap memakan lebar di layar 360px. */}
            {activeRole === "PATIENT" && (
              <button
                onClick={onOpenBookingWizard}
                className="nh-tombol px-4 py-2 text-xs whitespace-nowrap"
              >
                Pesan
              </button>
            )}

            {kartuAkun}
          </div>
        </div>
      </header>
    </>
  );
}
