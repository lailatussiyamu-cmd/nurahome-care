"use client";

/**
 * Panel tinjauan perawat: menilai luka, menyusun bahan dan tarif, lalu
 * mengirim penawaran.
 *
 * Ini bagian yang sebelumnya tidak ada sama sekali. Dulu pesanan langsung
 * berharga dan langsung tertagih; perawat menerima kunjungan yang harga
 * bahannya sudah ditetapkan orang lain, tanpa pernah melihat lukanya.
 *
 * Dua aturan yang dipegang di sini:
 *
 * 1. Perawat tidak mulai dari halaman kosong. App sudah mengisi jasa
 *    tindakan, paket bahan bawaan layanan, dan biaya jarak dari koordinat
 *    alamat. Kalau perawat harus mengetik semuanya sendiri, harga untuk
 *    kasus yang sama akan berbeda-beda antar perawat.
 *
 * 2. Setiap angka yang menyimpang dari hitungan app WAJIB diberi alasan.
 *    Tanpa itu, "harga menyesuaikan kondisi" berubah jadi kotak hitam yang
 *    tidak bisa ditinjau siapa pun — tidak oleh pasien, tidak oleh Anda.
 */

import React, { useState } from "react";
import { rp } from "@/logic/biaya";
import {
  S,
  susunPenawaranAwal,
  KATALOG_BAHAN,
  NAMA_JENIS,
  subtotalItem,
  totalPenawaran,
  itemBerubah,
  honorDariItem,
  penghalangKirimPenawaran,
  diLuarJamKerja,
  type ItemPenawaran,
} from "@/logic/alur";
import { PORSI_PERAWAT } from "@/logic/biaya";
import { fotoSudahDihapus } from "@/logic/tugas";
import { AlertTriangle, Plus, Trash2, Send, Eye } from "lucide-react";

interface Props {
  booking: any;
  layanan: any;
  alamat: any;
  fotoIntake: any[];
  pengkajian: any;
  sesi: { providerId: number | null; nama: string | null; peran: string };
  onSelesai: () => void;
}

export function PanelTinjauan({
  booking,
  layanan,
  alamat,
  fotoIntake,
  pengkajian,
  sesi,
  onSelesai,
}: Props) {
  const [temuan, setTemuan] = useState("");
  const [tanggal, setTanggal] = useState(booking?.scheduledDate ?? "");
  const [jam, setJam] = useState(booking?.scheduledTimeSlot ?? "");
  const [fotoBesar, setFotoBesar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);

  // Penawaran bawaan dihitung SEKALI dari layanan + alamat, sebagai nilai
  // awal state, supaya isian perawat tidak tersapu bersih setiap kali
  // komponen dirender ulang. (Dulu lewat useMemo; hasilnya sama, karena
  // useState hanya memakai nilai awal pada render pertama.)
  const [item, setItem] = useState<ItemPenawaran[]>(() =>
    susunPenawaranAwal({
      layanan: layanan ?? {},
      tujuan: alamat ? { lat: alamat.latitude, lng: alamat.longitude } : null,
      diLuarJamKerja: diLuarJamKerja(booking?.scheduledTimeSlot ?? ""),
    }).map((i) => ({ ...i, originalUnitPriceIdr: i.unitPriceIdr }))
  );

  const total = totalPenawaran(item);
  const honor = honorDariItem(item);
  const berubah = itemBerubah(item);
  const halangan = penghalangKirimPenawaran(item, temuan, tanggal, jam);

  const ubah = (idx: number, ubahan: Partial<ItemPenawaran>) =>
    setItem((lama) => lama.map((x, i) => (i === idx ? { ...x, ...ubahan } : x)));

  const tambahBahan = (label: string, harga: number) =>
    setItem((lama) => [
      ...lama,
      {
        kind: "BAHAN",
        label,
        qty: 1,
        unitPriceIdr: harga,
        fromCatalog: false,
        reason: "",
      },
    ]);

  const kirim = async () => {
    if (halangan) return;
    setMengirim(true);
    setGalat(null);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "KIRIM_PENAWARAN",
          bookingId: booking.id,
          temuan,
          item,
          scheduledDate: tanggal,
          scheduledTimeSlot: jam,
        }),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(jawab?.error ?? "Penawaran gagal dikirim.");
        return;
      }
      onSelesai();
    } catch {
      setGalat("Tidak bisa menghubungi server.");
    } finally {
      setMengirim(false);
    }
  };

  const mulaiTinjau = async () => {
    setGalat(null);
    const res = await fetch("/api/platform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "MULAI_TINJAUAN",
        bookingId: booking.id,
      }),
    });
    const jawab = await res.json().catch(() => ({}));
    if (!res.ok) setGalat(jawab?.error ?? "Gagal mengambil permintaan.");
    else onSelesai();
  };

  if (!booking) return null;

  const belumDiambil =
    booking.status === S.MENUNGGU_TINJAUAN || booking.status === S.DITOLAK_PASIEN;

  return (
    <div className="nh-panel p-5 space-y-5">
      <div>
        <h3 className="text-base font-bold text-nh-putih">
          Tinjau permintaan #{booking.bookingCode}
        </h3>
        <p className="text-xs text-nh-kabut mt-0.5">
          {booking.dependentName || booking.patientName} • {booking.serviceName}
        </p>
      </div>

      {/* Alasan penolakan penawaran sebelumnya. Perawat berikutnya perlu
          tahu apa yang membuat pasien menolak — kalau tidak, ia mengulang
          penawaran yang sama dan permintaannya berputar-putar. */}
      {booking.rejectionReason && (
        <div className="flex items-start gap-2 rounded-xl border border-nh-waspada/40 bg-nh-waspada/10 px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-nh-waspada shrink-0 mt-0.5" />
          <div className="text-xs text-nh-putih leading-relaxed">
            <span className="font-bold">Penawaran sebelumnya ditolak pasien.</span>{" "}
            Alasannya: &ldquo;{booking.rejectionReason}&rdquo;
          </div>
        </div>
      )}

      {belumDiambil ? (
        <div className="space-y-3">
          <p className="text-sm text-nh-kabut leading-relaxed">
            Permintaan ini belum ada yang menangani. Ambil untuk melihat foto
            luka dan menyusun penawaran.
          </p>
          <button onClick={mulaiTinjau} className="nh-tombol px-5 py-3 text-sm">
            Ambil & mulai tinjau
          </button>
          {galat && <p className="text-xs text-nh-bahaya">{galat}</p>}
        </div>
      ) : (
        <>
          {/* ---- foto dari pasien ---- */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-nh-kabut">
              Foto dari pasien ({fotoIntake.length})
            </div>
            {fotoIntake.length === 0 ? (
              <p className="text-xs text-nh-kabut-2 leading-relaxed">
                Pasien tidak melampirkan foto. Nilai dari keterangan tertulis,
                dan sesuaikan bahan setelah melihat langsung — perubahan di
                lapangan tetap harus disetujui pasien lebih dulu.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {fotoIntake.map((f: any) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFotoBesar(f.imageUrl)}
                    className="relative h-20 rounded-xl overflow-hidden border border-nh-garis hover:border-nh-ungu"
                    aria-label="Perbesar foto luka"
                  >
                    {fotoSudahDihapus(f) ? (
                      <span className="text-[9px] text-nh-kabut-2 px-1 text-center leading-tight">Dihapus setelah masa simpan</span>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={f.imageUrl} alt="Foto luka dari pasien" className="w-full h-full object-cover" />
                    )}
                    <span className="absolute bottom-1 right-1 bg-nh-malam/80 rounded p-0.5">
                      <Eye className="w-3 h-3 text-nh-putih" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ---- keterangan keluarga ---- */}
          {pengkajian && (
            <div className="rounded-xl bg-nh-panel-2 border border-nh-garis p-3 text-xs space-y-1">
              <div className="font-bold text-nh-kabut uppercase tracking-wider">
                Keterangan keluarga
              </div>
              <div className="text-nh-putih">Lokasi: {pengkajian.woundLocation}</div>
              <div className="text-nh-kabut">Sudah berapa lama: {pengkajian.woundDuration}</div>
              <div className="text-nh-kabut">Rembesan: {pengkajian.exudateAmount}</div>
            </div>
          )}

          {/* ---- penilaian perawat ---- */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut">
              Hasil penilaian Anda
            </label>
            <textarea
              value={temuan}
              onChange={(e) => setTemuan(e.target.value)}
              rows={4}
              placeholder="Apa yang Anda lihat dari foto dan keterangannya, dan mengapa bahan yang Anda pilih sesuai untuk kondisi itu."
              className="nh-isian w-full px-3 py-2.5 text-sm leading-relaxed"
            />
            <p className="text-[11px] text-nh-kabut-2">
              Kalimat ini ikut tercetak di persetujuan tindakan yang dibaca dan
              ditandatangani pasien.
            </p>
          </div>

          {/* ---- rincian biaya ---- */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-nh-kabut">
              Rincian biaya
            </div>

            {item.map((i, idx) => {
              const diubah =
                !i.fromCatalog ||
                (i.originalUnitPriceIdr != null &&
                  i.originalUnitPriceIdr !== i.unitPriceIdr);
              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-3 space-y-2 ${
                    diubah ? "border-nh-waspada/40 bg-nh-waspada/5" : "border-nh-garis bg-nh-panel-2"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-nh-kabut-2">
                        {NAMA_JENIS[i.kind]}
                      </div>
                      <div className="text-sm text-nh-putih leading-snug">{i.label}</div>
                    </div>
                    {i.kind === "BAHAN" && (
                      <button
                        type="button"
                        onClick={() => setItem(item.filter((_, j) => j !== idx))}
                        aria-label={`Hapus ${i.label}`}
                        className="text-nh-bahaya shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-nh-kabut">Jumlah</label>
                    <input
                      type="number"
                      min={1}
                      value={i.qty}
                      onChange={(e) => ubah(idx, { qty: Math.max(1, Number(e.target.value) || 1) })}
                      className="nh-isian w-16 px-2 py-1 text-sm font-mono"
                    />
                    <label className="text-[11px] text-nh-kabut">Harga satuan</label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={i.unitPriceIdr}
                      onChange={(e) =>
                        ubah(idx, { unitPriceIdr: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="nh-isian flex-1 min-w-0 px-2 py-1 text-sm font-mono"
                    />
                    <span className="text-sm font-mono font-bold text-nh-putih shrink-0">
                      {rp(subtotalItem(i))}
                    </span>
                  </div>

                  {diubah && (
                    <div className="space-y-1">
                      {i.originalUnitPriceIdr != null &&
                        i.originalUnitPriceIdr !== i.unitPriceIdr && (
                          <div className="text-[11px] text-nh-waspada">
                            Diubah dari {rp(i.originalUnitPriceIdr)}
                          </div>
                        )}
                      <input
                        value={i.reason ?? ""}
                        onChange={(e) => ubah(idx, { reason: e.target.value })}
                        placeholder="Alasan — wajib diisi"
                        className="nh-isian w-full px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* tambah bahan dari katalog */}
            <details className="rounded-xl border border-nh-garis bg-nh-panel-2 p-3">
              <summary className="text-xs font-semibold text-nh-ungu-muda cursor-pointer flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Tambah bahan
              </summary>
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {KATALOG_BAHAN.map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => tambahBahan(b.label, b.hargaIdr)}
                    className="text-left px-2.5 py-2 rounded-lg border border-nh-garis text-xs hover:border-nh-ungu flex justify-between gap-2"
                  >
                    <span className="text-nh-putih">{b.label}</span>
                    <span className="font-mono text-nh-kabut shrink-0">{rp(b.hargaIdr)}</span>
                  </button>
                ))}
              </div>
            </details>

            <div className="flex items-baseline justify-between pt-2 border-t border-nh-garis">
              <span className="text-sm font-bold text-nh-putih">Total penawaran</span>
              <span className="text-xl font-bold font-mono text-nh-ungu-muda">{rp(total)}</span>
            </div>

            {/* Honor perawat ditampilkan sebelum penawaran dikirim, bukan
                sesudah. Orang berhak tahu berapa yang ia terima sebelum
                menyanggupi pekerjaannya. */}
            <div className="rounded-xl bg-nh-malam border border-nh-garis p-3 text-xs space-y-1">
              <div className="font-bold text-nh-kabut uppercase tracking-wider mb-1.5">
                Yang Anda terima
              </div>
              <div className="flex justify-between text-nh-kabut">
                <span>Jasa tindakan × {Math.round(PORSI_PERAWAT * 100)}%</span>
                <span className="font-mono">{rp(honor.porsiPerawat)}</span>
              </div>
              <div className="flex justify-between text-nh-kabut">
                <span>Penggantian bahan (utuh)</span>
                <span className="font-mono">{rp(honor.bahan)}</span>
              </div>
              <div className="flex justify-between text-nh-kabut">
                <span>Perjalanan (utuh)</span>
                <span className="font-mono">{rp(honor.jarak + honor.luarJam)}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-nh-garis font-bold text-nh-sembuh">
                <span>Diterima</span>
                <span className="font-mono">{rp(honor.diterima)}</span>
              </div>
              <div className="flex justify-between text-nh-kabut-2">
                <span>Potongan platform</span>
                <span className="font-mono">{rp(honor.potonganPlatform)}</span>
              </div>
            </div>
          </div>

          {/* ---- jadwal ---- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut mb-1.5">
                Tanggal kunjungan
              </label>
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="nh-isian w-full px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-nh-kabut mb-1.5">
                Jam kunjungan
              </label>
              <input
                value={jam}
                onChange={(e) => setJam(e.target.value)}
                placeholder="09:00 - 10:30 WIB"
                className="nh-isian w-full px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          {berubah.length > 0 && (
            <p className="text-[11px] text-nh-waspada leading-relaxed">
              {berubah.length} item menyimpang dari hitungan app. Alasannya ikut
              terkirim ke pasien dan tercatat di jejak audit.
            </p>
          )}

          {(halangan || galat) && (
            <div className="flex items-start gap-2 text-xs text-nh-bahaya bg-nh-bahaya/10 border border-nh-bahaya/30 rounded-xl px-3 py-2 leading-relaxed">
              <span aria-hidden="true" className="font-bold">!</span>
              <span>{galat ?? halangan}</span>
            </div>
          )}

          <button
            onClick={kirim}
            disabled={!!halangan || mengirim}
            className="nh-tombol w-full px-5 py-3.5 text-sm flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {mengirim ? "Mengirim…" : `Kirim penawaran ${rp(total)}`}
          </button>
        </>
      )}

      {/* pembesar foto */}
      {fotoBesar && (
        <div
          className="fixed inset-0 z-50 bg-nh-malam/90 flex items-center justify-center p-4"
          onClick={() => setFotoBesar(null)}
          role="presentation"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoBesar} alt="Foto luka diperbesar" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </div>
  );
}
