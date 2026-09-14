/**
 * Masuk, keluar, daftar, ganti kata sandi.
 *
 * Dipisah dari /api/platform dengan sengaja: berkas ini satu-satunya yang
 * boleh menerbitkan cookie sesi, dan satu-satunya yang menyentuh kata
 * sandi. Semakin sedikit tempat yang bisa melakukan keduanya, semakin
 * sedikit yang harus diperiksa ulang setiap kali ada perubahan.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { users, providers, loginAttempts, passwordResets } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import {
  NAMA_COOKIE,
  GAGAL_MASUK,
  bacaPengenal,
  bolehDaftarSendiri,
  buatHashSandi,
  buatToken,
  kunciSampai,
  masihTerkunci,
  normalSurel,
  normalTelepon,
  periksaSandi,
  sandiCocok,
  sisaWaktuTeks,
  umurUntuk,
} from "@/logic/otentikasi";
import { sidikIp } from "@/logic/otentikasi";
import { aktorDariPermintaan, buatSesi, cabutSemuaSesi, cabutSesi } from "@/server/aktor";
import {
  BATAS_MINTA_PER_JAM,
  JAWABAN_MINTA_KODE,
  buatKode,
  kedaluwarsaKode,
  kodeCocok,
  periksaBarisKode,
  sidikKode,
} from "@/logic/pemulihan";
import { kirimPesan, pesanKodePemulihan, tujuanUntuk } from "@/server/pengirim";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* Alat bantu                                                          */
/* ------------------------------------------------------------------ */

/**
 * Garam untuk sidik jari IP.
 *
 * Tanpa garam, sidik jari IP bisa dibalik dengan mencoba keempat miliar
 * alamat IPv4 — jumlah yang habis dihitung dalam hitungan menit. Dengan
 * garam rahasia, daftar sidik jari yang bocor tidak memberitahu siapa pun
 * alamat siapa yang ada di dalamnya.
 */
const GARAM_IP = process.env.IP_HASH_SALT || process.env.CRON_SECRET || "nurahome-garam-lokal";

function ipDari(req: NextRequest): string {
  const f = req.headers.get("x-forwarded-for");
  if (f) return f.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

/** Ringkasan perangkat untuk layar "perangkat yang sedang masuk". */
function perangkatDari(req: NextRequest): string {
  const ua = req.headers.get("user-agent") ?? "";
  const sistem = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iOS/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Perangkat lain";
  const peramban = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Safari\//.test(ua)
        ? "Safari"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : "peramban";
  return `${sistem} · ${peramban}`;
}

async function catatPercobaan(identifier: string, ok: boolean, reason: string, ipHash: string) {
  try {
    await db.insert(loginAttempts).values({ identifier, ok, reason, ipHash });
  } catch {
    /* catatan gagal ditulis tidak boleh menggagalkan proses masuk */
  }
}

/**
 * Batas per alamat IP, di samping batas per akun.
 *
 * Batas per akun saja tidak menahan serangan yang membalik arahnya: satu
 * kata sandi yang sangat umum dicoba ke ribuan nomor telepon berbeda.
 * Setiap akun hanya "gagal sekali" — tidak satu pun terkunci — padahal
 * yang sedang terjadi adalah serangan.
 */
const BATAS_IP = { percobaan: 30, menit: 15 };

async function ipTerlaluSering(ipHash: string): Promise<boolean> {
  const sejak = new Date(Date.now() - BATAS_IP.menit * 60_000);
  const baris = await db
    .select()
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ipHash, ipHash), gte(loginAttempts.at, sejak)));
  return baris.filter((b) => !b.ok).length >= BATAS_IP.percobaan;
}

function pasangCookie(res: NextResponse, token: string, peran: string) {
  res.cookies.set({
    name: NAMA_COOKIE,
    value: token,
    httpOnly: true, // tidak terbaca JavaScript — satu skrip pihak ketiga tidak bisa mencurinya
    sameSite: "lax", // tidak ikut terkirim dari situs lain — menahan CSRF
    secure: process.env.NODE_ENV === "production", // hanya lewat HTTPS
    path: "/",
    maxAge: umurUntuk(peran).totalJam * 3600,
  });
}

function hapusCookie(res: NextResponse) {
  res.cookies.set({ name: NAMA_COOKIE, value: "", path: "/", maxAge: 0 });
}

/* ------------------------------------------------------------------ */
/* GET — siapa saya                                                    */
/* ------------------------------------------------------------------ */

export async function GET() {
  const a = await aktorDariPermintaan();
  if (!a.masuk)
    return NextResponse.json({ masuk: false, alasan: a.alasan, pesan: a.pesan }, { status: 200 });
  return NextResponse.json({
    masuk: true,
    peran: a.peran,
    userId: a.userId,
    providerId: a.providerId,
    nama: a.nama,
  });
}

/* ------------------------------------------------------------------ */
/* POST                                                                */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const body = await req.json().catch(() => ({}));
    const aksi = String(body?.aksi ?? "");
    const ipHash = sidikIp(ipDari(req), GARAM_IP);

    /* ---------------- MASUK ---------------- */
    if (aksi === "MASUK") {
      const pengenal = bacaPengenal(body?.pengenal ?? "");
      const sandi = String(body?.sandi ?? "");

      if (!pengenal || !sandi)
        return NextResponse.json({ error: "Isi nomor/surel dan kata sandi." }, { status: 400 });

      if (await ipTerlaluSering(ipHash)) {
        await catatPercobaan(pengenal.nilai, false, "IP_TERLALU_SERING", ipHash);
        return NextResponse.json(
          { error: "Terlalu banyak percobaan dari jaringan ini. Coba lagi beberapa menit lagi." },
          { status: 429 }
        );
      }

      const [pemakai] =
        pengenal.jenis === "SUREL"
          ? await db.select().from(users).where(eq(users.email, pengenal.nilai)).limit(1)
          : await db.select().from(users).where(eq(users.phoneNormal, pengenal.nilai)).limit(1);

      /**
       * Kalau akunnya tidak ada, kata sandinya tetap diperiksa terhadap
       * sebuah hash palsu.
       *
       * Kalau tidak, jawaban untuk nomor yang tidak terdaftar kembali
       * seketika sementara jawaban untuk nomor terdaftar butuh ~100 ms
       * (biaya scrypt). Selisih itu cukup untuk memilah nomor mana yang
       * punya akun di layanan perawatan luka — informasi kesehatan yang
       * bocor tanpa satu pun kata sandi ditebak benar.
       */
      const hashPalsu =
        "scrypt$32768$8$1$00000000000000000000000000000000$" + "0".repeat(128);
      const cocok = sandiCocok(pemakai?.passwordHash ?? hashPalsu, sandi);

      if (!pemakai) {
        await catatPercobaan(pengenal.nilai, false, "TIDAK_ADA", ipHash);
        return NextResponse.json({ error: GAGAL_MASUK }, { status: 401 });
      }

      const kunci = masihTerkunci(pemakai.lockedUntil);
      if (kunci.terkunci) {
        await catatPercobaan(pengenal.nilai, false, "TERKUNCI", ipHash);
        return NextResponse.json(
          {
            error: `Terlalu banyak percobaan. Coba lagi dalam ${sisaWaktuTeks(kunci.detik)}.`,
          },
          { status: 429 }
        );
      }

      if (pemakai.accountStatus === "NONAKTIF") {
        await catatPercobaan(pengenal.nilai, false, "NONAKTIF", ipHash);
        return NextResponse.json(
          { error: "Akun ini sedang dinonaktifkan. Hubungi admin." },
          { status: 403 }
        );
      }

      if (!pemakai.passwordHash) {
        await catatPercobaan(pengenal.nilai, false, "BELUM_ADA_SANDI", ipHash);
        return NextResponse.json(
          { error: "Akun ini belum punya kata sandi. Hubungi admin untuk mengaktifkannya." },
          { status: 403 }
        );
      }

      if (!cocok) {
        const gagal = (pemakai.failedLogins ?? 0) + 1;
        await db
          .update(users)
          .set({ failedLogins: gagal, lockedUntil: kunciSampai(gagal) })
          .where(eq(users.id, pemakai.id));
        await catatPercobaan(pengenal.nilai, false, "SANDI_SALAH", ipHash);
        return NextResponse.json({ error: GAGAL_MASUK }, { status: 401 });
      }

      /* ---- berhasil ---- */
      const [perawat] =
        pemakai.role === "PROVIDER"
          ? await db.select().from(providers).where(eq(providers.userId, pemakai.id)).limit(1)
          : [];

      const { token, sidik } = buatToken();
      await buatSesi({
        tokenHash: sidik,
        userId: pemakai.id,
        role: pemakai.role,
        providerId: perawat?.id ?? null,
        deviceLabel: perangkatDari(req),
        ipHash,
      });

      await db
        .update(users)
        .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
        .where(eq(users.id, pemakai.id));
      await catatPercobaan(pengenal.nilai, true, "OK", ipHash);

      const res = NextResponse.json({
        masuk: true,
        peran: pemakai.role,
        userId: pemakai.id,
        providerId: perawat?.id ?? null,
        nama: pemakai.name,
      });
      pasangCookie(res, token, pemakai.role);
      return res;
    }

    /* ---------------- KELUAR ---------------- */
    if (aksi === "KELUAR") {
      const a = await aktorDariPermintaan();
      if (a.sessionId) await cabutSesi(a.sessionId, "KELUAR");
      const res = NextResponse.json({ ok: true });
      hapusCookie(res);
      return res;
    }

    /* ---------------- KELUAR DARI SEMUA PERANGKAT ---------------- */
    if (aksi === "KELUAR_SEMUA") {
      const a = await aktorDariPermintaan();
      if (!a.masuk) return NextResponse.json({ error: a.pesan }, { status: 401 });
      await cabutSemuaSesi(a.userId!, "KELUAR_SEMUA");
      const res = NextResponse.json({ ok: true });
      hapusCookie(res);
      return res;
    }

    /* ---------------- DAFTAR (pasien saja) ---------------- */
    if (aksi === "DAFTAR") {
      const nama = String(body?.nama ?? "").trim();
      const telepon = normalTelepon(body?.telepon ?? "");
      const surel = normalSurel(body?.surel ?? "");
      const sandi = String(body?.sandi ?? "");

      if (nama.length < 2) return NextResponse.json({ error: "Isi nama Anda." }, { status: 400 });
      if (!telepon)
        return NextResponse.json(
          { error: "Nomor telepon belum benar. Contoh: 0812-3456-7890." },
          { status: 400 }
        );

      const cek = periksaSandi(sandi, { nama, telepon });
      if (!cek.boleh) return NextResponse.json({ error: cek.alasan }, { status: 400 });

      /**
       * Nomor yang sudah terpakai dijawab dengan kalimat yang TIDAK
       * mengatakan "nomor ini sudah terdaftar".
       *
       * Kalimat itu mengubah halaman pendaftaran menjadi alat pemeriksa:
       * siapa pun bisa memasukkan nomor orang lain dan mengetahui apakah
       * orang itu memakai layanan perawatan luka. Yang benar-benar
       * memiliki nomornya akan menerima pemberitahuan dan tahu harus
       * memakai "lupa kata sandi".
       */
      const [adaTelp] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNormal, telepon))
        .limit(1);
      if (adaTelp)
        return NextResponse.json(
          {
            error:
              "Kalau nomor ini sudah pernah dipakai mendaftar, silakan masuk atau pakai 'lupa kata sandi'.",
          },
          { status: 409 }
        );

      const surelSimpan = surel || `${telepon}@telepon.nurahome.local`;
      const [adaSurel] = await db.select().from(users).where(eq(users.email, surelSimpan)).limit(1);
      if (adaSurel)
        return NextResponse.json({ error: "Surel ini sudah dipakai." }, { status: 409 });

      const [baru] = await db
        .insert(users)
        .values({
          name: nama,
          email: surelSimpan,
          phone: String(body?.telepon ?? "").trim(),
          phoneNormal: telepon,
          role: bolehDaftarSendiri("PATIENT") ? "PATIENT" : "PATIENT",
          passwordHash: buatHashSandi(sandi),
          passwordUpdatedAt: new Date(),
          lastLoginAt: new Date(),
        })
        .returning();

      const { token, sidik } = buatToken();
      await buatSesi({
        tokenHash: sidik,
        userId: baru.id,
        role: "PATIENT",
        providerId: null,
        deviceLabel: perangkatDari(req),
        ipHash,
      });

      const res = NextResponse.json({
        masuk: true,
        peran: "PATIENT",
        userId: baru.id,
        providerId: null,
        nama: baru.name,
      });
      pasangCookie(res, token, "PATIENT");
      return res;
    }

    /* ---------------- GANTI KATA SANDI ---------------- */
    if (aksi === "GANTI_SANDI") {
      const a = await aktorDariPermintaan();
      if (!a.masuk) return NextResponse.json({ error: a.pesan }, { status: 401 });

      const lama = String(body?.sandiLama ?? "");
      const baru = String(body?.sandiBaru ?? "");
      const [pemakai] = await db.select().from(users).where(eq(users.id, a.userId!)).limit(1);
      if (!pemakai) return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });

      if (!sandiCocok(pemakai.passwordHash, lama))
        return NextResponse.json({ error: "Kata sandi lama salah." }, { status: 401 });

      const cek = periksaSandi(baru, {
        nama: pemakai.name,
        telepon: pemakai.phoneNormal,
        surel: pemakai.email,
      });
      if (!cek.boleh) return NextResponse.json({ error: cek.alasan }, { status: 400 });
      if (sandiCocok(pemakai.passwordHash, baru))
        return NextResponse.json(
          { error: "Kata sandi baru sama dengan yang lama." },
          { status: 400 }
        );

      await db
        .update(users)
        .set({ passwordHash: buatHashSandi(baru), passwordUpdatedAt: new Date() })
        .where(eq(users.id, pemakai.id));

      /**
       * Semua sesi lain dicabut, sesi yang sedang dipakai dibiarkan.
       *
       * Orang mengganti kata sandi justru karena curiga ada yang masuk ke
       * akunnya. Mengganti sandi tanpa mencabut sesi lama tidak menyelesaikan
       * apa pun — sesi penyerang tetap hidup dengan sandi lama yang sudah
       * tidak diperlukannya lagi.
       */
      await cabutSemuaSesi(pemakai.id, "SANDI_DIGANTI", a.sessionId ?? undefined);

      return NextResponse.json({ ok: true, pesan: "Kata sandi diganti. Perangkat lain dikeluarkan." });
    }


    /* ---------------- MINTA KODE PEMULIHAN ---------------- */
    if (aksi === "MINTA_KODE") {
      const pengenal = bacaPengenal(body?.pengenal ?? "");

      /**
       * Jawaban yang SAMA dikirim di setiap cabang di bawah — nomor tidak
       * terdaftar, batas permintaan habis, akun nonaktif, akun tanpa
       * nomor. Kalau dibedakan, halaman "lupa sandi" berubah menjadi alat
       * memeriksa siapa saja yang memakai layanan perawatan luka.
       */
      const jawabanSama = NextResponse.json({ ok: true, pesan: JAWABAN_MINTA_KODE });

      if (!pengenal) return jawabanSama;
      if (await ipTerlaluSering(ipHash)) return jawabanSama;

      const [pemakai] =
        pengenal.jenis === "SUREL"
          ? await db.select().from(users).where(eq(users.email, pengenal.nilai)).limit(1)
          : await db.select().from(users).where(eq(users.phoneNormal, pengenal.nilai)).limit(1);

      if (!pemakai || pemakai.accountStatus === "NONAKTIF") return jawabanSama;
      if (!pemakai.phoneNormal) return jawabanSama;

      /**
       * Batas permintaan per akun per jam.
       *
       * Tanpa ini, seseorang bisa membanjiri ponsel orang lain dengan
       * pesan — gangguan nyata bagi yang menerima — dan memperbanyak
       * peluangnya menebak kode yang hanya enam angka.
       */
      const sejam = new Date(Date.now() - 3_600_000);
      const baru = await db
        .select()
        .from(passwordResets)
        .where(and(eq(passwordResets.userId, pemakai.id), gte(passwordResets.createdAt, sejam)));
      if (baru.length >= BATAS_MINTA_PER_JAM) return jawabanSama;

      /** Kode lama dihanguskan supaya hanya ada satu kode hidup per akun. */
      for (const r of baru) {
        if (!r.usedAt) await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, r.id));
      }

      const kode = buatKode();
      await db.insert(passwordResets).values({
        userId: pemakai.id,
        codeHash: sidikKode(pemakai.id, kode),
        expiresAt: kedaluwarsaKode(),
        ipHash,
      });

      /**
       * Kodenya dikirim lewat jalur lain dan TIDAK pernah ikut di jawaban
       * HTTP ini. Kalau ikut, siapa pun yang tahu nomor telepon seseorang
       * bisa mengambil alih akunnya dalam dua permintaan — dan seluruh
       * penjagaan kata sandi jadi tidak ada gunanya.
       */
      await kirimPesan({
        saluran: "WHATSAPP",
        tujuan: tujuanUntuk(pemakai.phoneNormal),
        jenis: "KODE_PEMULIHAN",
        isi: pesanKodePemulihan(pemakai.name, kode),
      });

      await catatPercobaan(pengenal.nilai, true, "MINTA_KODE", ipHash);
      return jawabanSama;
    }

    /* ---------------- PAKAI KODE, GANTI SANDI ---------------- */
    if (aksi === "PULIHKAN_SANDI") {
      const pengenal = bacaPengenal(body?.pengenal ?? "");
      const kode = String(body?.kode ?? "").trim();
      const sandiBaru = String(body?.sandiBaru ?? "");

      const gagalUmum = NextResponse.json(
        { error: "Kode tidak cocok atau sudah tidak berlaku. Minta kode baru." },
        { status: 400 }
      );
      if (!pengenal || !kode) return gagalUmum;

      const [pemakai] =
        pengenal.jenis === "SUREL"
          ? await db.select().from(users).where(eq(users.email, pengenal.nilai)).limit(1)
          : await db.select().from(users).where(eq(users.phoneNormal, pengenal.nilai)).limit(1);
      if (!pemakai) return gagalUmum;

      const [baris] = await db
        .select()
        .from(passwordResets)
        .where(eq(passwordResets.userId, pemakai.id))
        .orderBy(desc(passwordResets.id))
        .limit(1);

      const cek = periksaBarisKode(baris);
      if (!cek.boleh) return gagalUmum;

      if (!kodeCocok(baris.codeHash, pemakai.id, kode)) {
        /**
         * Percobaan salah dihitung, dan kodenya hangus setelah beberapa
         * kali. Enam angka hanya 1 juta kemungkinan — tanpa batas ini,
         * mesin menghabiskannya dalam hitungan menit.
         */
        await db
          .update(passwordResets)
          .set({ attempts: (baris.attempts ?? 0) + 1 })
          .where(eq(passwordResets.id, baris.id));
        await catatPercobaan(pengenal.nilai, false, "KODE_SALAH", ipHash);
        return gagalUmum;
      }

      /** Sandi barunya tetap tunduk pada aturan yang sama. */
      const sah = periksaSandi(sandiBaru, {
        nama: pemakai.name,
        telepon: pemakai.phoneNormal,
        surel: pemakai.email,
      });
      if (!sah.boleh) return NextResponse.json({ error: sah.alasan }, { status: 400 });

      await db
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(eq(passwordResets.id, baris.id));

      await db
        .update(users)
        .set({
          passwordHash: buatHashSandi(sandiBaru),
          passwordUpdatedAt: new Date(),
          /** Penguncian akibat salah sandi ikut dilepas — orangnya sudah membuktikan dirinya. */
          failedLogins: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, pemakai.id));

      /**
       * SEMUA sesi dicabut, tanpa kecuali.
       *
       * Orang yang memakai jalur ini biasanya sedang curiga akunnya
       * dimasuki. Mengganti sandi tanpa mencabut sesi lama tidak
       * menyelesaikan apa pun — sesi penyerang tetap hidup.
       */
      await cabutSemuaSesi(pemakai.id, "SANDI_DIPULIHKAN");
      await catatPercobaan(pengenal.nilai, true, "SANDI_DIPULIHKAN", ipHash);

      return NextResponse.json({
        ok: true,
        pesan: "Kata sandi berhasil diganti. Semua perangkat dikeluarkan — silakan masuk lagi.",
      });
    }

    return NextResponse.json({ error: `Aksi tidak dikenal: ${aksi}` }, { status: 400 });
  } catch (e) {
    console.error("POST /api/auth error:", e);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
