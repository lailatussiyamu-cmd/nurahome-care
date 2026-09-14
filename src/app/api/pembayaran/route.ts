/**
 * Memulai pembayaran.
 *
 * Perhatikan apa yang TIDAK diterima dari browser: nominal. Browser hanya
 * menyebutkan pemesanan mana yang mau dibayar; berapa yang harus dibayar
 * dihitung ulang di sini dari `quote_items` yang sudah disetujui pasien.
 *
 * Kalau nominal boleh datang dari browser, ia akan datang sebagai Rp1.000.
 *
 * Yang dikembalikan hanyalah token Snap — izin untuk membuka halaman
 * pembayaran. Token itu tidak menandai apa pun sebagai lunas. Yang
 * menandai lunas hanya kabar dari Midtrans, di berkas kabar/route.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, consents, quoteItems, payments, auditLogs, users } from "@/db/schema";
import { aktorDariPermintaan, pesananMilikPasien } from "@/server/aktor";
import { S, bolehPindah } from "@/logic/alur";
import {
  kedaluwarsaBayar,
  nomorPesanan,
  rupiahBulat,
  totalTagihan,
} from "@/logic/pembayaran";
import { buatTransaksi, clientKey, alamatSnapJs, midtransSiap } from "@/server/midtrans";
import { rp } from "@/logic/biaya";

export const dynamic = "force-dynamic";

/** Kunci publik untuk layar. Client key memang dirancang untuk terbuka. */
export async function GET() {
  const siap = midtransSiap();
  return NextResponse.json({
    siap: siap.siap,
    alasan: siap.alasan,
    clientKey: siap.siap ? clientKey() : null,
    snapJs: alamatSnapJs(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const aktor = await aktorDariPermintaan();
    if (!aktor.masuk) return NextResponse.json({ error: aktor.pesan }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const bookingId = Number(body?.bookingId);

    const [pesanan] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    if (!pesanan)
      return NextResponse.json({ error: "Pemesanan tidak ditemukan." }, { status: 404 });

    if (aktor.peran !== "ADMIN" && !pesananMilikPasien(aktor, pesanan))
      return NextResponse.json({ error: "Pemesanan ini bukan milik Anda." }, { status: 403 });

    /**
     * "Sudah dibayar" diperiksa SEBELUM aturan urutan alur.
     *
     * Kalau tidak, pasien yang menekan Bayar untuk kunjungan yang sudah
     * lunas menerima kalimat "Status tidak berubah." — benar secara mesin,
     * tapi tidak memberitahu apa pun. Yang perlu dia dengar adalah bahwa
     * uangnya sudah masuk, supaya ia tidak membayar lagi.
     */
    if (pesanan.paymentStatus === "LUNAS")
      return NextResponse.json(
        { error: "Kunjungan ini sudah dibayar. Tidak perlu membayar lagi." },
        { status: 409 }
      );

    /**
     * Urutan alur tetap dijaga di sini juga.
     *
     * Pembayaran hanya boleh dimulai dari keadaan DISETUJUI. Tanpa
     * pemeriksaan ini, pasien bisa membayar permintaan yang belum ditinjau
     * siapa pun — dan uang yang masuk untuk kunjungan yang tarifnya belum
     * pernah dihitung lebih merepotkan daripada uang yang belum masuk.
     */
    const izin = bolehPindah(pesanan.status, S.DIBAYAR, aktor.peran);
    if (!izin.boleh) return NextResponse.json({ error: izin.alasan }, { status: 409 });

    /** Tidak ada pembayaran tanpa persetujuan tindakan yang tersimpan. */
    const adaConsent = await db.select().from(consents).where(eq(consents.bookingId, pesanan.id));
    if (!adaConsent.length)
      return NextResponse.json(
        { error: "Persetujuan tindakan belum tercatat untuk pemesanan ini." },
        { status: 409 }
      );

    /* ---- nominal: dihitung ulang di server ---- */
    const item = await db.select().from(quoteItems).where(eq(quoteItems.bookingId, pesanan.id));
    if (!item.length)
      return NextResponse.json({ error: "Rincian biaya belum ada." }, { status: 409 });

    const nominal = rupiahBulat(totalTagihan(item as any));
    if (nominal <= 0)
      return NextResponse.json({ error: "Total tagihan masih nol." }, { status: 409 });

    /**
     * Kalau total yang baru dihitung berbeda dari yang tersimpan di
     * pemesanan, sesuatu berubah setelah pasien menyetujui — dan yang
     * mengikat adalah angka yang dia setujui.
     *
     * Ini ditahan, bukan diperbaiki diam-diam. Menagih angka yang berbeda
     * dari yang tertulis di persetujuan adalah persoalan kesepakatan,
     * bukan persoalan pembulatan.
     */
    if (rupiahBulat(pesanan.totalPriceIdr) !== nominal)
      return NextResponse.json(
        {
          error: `Rincian biaya berubah setelah Anda menyetujui (tercatat ${rp(
            pesanan.totalPriceIdr
          )}, dihitung ${rp(nominal)}). Hubungi kami sebelum membayar.`,
        },
        { status: 409 }
      );

    /* ---- percobaan yang masih hidup dipakai ulang ---- */
    const sebelumnya = await db
      .select()
      .from(payments)
      .where(eq(payments.bookingId, pesanan.id))
      .orderBy(desc(payments.attempt));

    const sudahLunas = sebelumnya.find((p) => p.status === "LUNAS");
    if (sudahLunas)
      return NextResponse.json({ error: "Pemesanan ini sudah dibayar." }, { status: 409 });

    /**
     * Kalau pasien menekan "Bayar" dua kali, jangan membuat dua tagihan.
     *
     * Dua tagihan hidup untuk satu kunjungan berarti ada kemungkinan
     * keduanya dibayar — dan mengembalikan uang jauh lebih merepotkan
     * daripada mencegahnya di sini.
     */
    const masihHidup = sebelumnya.find(
      (p) =>
        p.status === "MENUNGGU" &&
        p.snapToken &&
        p.expiresAt &&
        new Date(p.expiresAt) > new Date() &&
        p.amountIdr === nominal
    );
    if (masihHidup)
      return NextResponse.json({
        success: true,
        token: masihHidup.snapToken,
        redirectUrl: masihHidup.redirectUrl,
        orderId: masihHidup.orderId,
        nominal,
        dipakaiUlang: true,
      });

    const percobaan = (sebelumnya[0]?.attempt ?? 0) + 1;
    const orderId = nomorPesanan(pesanan.bookingCode, percobaan);
    const kedaluwarsa = kedaluwarsaBayar();

    const [pasien] = await db.select().from(users).where(eq(users.id, pesanan.patientId));

    const hasil = await buatTransaksi({
      orderId,
      nominal,
      kedaluwarsa,
      pelanggan: {
        nama: pesanan.patientName,
        telepon: pasien?.phone ?? null,
        /**
         * Surel bawaan `62812…@telepon.nurahome.local` untuk pasien yang
         * mendaftar hanya dengan nomor HP tidak dikirim ke Midtrans —
         * alamat itu tidak bisa menerima apa pun, dan tanda terima yang
         * dikirim ke sana hilang tanpa jejak.
         */
        surel: pasien?.email?.endsWith("@telepon.nurahome.local") ? null : pasien?.email,
      },
      item: item.map((i: any, n: number) => ({
        id: String(i.id ?? n),
        price: rupiahBulat(i.unitPriceIdr),
        quantity: Number(i.qty) || 1,
        name: String(i.label ?? "Item"),
      })),
    });

    if (!hasil.ok) {
      await db.insert(auditLogs).values({
        userId: aktor.userId,
        userRole: aktor.peran,
        action: "PEMBAYARAN_GAGAL_DIBUAT",
        resourceType: "bookings",
        resourceId: pesanan.bookingCode,
        details: `Tidak bisa membuat tagihan: ${hasil.galat}`,
      });
      return NextResponse.json(
        {
          error:
            "Halaman pembayaran belum bisa dibuka. Ini gangguan di sisi kami — tidak ada yang tertagih. Coba lagi sebentar lagi.",
          rinci: hasil.galat,
        },
        { status: 502 }
      );
    }

    await db.insert(payments).values({
      bookingId: pesanan.id,
      orderId,
      attempt: percobaan,
      provider: "MIDTRANS",
      amountIdr: nominal,
      status: "MENUNGGU",
      snapToken: hasil.token,
      redirectUrl: hasil.redirectUrl,
      expiresAt: kedaluwarsa,
    });

    await db.insert(auditLogs).values({
      userId: aktor.userId,
      userRole: aktor.peran,
      action: "PEMBAYARAN_DIMULAI",
      resourceType: "bookings",
      resourceId: pesanan.bookingCode,
      details: `Tagihan ${rp(nominal)} dibuat (${orderId}). Belum lunas — menunggu kabar dari Midtrans.`,
    });

    return NextResponse.json({
      success: true,
      token: hasil.token,
      redirectUrl: hasil.redirectUrl,
      orderId,
      nominal,
    });
  } catch (e) {
    console.error("POST /api/pembayaran error:", e);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
