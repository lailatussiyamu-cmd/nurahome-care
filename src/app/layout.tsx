import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans, Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Sora untuk judul: geometris, sedikit teknis, dan bukan wajah bawaan
// yang dipakai setiap aplikasi kesehatan.
const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
});

// Plus Jakarta Sans untuk isi. Dipilih karena bentuknya bersih dan
// gerakannya enak dibaca di layar kecil — BUKAN karena namanya. Layanan
// ini beroperasi di Malang, jadi alasan "dirancang untuk Jakarta" yang
// dulu saya pakai sudah tidak berlaku.
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

// Angka klinis dan rupiah pakai mono supaya kolomnya sejajar:
// Rp 420.000, 4,2 x 2,8 cm, skor nyeri 0-10, kode NHC-7B29K4.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "NuraHome Care | Perawatan Luka & Sirkumsisi di Rumah",
  description:
    "Perawatan luka steril standar rumah sakit, penanganan ulkus diabetik, dan sunat di rumah tanpa jarum oleh perawat bersertifikat.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="id"
      className={`${sora.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-nh-malam text-nh-putih font-sans antialiased">
        {/* Kolam cahaya dipasang sekali di sini, bukan per halaman —
            kalau tiap halaman memasang sendiri, blur-nya bertumpuk dan
            latarnya jadi terang tidak karuan. */}
        <div className="nh-aura" aria-hidden="true" />
        <div className="relative z-[1]">{children}</div>
      </body>
    </html>
  );
}
