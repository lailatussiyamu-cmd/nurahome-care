"use client";

/**
 * Panel kerja perawat selama kunjungan: berangkat → tiba → foto sebelum →
 * kerjakan → foto sesudah → laporan singkat.
 *
 * Urutannya sengaja dipaksa. Perawat tidak bisa menandai "sudah tiba"
 * sebelum berangkat, dan tidak bisa menutup kunjungan sebelum kedua foto
 * luka ada. Bukan untuk mempersulit: foto sebelum dan sesudah adalah satu-
 * satunya bukti yang melindungi kedua pihak kalau nanti ada keluhan —
 * "sudah saya kerjakan" tanpa bukti hanyalah pernyataan sepihak, dan yang
 * paling dirugikan justru perawat yang benar-benar bekerja.
 *
 * Aturan yang sama juga diperiksa di server (aksi SIMPAN_LAPORAN), karena
 * layar bisa dilewati dan API tidak bisa.
 */

import React, { useState } from "react";
import { S } from "@/logic/alur";
import { fotoSudahDihapus } from "@/logic/tugas";
import { kecilkanGambar, penghalangBerkas } from "@/logic/gambar";
import { Camera, Navigation, MapPin, CheckCircle2, FileText, ShieldAlert, Phone } from "lucide-react";

interface Props {
  booking: any;
  foto: any[];
  sesi: { providerId: number | null; nama: string | null; peran: string };
  onSelesai: () => void;
}

type JenisFoto =
  | "ARRIVAL_CONFIRMATION"
  | "SUPPLY_VERIFICATION"
  | "WOUND_BEFORE"
  | "WOUND_AFTER";

const LABEL_FOTO: Record<JenisFoto, string> = {
  ARRIVAL_CONFIRMATION: "Bukti tiba",
  SUPPLY_VERIFICATION: "Bahan steril",
  WOUND_BEFORE: "Luka sebelum",
  WOUND_AFTER: "Luka sesudah",
};

export function PanelKunjungan({ booking, foto, sesi, onSelesai }: Props) {
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const [tindakan, setTindakan] = useState("");
  const [kondisiLuka, setKondisiLuka] = useState("");
  const [instruksi, setInstruksi] = useState("");
  const [tandaBahaya, setTandaBahaya] = useState(
    "Segera hubungi kami atau ke IGD bila: demam, nyeri makin hebat, luka berbau, atau perdarahan tidak berhenti."
  );
  const [kunjunganBerikut, setKunjunganBerikut] = useState("");
  const [bahanTerpakai, setBahanTerpakai] = useState("");

  // Minta bantuan: dibuka dulu (satu ketukan tidak langsung mengirim),
  // lalu dikirim. Jawabannya ditampilkan apa adanya.
  const [bantuanTerbuka, setBantuanTerbuka] = useState(false);
  const [catatanBantuan, setCatatanBantuan] = useState("");
  const [jawabanBantuan, setJawabanBantuan] = useState<string | null>(null);

  const mintaBantuan = async () => {
    setSibuk(true);
    setGalat(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MINTA_BANTUAN", bookingId: booking.id, catatan: catatanBantuan }),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) setGalat(jawab?.error ?? "Permintaan bantuan gagal terkirim. Telepon 112 bila Anda dalam bahaya.");
      else {
        setJawabanBantuan(jawab?.pesan ?? "Admin sudah diberi tahu.");
        setBantuanTerbuka(false);
      }
    } catch {
      setGalat("Tidak bisa menghubungi server. Telepon 112 bila Anda dalam bahaya.");
    } finally {
      setSibuk(false);
    }
  };

  const punya = (j: JenisFoto) => foto.some((f: any) => f.photoType === j);
  const perluFotoLuka = booking?.serviceCategory === "WOUND_CARE";

  const panggil = async (isi: Record<string, unknown>) => {
    setSibuk(true);
    setGalat(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          ...isi,
        }),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(jawab?.error ?? "Gagal menyimpan.");
        return false;
      }
      onSelesai();
      return true;
    } catch {
      setGalat("Tidak bisa menghubungi server.");
      return false;
    } finally {
      setSibuk(false);
    }
  };

  /**
   * Foto DIKECILKAN di ponsel perawat sebelum dikirim, sama seperti foto dari
   * pasien. Server menolak foto di atas 1,2 MB (lihat logic/gambar.ts), dan
   * foto kamera ponsel biasa 3–5 MB. Dulu foto dikirim mentah: penolakannya
   * datang di rumah pasien, dan kunjungan luka tidak bisa ditutup karena
   * kedua foto luka wajib.
   */
  const unggah = (jenis: JenisFoto) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Dikosongkan supaya foto yang sama bisa dipilih lagi setelah gagal.
    e.target.value = "";
    if (!f) return;

    const halangan = penghalangBerkas(f);
    if (halangan) {
      setGalat(halangan);
      return;
    }

    setSibuk(true);
    setGalat(null);
    let dataUrl: string;
    try {
      dataUrl = (await kecilkanGambar(f)).dataUrl;
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Foto tidak bisa diolah. Coba foto ulang.");
      setSibuk(false);
      return;
    }

    await panggil({
      action: "UPLOAD_TASK_PHOTO",
      photoType: jenis,
      imageUrl: dataUrl,
      caption: LABEL_FOTO[jenis],
    });
  };

  const halanganLaporan =
    !tindakan.trim()
      ? "Tulis dulu apa yang Anda kerjakan."
      : !instruksi.trim()
      ? "Tulis instruksi perawatan di rumah untuk keluarga."
      : perluFotoLuka && !punya("WOUND_BEFORE")
      ? "Foto luka sebelum tindakan belum diunggah."
      : perluFotoLuka && !punya("WOUND_AFTER")
      ? "Foto luka sesudah tindakan belum diunggah."
      : null;

  if (!booking) return null;

  /**
   * Fungsi biasa, bukan komponen. Sebagai komponen yang dibuat di dalam
   * render, React menganggapnya komponen BARU setiap kali panel digambar
   * ulang, lalu membongkar dan memasang ulang keempat kotak foto beserta
   * input berkasnya.
   */
  const kotakFoto = (jenis: JenisFoto, wajib: boolean) => {
    const ada = punya(jenis);
    const gambar = foto.find((f: any) => f.photoType === jenis);
    return (
      <label
        className={`relative flex flex-col items-center justify-center gap-1 h-24 rounded-xl border-2 border-dashed cursor-pointer overflow-hidden ${
          ada
            ? "border-nh-sembuh/50 bg-nh-sembuh/5"
            : wajib
            ? "border-nh-waspada/50 bg-nh-waspada/5"
            : "border-nh-garis-2"
        }`}
      >
        {ada && gambar ? (
          <>
            {!fotoSudahDihapus(gambar) && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={gambar.imageUrl} alt={LABEL_FOTO[jenis]} className="absolute inset-0 w-full h-full object-cover opacity-45" />
            )}
            <CheckCircle2 className="w-5 h-5 text-nh-sembuh relative" />
          </>
        ) : (
          <Camera className="w-5 h-5 text-nh-kabut" />
        )}
        <span className="text-[10px] font-bold text-nh-putih relative text-center px-1">
          {LABEL_FOTO[jenis]}
          {wajib && !ada && <span className="block text-nh-waspada">wajib</span>}
        </span>
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={unggah(jenis)} />
      </label>
    );
  };

  return (
    <div className="nh-panel p-5 space-y-5">
      <div>
        <h3 className="text-base font-bold text-nh-putih">
          Kunjungan #{booking.bookingCode}
        </h3>
        <p className="text-xs text-nh-kabut mt-0.5">
          {booking.dependentName || booking.patientName} • {booking.addressText}
        </p>
      </div>

      {/* ---- berangkat ---- */}
      {booking.status === S.DIBAYAR && (
        <button
          onClick={() => panggil({ action: "UPDATE_BOOKING_STATUS", status: S.PERAWAT_BERANGKAT })}
          disabled={sibuk}
          className="nh-tombol w-full px-5 py-3.5 text-sm flex items-center justify-center gap-2"
        >
          <Navigation className="w-4 h-4" /> Saya berangkat sekarang
        </button>
      )}

      {/* ---- tiba: lewat foto, bukan tombol biasa ----
          Menandai "sudah tiba" tanpa bukti apa pun mudah disalahgunakan, dan
          pasien di rumah tidak punya cara memeriksanya. Foto pintu masuk
          sekaligus memberi keluarga tanda yang bisa mereka lihat. */}
      {booking.status === S.PERAWAT_BERANGKAT && (
        <div className="space-y-2">
          <p className="text-sm text-nh-kabut leading-relaxed">
            Sudah sampai? Foto pintu masuk rumah pasien. Fotonya langsung
            muncul di layar keluarga sebagai tanda Anda tiba.
          </p>
          <label className="nh-tombol w-full px-5 py-3.5 text-sm flex items-center justify-center gap-2 cursor-pointer">
            <MapPin className="w-4 h-4" /> Foto & konfirmasi tiba
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={unggah("ARRIVAL_CONFIRMATION")} />
          </label>
        </div>
      )}

      {/* ---- mulai tindakan ---- */}
      {booking.status === S.PERAWAT_TIBA && (
        <button
          onClick={() => panggil({ action: "UPDATE_BOOKING_STATUS", status: S.DIKERJAKAN })}
          disabled={sibuk}
          className="nh-tombol w-full px-5 py-3.5 text-sm"
        >
          Mulai tindakan
        </button>
      )}

      {/* ---- foto & laporan ---- */}
      {(booking.status === S.PERAWAT_TIBA || booking.status === S.DIKERJAKAN) && (
        <>
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-nh-kabut">
              Foto bukti
            </div>
            <div className="grid grid-cols-4 gap-2">
              {kotakFoto("ARRIVAL_CONFIRMATION", false)}
              {kotakFoto("SUPPLY_VERIFICATION", false)}
              {kotakFoto("WOUND_BEFORE", perluFotoLuka)}
              {kotakFoto("WOUND_AFTER", perluFotoLuka)}
            </div>
          </div>

          {booking.status === S.DIKERJAKAN && (
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-nh-kabut flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-nh-ungu" /> Laporan tindakan
              </div>
              <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
                Ditulis untuk dibaca keluarga pasien. Pakai bahasa sehari-hari;
                catatan SOAP lengkap tetap Anda isi terpisah.
              </p>

              <div>
                <label className="block text-xs font-semibold text-nh-kabut mb-1">
                  Apa yang Anda kerjakan
                </label>
                <textarea
                  value={tindakan}
                  onChange={(e) => setTindakan(e.target.value)}
                  rows={3}
                  placeholder="Misalnya: luka dibersihkan dengan cairan steril, jaringan mati diangkat sedikit, lalu dipasang balutan foam."
                  className="nh-isian w-full px-3 py-2.5 text-sm leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-nh-kabut mb-1">
                  Keadaan luka setelah tindakan
                </label>
                <textarea
                  value={kondisiLuka}
                  onChange={(e) => setKondisiLuka(e.target.value)}
                  rows={2}
                  className="nh-isian w-full px-3 py-2.5 text-sm leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-nh-kabut mb-1">
                  Yang harus dilakukan keluarga di rumah
                </label>
                <textarea
                  value={instruksi}
                  onChange={(e) => setInstruksi(e.target.value)}
                  rows={3}
                  placeholder="Misalnya: balutan jangan kena air, kaki jangan dipakai menumpu berat, obat diminum sesuai jadwal."
                  className="nh-isian w-full px-3 py-2.5 text-sm leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-nh-kabut mb-1">
                  Tanda yang harus segera dilaporkan
                </label>
                <textarea
                  value={tandaBahaya}
                  onChange={(e) => setTandaBahaya(e.target.value)}
                  rows={2}
                  className="nh-isian w-full px-3 py-2.5 text-sm leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-nh-kabut mb-1">
                    Bahan yang terpakai
                  </label>
                  <input
                    value={bahanTerpakai}
                    onChange={(e) => setBahanTerpakai(e.target.value)}
                    className="nh-isian w-full px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-nh-kabut mb-1">
                    Saran kunjungan berikutnya
                  </label>
                  <input
                    value={kunjunganBerikut}
                    onChange={(e) => setKunjunganBerikut(e.target.value)}
                    placeholder="Misalnya: 3 hari lagi"
                    className="nh-isian w-full px-3 py-2.5 text-sm"
                  />
                </div>
              </div>

              {(halanganLaporan || galat) && (
                <div className="flex items-start gap-2 text-xs text-nh-bahaya bg-nh-bahaya/10 border border-nh-bahaya/30 rounded-xl px-3 py-2 leading-relaxed">
                  <span aria-hidden="true" className="font-bold">!</span>
                  <span>{galat ?? halanganLaporan}</span>
                </div>
              )}

              <button
                onClick={() =>
                  panggil({
                    action: "SIMPAN_LAPORAN",
                    whatWasDone: tindakan,
                    woundCondition: kondisiLuka,
                    homeInstructions: instruksi,
                    warningSigns: tandaBahaya,
                    nextVisitSuggestion: kunjunganBerikut,
                    suppliesUsed: bahanTerpakai,
                  })
                }
                disabled={!!halanganLaporan || sibuk}
                className="nh-tombol w-full px-5 py-3.5 text-sm flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {sibuk ? "Menyimpan…" : "Tanda tangani & tutup kunjungan"}
              </button>

              <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
                Laporan ini ditandatangani dengan nomor STR Anda dan tidak bisa
                diubah setelah dikirim.
              </p>
            </div>
          )}
        </>
      )}

      {/* ---- keselamatan perawat ----
          Perawat bekerja sendirian di rumah orang asing. Tombolnya selalu
          ada selama kunjungan berjalan, sengaja tidak mencolok supaya tidak
          menakuti keluarga yang ikut melihat layar. */}
      {[S.PERAWAT_BERANGKAT, S.PERAWAT_TIBA, S.DIKERJAKAN].includes(booking.status) && (
        <div className="border-t border-nh-garis pt-4 space-y-2">
          {jawabanBantuan && (
            <p className="text-xs text-nh-sembuh leading-relaxed" role="status">{jawabanBantuan}</p>
          )}
          {!bantuanTerbuka ? (
            <button
              onClick={() => setBantuanTerbuka(true)}
              className="w-full text-xs font-semibold text-nh-kabut hover:text-nh-bahaya flex items-center justify-center gap-1.5 py-2"
            >
              <ShieldAlert className="w-4 h-4" /> Saya butuh bantuan
            </button>
          ) : (
            <div className="space-y-2 rounded-xl border border-nh-bahaya/40 bg-nh-bahaya/5 p-3">
              <p className="text-xs text-nh-putih leading-relaxed">
                Admin akan langsung menerima alamat ini dan menelepon Anda. Pasien tidak diberi tahu.
              </p>
              <textarea
                value={catatanBantuan}
                onChange={(e) => setCatatanBantuan(e.target.value)}
                placeholder="Opsional: apa yang terjadi"
                rows={2}
                className="nh-isian w-full px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={mintaBantuan}
                  disabled={sibuk}
                  className="flex-1 rounded-xl bg-nh-bahaya text-white text-sm font-bold py-2.5"
                >
                  {sibuk ? "Mengirim…" : "Kirim permintaan bantuan"}
                </button>
                <a
                  href="tel:112"
                  className="rounded-xl border border-nh-bahaya text-nh-bahaya text-sm font-bold px-3 py-2.5 flex items-center gap-1"
                >
                  <Phone className="w-4 h-4" /> 112
                </a>
              </div>
              <button onClick={() => setBantuanTerbuka(false)} className="w-full text-xs text-nh-kabut py-1">
                Batal
              </button>
            </div>
          )}
        </div>
      )}

      {/* Saat DIKERJAKAN galatnya sudah tampil di kotak laporan di atas.
          Di status lain — termasuk foto tiba yang ditolak — tadinya tidak
          tampil sama sekali, dan perawat hanya melihat tidak terjadi apa-apa. */}
      {galat && booking.status !== S.DIKERJAKAN && (
        <p className="text-xs text-nh-bahaya">{galat}</p>
      )}
    </div>
  );
}
