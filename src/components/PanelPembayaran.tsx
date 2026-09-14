"use client";

/**
 * Pembayaran setelah persetujuan.
 *
 * Diputuskan 7 September 2026: pasien membayar setelah menyetujui penawaran,
 * sebelum perawat berangkat. Perawat membawa bahan habis pakai yang dibeli
 * lebih dulu; kalau pembayaran baru terjadi setelah tindakan, dialah yang
 * menanggung risiko bahannya sudah terpakai tapi tidak terbayar.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  YANG BERUBAH 8 September 2026:                                       │
 * │                                                                       │
 * │  Layar ini dulu memanggil aksi "BAYAR", dan aksi itu langsung         │
 * │  menandai pemesanan LUNAS. Yang menyatakan uang sudah berpindah       │
 * │  adalah browser pasien.                                               │
 * │                                                                       │
 * │  Sekarang layar ini hanya bisa MEMBUKA halaman pembayaran Midtrans.   │
 * │  Nominalnya tidak dikirim dari sini — server menghitungnya ulang      │
 * │  dari rincian yang sudah disetujui. Dan setelah pasien membayar,      │
 * │  layar ini TIDAK menandai apa pun; ia menunggu, karena yang           │
 * │  menyatakan lunas hanya kabar dari Midtrans ke server.                │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Satu hal yang sengaja tidak disembunyikan: kalau pembayarannya belum
 * tercatat beberapa detik setelah pasien menutup jendela Midtrans, layar
 * mengatakan apa adanya bahwa pencatatannya kadang terlambat sebentar —
 * bukan menampilkan "gagal". Pasien yang uangnya sudah keluar lalu membaca
 * "gagal" akan membayar dua kali.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { rp } from "@/logic/biaya";
import { tanggalIndo } from "@/logic/sesi";
import { ShieldCheck, Calendar, Loader2, Clock, AlertTriangle } from "lucide-react";

interface Props {
  booking: any;
  sesi: { userId: number | null; peran: string };
  onSelesai: () => void;
}

type Tahap = "SIAP" | "MEMBUKA" | "MENUNGGU_KABAR" | "GAGAL";

export function PanelPembayaran({ booking, onSelesai }: Props) {
  const [tahap, setTahap] = useState<Tahap>("SIAP");
  const [galat, setGalat] = useState<string | null>(null);
  const [penyedia, setPenyedia] = useState<{
    siap: boolean;
    alasan: string;
    clientKey: string | null;
    snapJs: string;
  } | null>(null);
  const hitungRef = useRef<number>(0);

  useEffect(() => {
    let hidup = true;
    fetch("/api/pembayaran")
      .then((r) => r.json())
      .then((j) => hidup && setPenyedia(j))
      .catch(
        () =>
          hidup &&
          setPenyedia({
            siap: false,
            alasan: "Tidak bisa menghubungi server.",
            clientKey: null,
            snapJs: "",
          })
      );
    return () => {
      hidup = false;
    };
  }, []);

  /** Memuat snap.js sekali, dari alamat yang diberikan server (sandbox vs produksi). */
  const muatSnap = useCallback(async (snapJs: string, kunci: string) => {
    if ((window as any).snap) return true;
    return new Promise<boolean>((selesai) => {
      const s = document.createElement("script");
      s.src = snapJs;
      s.setAttribute("data-client-key", kunci);
      s.onload = () => selesai(true);
      s.onerror = () => selesai(false);
      document.body.appendChild(s);
    });
  }, []);

  /**
   * Menunggu kabar Midtrans sampai ke server.
   *
   * Kabarnya jalan server-ke-server dan biasanya sampai dalam hitungan
   * detik, tapi tidak dijamin seketika. Layar bertanya berkala ke server —
   * bukan menandai lunas sendiri.
   */
  const tungguKabar = useCallback(() => {
    setTahap("MENUNGGU_KABAR");
    hitungRef.current = 0;
    const jam = setInterval(() => {
      hitungRef.current += 1;
      onSelesai();
      if (hitungRef.current >= 20) {
        clearInterval(jam);
        setTahap("SIAP");
      }
    }, 3000);
  }, [onSelesai]);

  const mulaiBayar = async () => {
    setGalat(null);
    setTahap("MEMBUKA");
    try {
      const res = await fetch("/api/pembayaran", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      const jawab = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(jawab?.error ?? "Halaman pembayaran belum bisa dibuka.");
        setTahap("GAGAL");
        return;
      }

      const ok =
        penyedia?.snapJs && penyedia?.clientKey
          ? await muatSnap(penyedia.snapJs, penyedia.clientKey)
          : false;

      if (!ok || !(window as any).snap) {
        /**
         * Kalau snap.js tidak bisa dimuat, pasien tetap punya jalan:
         * tautan pembayaran dari Midtrans dibuka di tab baru. Tanpa
         * cadangan ini, satu pemblokir iklan yang terlalu galak membuat
         * pasien tidak bisa membayar sama sekali.
         */
        if (jawab.redirectUrl) {
          window.open(jawab.redirectUrl, "_blank", "noopener");
          tungguKabar();
          return;
        }
        setGalat("Halaman pembayaran tidak bisa dimuat. Coba lagi atau hubungi kami.");
        setTahap("GAGAL");
        return;
      }

      (window as any).snap.pay(jawab.token, {
        onSuccess: tungguKabar,
        onPending: tungguKabar,
        onError: () => {
          setGalat("Pembayaran tidak berhasil diproses. Tidak ada yang tertagih.");
          setTahap("GAGAL");
        },
        /**
         * Menutup jendela BUKAN berarti batal — pasien bisa saja sudah
         * menyelesaikan transfernya di aplikasi banknya lalu menutup
         * jendela ini. Jadi tetap menunggu kabar.
         */
        onClose: tungguKabar,
      });
    } catch {
      setGalat("Tidak bisa menghubungi server.");
      setTahap("GAGAL");
    }
  };

  if (!booking) return null;

  const belumSiap = penyedia && !penyedia.siap;

  return (
    <div className="nh-panel p-5 space-y-4">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-nh-ungu-muda">
          Menunggu pembayaran
        </div>
        <h3 className="text-base font-bold text-nh-putih mt-0.5">
          Sudah Anda setujui — tinggal dibayar
        </h3>
      </div>

      <div className="rounded-xl bg-nh-panel-2 border border-nh-garis p-3.5 space-y-2">
        <div className="flex items-start gap-2 text-sm">
          <ShieldCheck className="w-4 h-4 text-nh-sembuh shrink-0 mt-0.5" />
          <span className="text-nh-kabut leading-relaxed">
            Persetujuan tindakan Anda tersimpan atas nama{" "}
            <span className="text-nh-putih font-semibold">
              {booking.approvedByName ?? "-"}
            </span>
            .
          </span>
        </div>
        <div className="flex items-start gap-2 text-sm">
          <Calendar className="w-4 h-4 text-nh-ungu shrink-0 mt-0.5" />
          <span className="text-nh-kabut">
            {tanggalIndo(booking.scheduledDate)} • {booking.scheduledTimeSlot}
          </span>
        </div>
      </div>

      {/* Ditumpuk, bukan berjajar.
          Berjajar, di layar 390px "Rp 460.000" patah menjadi dua baris di
          tengah angkanya ("Rp" di atas, "460.000" di bawah) dan menabrak
          labelnya. Angka yang akan dibayar orang tidak boleh tampil
          setengah patah. Ketahuan dari tangkapan layar, bukan dari kode. */}
      <div className="rounded-xl bg-nh-panel-2 border border-nh-garis p-3.5">
        <div className="text-xs font-semibold text-nh-kabut">Jumlah yang dibayar</div>
        <div className="text-2xl font-bold font-mono text-nh-ungu-muda mt-0.5 whitespace-nowrap">
          {rp(booking.totalPriceIdr)}
        </div>
      </div>

      {/* Cara bayar TIDAK dipilih di sini lagi.
          Dulu ada empat tombol (QRIS / VA BCA / VA Mandiri / GoPay) yang
          tidak berpengaruh apa pun — hanya teks yang disimpan. Yang
          sebenarnya menentukan pilihan adalah halaman Midtrans, dan
          daftarnya di sana selalu sesuai dengan yang benar-benar aktif di
          akun. Dua daftar yang bisa berbeda lebih buruk daripada satu. */}
      <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
        Pilihan pembayaran — QRIS, transfer virtual account, GoPay,
        ShopeePay — muncul di halaman berikutnya.
      </p>

      {belumSiap && (
        <div className="rounded-xl border border-nh-waspada/40 bg-nh-waspada/10 px-3.5 py-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-nh-waspada shrink-0 mt-0.5" />
          <div className="text-xs text-nh-putih leading-relaxed">
            <span className="font-bold">Pembayaran online belum tersambung.</span>{" "}
            Silakan hubungi kami untuk cara pembayaran lain — jadwal Anda tetap
            kami tahan.
            <div className="text-[11px] text-nh-kabut-2 mt-1">{penyedia?.alasan}</div>
          </div>
        </div>
      )}

      {tahap === "MENUNGGU_KABAR" && (
        <div className="rounded-xl border border-nh-ungu/40 bg-nh-ungu/10 px-3.5 py-3 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-nh-ungu-muda shrink-0 mt-0.5 animate-pulse" />
          <p className="text-xs text-nh-putih leading-relaxed">
            <span className="font-bold">Menunggu konfirmasi bank.</span> Kalau Anda
            sudah membayar, biarkan halaman ini terbuka sebentar — pencatatannya
            kadang terlambat beberapa detik.{" "}
            <span className="text-nh-kabut">Jangan membayar dua kali.</span>
          </p>
        </div>
      )}

      {galat && (
        <div className="flex items-start gap-2 text-xs text-nh-bahaya bg-nh-bahaya/10 border border-nh-bahaya/30 rounded-xl px-3 py-2 leading-relaxed">
          <span aria-hidden="true" className="font-bold">
            !
          </span>
          <span>{galat}</span>
        </div>
      )}

      <button
        onClick={mulaiBayar}
        disabled={tahap === "MEMBUKA" || tahap === "MENUNGGU_KABAR" || !!belumSiap || !penyedia}
        className="nh-tombol w-full px-5 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {tahap === "MEMBUKA" || tahap === "MENUNGGU_KABAR" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : null}
        {tahap === "MEMBUKA"
          ? "Membuka halaman pembayaran…"
          : tahap === "MENUNGGU_KABAR"
            ? "Menunggu konfirmasi…"
            : `Bayar ${rp(booking.totalPriceIdr)}`}
      </button>

      <p className="text-[11px] text-nh-kabut-2 leading-relaxed">
        Pembayaran diproses Midtrans. Kunjungan ditandai lunas hanya setelah
        bank mengabari kami — bukan dari perangkat Anda.
      </p>
    </div>
  );
}
