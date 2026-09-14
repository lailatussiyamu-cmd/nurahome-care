"use client";

/**
 * Laci tanya-jawab sebelum memesan.
 *
 * Namanya dulu "AI Healthcare Triage & Service Advisor" dan kalimat
 * pembukanya "I am the NuraHome Care AI Clinical Decision-Support
 * Assistant" — dua-duanya dalam bahasa Inggris, di aplikasi yang seluruh
 * pemakainya berbahasa Indonesia, untuk sesuatu yang sama sekali bukan AI.
 *
 * Yang paling penting berubah di sini bukan bahasanya, melainkan siapa
 * yang mengaku apa. Orang memperlakukan "AI klinis" berbeda dari "alat
 * bantu memilih layanan" — dan untuk hal yang salahnya bisa berarti
 * seseorang menunggu di rumah padahal seharusnya ke IGD, selisih
 * kepercayaan itu bukan urusan pemasaran.
 */

import React, { useState } from "react";
import { rp } from "@/logic/biaya";
import { X, MessageCircleQuestion, Send, ShieldAlert, Phone } from "lucide-react";

interface AiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecommendedService: (serviceSlug: string) => void;
}

type Pesan =
  | { dari: "ORANG"; teks: string }
  | {
      dari: "ALAT";
      bahaya?: boolean;
      judul?: string;
      temuan?: { nama: string; sebab: string }[];
      tindakan?: string;
      teks?: string;
      layanan?: {
        slug: string;
        name: string;
        basePriceIdr: number | null;
        alasan: string;
      } | null;
      pertanyaan?: string[];
      sangkalan?: string;
      dibantuModel?: boolean;
      galat?: string;
    };

/**
 * Dua kalimat pembuka, dan yang menentukan bukan selera: apakah kalimat
 * yang diketik orang akan meninggalkan server NuraHome Care atau tidak.
 *
 * Diberitahukan SEBELUM ia mengetik. Memberi tahu sesudahnya bukan
 * pemberitahuan, itu pengumuman.
 */
const PEMBUKA_TANPA_MODEL: Pesan = {
  dari: "ALAT",
  teks:
    "Halo. Saya bukan dokter dan bukan AI — saya alat bantu sederhana yang mengenali kata-kata, untuk membantu Anda memilih layanan dan menyiapkan jawaban sebelum perawat datang. Ceritakan keluhannya.",
  sangkalan:
    "Kalau keadaannya terasa gawat, jangan menunggu jawaban di sini — langsung ke IGD atau telepon 119.",
};

const PEMBUKA_DENGAN_MODEL: Pesan = {
  dari: "ALAT",
  teks:
    "Halo. Saya alat bantu untuk memilih layanan dan menyiapkan pertanyaan sebelum perawat datang — bukan dokter, dan bukan pengganti pemeriksaan. Ceritakan keluhannya.",
  sangkalan:
    "Untuk memahami kalimat Anda, saya dibantu layanan AI di luar NuraHome Care. Yang dikirim ke sana hanya kalimat yang Anda ketik — tanpa nama, nomor telepon, alamat, maupun foto. Kalau keadaannya terasa gawat, jangan menunggu jawaban di sini — langsung ke IGD atau telepon 119.",
};

/** Contoh yang benar-benar ditulis orang, bukan kalimat buku teks. */
const CONTOH = [
  { label: "Luka diabetes", teks: "Luka di kaki ibu saya sudah 2 minggu tidak sembuh, beliau diabetes" },
  { label: "Sunat anak", teks: "Anak saya umur 9 tahun mau sunat di rumah" },
  { label: "Luka operasi", teks: "Habis operasi caesar, jahitannya perlu diganti balut" },
  { label: "Luka baring", teks: "Bapak stroke, berbaring lama, ada luka di bokong" },
];

export function AiAssistantDrawer({
  isOpen,
  onClose,
  onSelectRecommendedService,
}: AiAssistantDrawerProps) {
  const [ketikan, setKetikan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [riwayat, setRiwayat] = useState<Pesan[]>([PEMBUKA_TANPA_MODEL]);
  const [sudahTanyaKeadaan, setSudahTanyaKeadaan] = useState(false);

  /**
   * Keadaan sambungannya ditanyakan sekali saat laci dibuka, dan HANYA
   * mengganti kalimat pembuka selama belum ada percakapan — supaya
   * jawabannya yang datang terlambat tidak menimpa riwayat yang sudah
   * berjalan.
   */
  React.useEffect(() => {
    if (!isOpen || sudahTanyaKeadaan) return;
    setSudahTanyaKeadaan(true);
    fetch("/api/ai/assistant")
      .then((r) => r.json())
      .then((d) => {
        if (d?.pakaiModel)
          setRiwayat((r) => (r.length === 1 ? [PEMBUKA_DENGAN_MODEL] : r));
      })
      .catch(() => {});
  }, [isOpen, sudahTanyaKeadaan]);

  if (!isOpen) return null;

  async function kirim(teksLain?: string) {
    const teks = (teksLain ?? ketikan).trim();
    if (!teks || sibuk) return;

    setRiwayat((r) => [...r, { dari: "ORANG", teks }]);
    if (!teksLain) setKetikan("");
    setSibuk(true);

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "INTAKE", prompt: teks }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRiwayat((r) => [
          ...r,
          {
            dari: "ALAT",
            galat:
              d?.error ?? "Sedang tidak bisa menjawab. Anda tetap bisa memesan langsung.",
          },
        ]);
        return;
      }
      setRiwayat((r) => [...r, { dari: "ALAT", ...d }]);
    } catch {
      /**
       * Kegagalan jaringan dikatakan apa adanya. Laci yang diam saat
       * gagal membuat orang mengira tidak ada perawat yang tersedia,
       * lalu menutup aplikasinya.
       */
      setRiwayat((r) => [
        ...r,
        {
          dari: "ALAT",
          galat:
            "Tidak bisa menghubungi server. Periksa koneksi Anda, atau pesan langsung lewat halaman layanan.",
        },
      ]);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-nh-malam/50 backdrop-blur-xs">
      <div className="w-full max-w-md bg-nh-panel h-full shadow-2xl flex flex-col border-l border-nh-garis">
        {/* Kepala */}
        <div className="px-5 py-4 bg-nh-malam text-nh-putih flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-nh-ungu-tekan flex items-center justify-center">
              <MessageCircleQuestion className="w-5 h-5 text-nh-putih" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Tanya dulu sebelum memesan</h3>
              <p className="text-[11px] text-nh-ungu-muda">
                Alat bantu memilih layanan — bukan pemeriksaan medis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="p-1.5 rounded-lg text-nh-kabut-2 hover:text-nh-putih"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contoh pertanyaan */}
        <div className="p-3 bg-nh-panel-2 border-b border-nh-garis flex gap-2 overflow-x-auto shrink-0">
          {CONTOH.map((c) => (
            <button
              key={c.label}
              onClick={() => kirim(c.teks)}
              className="px-3 py-1.5 rounded-full bg-nh-panel border border-nh-garis text-[11px] font-medium text-nh-kabut hover:border-nh-ungu whitespace-nowrap"
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Percakapan */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {riwayat.map((p, i) =>
            p.dari === "ORANG" ? (
              <div key={i} className="flex justify-end">
                <div className="bg-nh-ungu-tekan text-nh-putih text-xs rounded-2xl rounded-tr-xs px-4 py-3 max-w-[85%]">
                  {p.teks}
                </div>
              </div>
            ) : (
              <div
                key={i}
                className={`rounded-2xl rounded-tl-xs p-4 space-y-3 border ${
                  p.bahaya ? "bg-rose-950/40 border-rose-500/60" : "bg-nh-panel-2 border-nh-garis"
                }`}
              >
                {p.galat && <p className="text-xs text-amber-300">{p.galat}</p>}

                {/* Tanda bahaya.
                    Tidak ada tombol pesan di sini, sengaja: kalau tombol
                    "pesan sekarang" muncul di sebelah peringatan darurat,
                    itu yang akan ditekan orang — persis yang tidak boleh
                    ia lakukan saat itu. */}
                {p.bahaya && (
                  <>
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-bold text-rose-200">{p.judul}</div>
                        <p className="text-xs text-rose-100/90 mt-1">{p.tindakan}</p>
                      </div>
                    </div>

                    {!!p.temuan?.length && (
                      <ul className="space-y-1.5 pl-1">
                        {p.temuan.map((t) => (
                          <li key={t.nama} className="text-[11px] text-rose-100/80">
                            <span className="font-bold">{t.nama}.</span> {t.sebab}
                          </li>
                        ))}
                      </ul>
                    )}

                    <a
                      href="tel:119"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-500"
                    >
                      <Phone className="w-4 h-4" /> Telepon 119
                    </a>
                  </>
                )}

                {p.teks && <p className="text-xs text-nh-putih leading-relaxed">{p.teks}</p>}

                {p.layanan && (
                  <div className="p-3 bg-nh-ungu/10 border border-nh-ungu/30 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-nh-ungu-muda">{p.layanan.name}</div>
                    {p.layanan.alasan && (
                      <p className="text-[11px] text-nh-ungu-muda/90">{p.layanan.alasan}</p>
                    )}
                    <div className="flex items-center justify-between pt-1 gap-2">
                      {/* "Mulai dari" — bukan harga akhir. Tarif sebenarnya
                          baru pasti setelah perawat menilai fotonya, dan
                          menampilkan satu angka tanpa keterangan membuat
                          penawaran yang datang kemudian terasa seperti
                          harga yang naik diam-diam. */}
                      <span className="text-xs font-bold text-nh-ungu-muda font-mono">
                        Mulai dari {rp(p.layanan.basePriceIdr ?? 0)}
                      </span>
                      <button
                        onClick={() => {
                          onSelectRecommendedService(p.layanan!.slug);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-nh-ungu-tekan text-nh-putih text-xs font-bold hover:bg-nh-ungu-tua shrink-0"
                      >
                        Lihat &amp; pesan
                      </button>
                    </div>
                  </div>
                )}

                {!!p.pertanyaan?.length && (
                  <div className="space-y-1 pt-1">
                    <div className="text-[11px] font-bold text-nh-kabut">
                      {p.layanan
                        ? "Perawat akan menanyakan ini — boleh disiapkan dulu:"
                        : "Boleh dijawab dulu supaya saya bisa membantu:"}
                    </div>
                    {p.pertanyaan.map((q) => (
                      <div key={q} className="text-[11px] text-nh-kabut">
                        • {q}
                      </div>
                    ))}
                  </div>
                )}

                {p.sangkalan && (
                  <div className="pt-2 border-t border-nh-garis/80 text-[10px] text-nh-kabut-2">
                    {p.sangkalan}
                  </div>
                )}
              </div>
            )
          )}
          {sibuk && <div className="text-xs text-nh-kabut px-2">Sebentar…</div>}
        </div>

        {/* Kotak ketik */}
        <div className="p-3 border-t border-nh-garis bg-nh-panel flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={ketikan}
            onChange={(e) => setKetikan(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && kirim()}
            placeholder="Ceritakan keluhannya…"
            aria-label="Tulis keluhan Anda"
            className="flex-1 h-11 px-3.5 rounded-xl bg-nh-latar border border-nh-garis-2 text-xs text-nh-putih placeholder:text-nh-kabut-2 focus:ring-2 focus:ring-nh-ungu focus:outline-none"
          />
          <button
            onClick={() => kirim()}
            disabled={sibuk}
            aria-label="Kirim"
            className="h-11 px-4 rounded-xl bg-nh-ungu-tekan text-nh-putih hover:bg-nh-ungu-tua transition flex items-center justify-center disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
