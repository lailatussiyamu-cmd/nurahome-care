"use client";

/**
 * Kolom testimoni di portal pasien.
 *
 * Muncul setelah kunjungan selesai. Tiga hal yang membedakannya dari kotak
 * ulasan biasa:
 *
 * 1. **Izin tayang ditanyakan lebih dulu, bukan diasumsikan.** Pasien
 *    memilih sendiri: dengan nama, disamarkan, atau tidak ditayangkan sama
 *    sekali. Testimoni yang ditayangkan tanpa orangnya tahu adalah masalah
 *    di layanan kesehatan, bukan pemasaran yang pintar.
 *
 * 2. **Ada jalan untuk mengeluh, bukan hanya memuji.** Kotak ulasan yang
 *    hanya menampung pujian membuat orang yang kecewa pergi diam-diam —
 *    lalu bercerita di tempat yang tidak bisa Anda jawab.
 *
 * 3. **Pasien diberi tahu apa yang terjadi setelah ia menekan kirim.**
 *    Termasuk bahwa admin boleh merapikan versi tayangnya, dan bahwa
 *    tulisan aslinya tetap tersimpan utuh.
 */

import React, { useState } from "react";
import {
  ASPEK,
  NAMA_IZIN,
  PENJELASAN_IZIN,
  NAMA_TINJAUAN,
  penghalangKirim,
  bintangTeks,
  type IzinTayang,
  type StatusTinjauan,
} from "@/logic/testimoni";
import { Star, MessageSquareWarning, CheckCircle2 } from "lucide-react";

interface Props {
  booking: any;
  testimoniSaya: any | null;
  sesi: { userId: number | null; peran: string };
  onSelesai: () => void;
}

function BarisBintang({
  nilai,
  onPilih,
  label,
  tanya,
}: {
  nilai: number;
  onPilih: (n: number) => void;
  label: string;
  tanya?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-nh-putih">{label}</div>
      {tanya && <div className="text-[11px] text-nh-kabut-2 leading-relaxed">{tanya}</div>}
      <div className="flex gap-1 pt-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPilih(n)}
            aria-label={`${label}: ${n} dari 5`}
            aria-pressed={nilai === n}
            className="p-1"
          >
            <Star
              className={`w-6 h-6 ${
                n <= nilai ? "fill-nh-lampu text-nh-lampu" : "text-nh-garis-2"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function PanelTestimoni({ booking, testimoniSaya, sesi, onSelesai }: Props) {
  const [bintang, setBintang] = useState(0);
  const [aspek, setAspek] = useState<Record<string, number>>({});
  const [isi, setIsi] = useState("");
  const [izin, setIzin] = useState<IzinTayang | "">("");
  const [keluhan, setKeluhan] = useState(false);
  const [bahayaKlinis, setBahayaKlinis] = useState<boolean | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  if (!booking) return null;

  /* ---- sudah pernah mengisi: tampilkan apa yang terjadi dengannya ---- */
  if (testimoniSaya) {
    const status = (testimoniSaya.statusTinjauan ?? "BARU") as StatusTinjauan;
    return (
      <div className="rounded-xl border border-nh-garis bg-nh-panel-2 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-nh-kabut">
            Testimoni Anda
          </span>
          <span className="text-[11px] font-semibold text-nh-kabut-2">
            {NAMA_TINJAUAN[status]}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`w-4 h-4 ${
                n <= testimoniSaya.bintang ? "fill-nh-lampu text-nh-lampu" : "text-nh-garis-2"
              }`}
            />
          ))}
          <span className="ml-1 text-xs font-mono text-nh-kabut">
            {bintangTeks(testimoniSaya.bintang)}
          </span>
        </div>

        <p className="text-sm text-nh-putih leading-relaxed whitespace-pre-wrap">
          {testimoniSaya.isiAsli}
        </p>

        {/* Kalau versi tayangnya dirapikan admin, pasien BERHAK tahu — dan
            berhak melihat kedua versinya. Merapikan diam-diam adalah cara
            tercepat kehilangan kepercayaan orang. */}
        {testimoniSaya.diedit && (
          <div className="rounded-xl border border-nh-waspada/40 bg-nh-waspada/10 p-3 space-y-1.5">
            <div className="text-[11px] font-bold text-nh-waspada">
              Versi yang ditayangkan sudah dirapikan admin
            </div>
            <p className="text-xs text-nh-putih leading-relaxed whitespace-pre-wrap">
              {testimoniSaya.isiTayang}
            </p>
            {testimoniSaya.alasanEdit && (
              <p className="text-[11px] text-nh-kabut leading-relaxed">
                Alasan: {testimoniSaya.alasanEdit}
              </p>
            )}
            <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
              Tulisan asli Anda di atas tetap tersimpan utuh dan tidak bisa dihapus.
              Kalau perubahannya tidak Anda setujui, hubungi kami.
            </p>
          </div>
        )}

        {status === "TAYANG" && testimoniSaya.namaTayang && (
          <p className="text-[11px] text-nh-kabut-2">
            Tayang di halaman depan sebagai{" "}
            <span className="text-nh-putih font-semibold">{testimoniSaya.namaTayang}</span>.
          </p>
        )}

        {testimoniSaya.balasanPerawat && (
          <div className="rounded-xl bg-nh-panel border border-nh-garis p-3">
            <div className="text-[11px] font-bold text-nh-ungu-muda mb-1">
              Balasan {testimoniSaya.providerName ?? "perawat"}
            </div>
            <p className="text-xs text-nh-kabut leading-relaxed whitespace-pre-wrap">
              {testimoniSaya.balasanPerawat}
            </p>
          </div>
        )}

        {testimoniSaya.keluhan && (
          <div className="flex items-start gap-2 text-[11px] text-nh-bahaya leading-relaxed">
            <MessageSquareWarning className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Ditandai sebagai keluhan. Foto dan catatan kunjungan ini dibekukan —
              tidak akan terhapus otomatis — sampai urusannya selesai.
              {testimoniSaya.bahayaKlinis &&
                " Karena menyangkut kesehatan, perawat yang menangani sudah langsung diberi tahu."}
            </span>
          </div>
        )}

        {/* Pasien diberi tahu apakah masukannya sudah sampai ke perawatnya.
            Menulis kritik lalu tidak pernah tahu apakah dibaca orangnya
            adalah cara tercepat membuat orang berhenti menulis. */}
        <div className="text-[11px] text-nh-kabut-2 leading-relaxed pt-1 border-t border-nh-garis">
          {testimoniSaya.statusKePerawat === "DITERUSKAN"
            ? `Sudah diteruskan ke ${testimoniSaya.providerName ?? "perawat"}.`
            : "Sedang ditinjau admin sebelum diteruskan ke perawat."}
        </div>
      </div>
    );
  }

  /* ---- belum mengisi ---- */
  const halangan =
    penghalangKirim({ bintang, isi, izin }) ??
    (keluhan && bahayaKlinis === null
      ? "Jawab dulu apakah keluhan ini menyangkut keselamatan atau kondisi kesehatan."
      : null);

  const kirim = async () => {
    if (halangan) return;
    setSibuk(true);
    setGalat(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "KIRIM_TESTIMONI",
          bookingId: booking.id,
          bintang,
          ...aspek,
          isi,
          izinTayang: izin,
          keluhan,
          bahayaKlinis: bahayaKlinis === true,
        }),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(jawab?.error ?? "Testimoni gagal dikirim.");
        return;
      }
      onSelesai();
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="rounded-xl border border-nh-garis bg-nh-panel-2 p-4 space-y-4">
      <div>
        <div className="text-sm font-bold text-nh-putih">
          Bagaimana pelayanan {booking.providerName ?? "perawat"}?
        </div>
        <p className="text-xs text-nh-kabut leading-relaxed mt-0.5">
          Jawaban Anda dipakai untuk menilai perawat dan memperbaiki layanan.
          Kalau ada yang kurang, tulis apa adanya — itu justru yang paling
          berguna.
        </p>
      </div>

      <BarisBintang
        nilai={bintang}
        onPilih={setBintang}
        label="Keseluruhan pelayanan"
      />

      <div className="space-y-3 pt-1 border-t border-nh-garis">
        {ASPEK.map((a) => (
          <BarisBintang
            key={a.kunci}
            nilai={aspek[a.kunci] ?? 0}
            onPilih={(n) => setAspek((l) => ({ ...l, [a.kunci]: n }))}
            label={a.label}
            tanya={a.tanya}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-nh-putih">
          Ceritakan pengalaman Anda
        </label>
        <textarea
          value={isi}
          onChange={(e) => setIsi(e.target.value)}
          rows={4}
          placeholder="Misalnya: perawatnya sabar menjelaskan ke ibu saya, dan lukanya terasa lebih nyaman setelah diganti balut."
          className="nh-isian w-full px-3 py-2.5 text-sm leading-relaxed"
        />
      </div>

      {/* ---- keluhan ---- */}
      <div className="space-y-2">
        <label className="flex items-start gap-2.5 p-3 rounded-xl border border-nh-garis cursor-pointer">
          <input
            type="checkbox"
            checked={keluhan}
            onChange={(e) => {
              setKeluhan(e.target.checked);
              if (!e.target.checked) setBahayaKlinis(null);
            }}
            className="mt-0.5 w-4 h-4 accent-[#FB7185] shrink-0"
          />
          <span className="text-xs text-nh-kabut leading-relaxed">
            <span className="font-bold text-nh-putih">Ini keluhan, mohon ditindaklanjuti.</span>{" "}
            Admin akan menghubungi Anda. Foto dan catatan kunjungan ini kami
            bekukan supaya tidak terhapus selama urusannya belum selesai.
          </span>
        </label>

        {/* Pertanyaan lanjutan. DITANYAKAN, bukan ditebak sistem dari
            kata-kata pasien — tebakan yang meleset di sini berakibat
            keluhan soal keselamatan ikut tertahan di meja admin. */}
        {keluhan && (
          <div className="ml-3 pl-3 border-l-2 border-nh-bahaya/40 space-y-2">
            <div className="text-xs font-semibold text-nh-putih">
              Apakah keluhan ini menyangkut keselamatan atau kondisi kesehatan?
            </div>
            <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
              Misalnya lukanya jadi infeksi, perdarahan, demam setelah
              kunjungan, atau tindakan yang membuat kondisi memburuk. Kalau ya,
              perawat yang menangani langsung diberi tahu hari ini juga.
            </p>
            <div className="flex gap-2">
              {[
                { nilai: true, label: "Ya, soal kesehatan" },
                { nilai: false, label: "Bukan — soal layanan" },
              ].map((o) => (
                <button
                  key={String(o.nilai)}
                  type="button"
                  onClick={() => setBahayaKlinis(o.nilai)}
                  aria-pressed={bahayaKlinis === o.nilai}
                  className={`flex-1 px-3 py-2.5 rounded-xl border text-xs font-semibold transition ${
                    bahayaKlinis === o.nilai
                      ? o.nilai
                        ? "border-nh-bahaya bg-nh-bahaya/10 text-nh-bahaya"
                        : "border-nh-ungu bg-nh-ungu/10 text-nh-ungu-muda"
                      : "border-nh-garis text-nh-kabut"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---- izin tayang ---- */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-nh-putih">
          Boleh kami tayangkan di halaman depan?
        </div>
        <div className="space-y-1.5">
          {(Object.keys(NAMA_IZIN) as IzinTayang[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setIzin(k)}
              aria-pressed={izin === k}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition ${
                izin === k
                  ? "border-nh-ungu bg-nh-ungu/10"
                  : "border-nh-garis hover:border-nh-garis-2"
              }`}
            >
              <div className="text-xs font-semibold text-nh-putih">{NAMA_IZIN[k]}</div>
              <div className="text-[11px] text-nh-kabut-2 leading-relaxed mt-0.5">
                {PENJELASAN_IZIN[k]}
              </div>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
          Admin boleh memotong atau membetulkan ketikan sebelum menayangkan,
          tapi tulisan asli Anda tetap tersimpan utuh dan bisa Anda lihat di
          sini. Bintang yang Anda beri tidak bisa diubah siapa pun.
        </p>
      </div>

      {(halangan || galat) && (
        <div className="flex items-start gap-2 text-xs text-nh-bahaya bg-nh-bahaya/10 border border-nh-bahaya/30 rounded-xl px-3 py-2 leading-relaxed">
          <span aria-hidden="true" className="font-bold">!</span>
          <span>{galat ?? halangan}</span>
        </div>
      )}

      <button
        onClick={kirim}
        disabled={!!halangan || sibuk}
        className="nh-tombol w-full px-5 py-3.5 text-sm flex items-center justify-center gap-2"
      >
        <CheckCircle2 className="w-4 h-4" />
        {sibuk ? "Mengirim…" : "Kirim testimoni"}
      </button>
    </div>
  );
}
