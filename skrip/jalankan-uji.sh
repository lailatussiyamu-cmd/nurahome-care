#!/usr/bin/env bash
#
# Satu perintah: siapkan basis data bersih, jalankan server, uji, bereskan.
#
#   npm run uji
#
# ┌──────────────────────────────────────────────────────────────────────┐
# │  BASIS DATA UJI SELALU DIBUAT ULANG DARI KOSONG.                      │
# │                                                                       │
# │  Tes yang berjalan di atas basis data bekas menghasilkan kegagalan    │
# │  yang berbeda-beda setiap dijalankan — dan yang terjadi berikutnya    │
# │  bukan tesnya diperbaiki, melainkan tesnya berhenti dipercaya.        │
# │                                                                       │
# │  Namanya nurahome_uji, dipisah dari basis data pengembangan supaya    │
# │  penghapusan di sini tidak pernah menyentuh data yang sedang dipakai. │
# └──────────────────────────────────────────────────────────────────────┘

set -euo pipefail

PORT="${UJI_PORT:-3210}"
DB="${UJI_DB:-nurahome_uji}"
INDUK="${UJI_PG:-postgresql://postgres@127.0.0.1:5432/postgres}"
BASIS_DB="$(dirname "$INDUK")"
URL="$BASIS_DB/$DB"

# Kunci Midtrans PALSU, khusus uji. Tanda tangan kabar dihitung dengan kunci
# ini di kedua sisi, jadi jalur webhook bisa diuji penuh tanpa menyentuh
# Midtrans sungguhan — dan tanpa satu rupiah pun berpindah.
export MIDTRANS_SERVER_KEY="${MIDTRANS_SERVER_KEY:-SB-Mid-server-KUNCIUJI0123456789}"
export MIDTRANS_CLIENT_KEY="${MIDTRANS_CLIENT_KEY:-SB-Mid-client-KUNCIUJI0123456789}"
export MIDTRANS_MODE=SANDBOX
export CRON_SECRET="${CRON_SECRET:-rahasia-uji-yang-cukup-panjang-32}"
export IP_HASH_SALT="${IP_HASH_SALT:-garam-uji}"
export SEED_PASSWORD="${SEED_PASSWORD:-nurahome123}"
export DATABASE_URL="$URL"
# Penyedia tiruan di localhost. Aplikasi hanya menerima penimpaan alamat ini
# di luar mode PRODUKSI — lihat basisApi() di src/server/midtrans.ts.
TIRUAN_PORT="${UJI_TIRUAN_PORT:-3211}"
export MIDTRANS_API_BASE="http://127.0.0.1:$TIRUAN_PORT"

# Penyedia model (AI) tiruan.
#
# Dinyalakan SELAMA TES supaya jalur model yang sungguhan ikut teruji —
# termasuk perilakunya ketika penyedianya mati, lambat, atau menjawab
# ngawur. Jawaban bawaannya "tidak berpendapat", jadi tes yang tidak
# mengaturnya tetap menguji jalur pencocokan kata seperti sebelumnya.
MODEL_PORT="${UJI_MODEL_PORT:-3212}"
export MODEL_TIRUAN_PORT="$MODEL_PORT"
export AI_PENYEDIA=GEMINI
export AI_API_KEY="kunci-uji-bukan-kunci-sungguhan"
export AI_API_BASE="http://127.0.0.1:$MODEL_PORT"
export UJI_MODEL_BASIS="http://127.0.0.1:$MODEL_PORT"
export UJI_BASIS="http://127.0.0.1:$PORT"
export NODE_ENV=development

PID=""
PID_TIRUAN=""
PID_MODEL=""

# Dimatikan per KELOMPOK PROSES, bukan per proses.
#
# `npx next dev` bercabang beberapa kali (npx → sh → next → next-server).
# Mematikan PID yang kita pegang hanya membunuh induknya; next-server-nya
# tetap hidup, memegang port dan kunci folder .next/dev — dan jalankan
# berikutnya ditolak Next dengan "Another next dev server is already
# running". Ini benar-benar terjadi saat menyiapkan berkas ini.
bereskan() {
  for p in "$PID" "$PID_TIRUAN" "$PID_MODEL"; do
    [ -n "$p" ] || continue
    kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap bereskan EXIT INT TERM

echo "▸ Menyiapkan basis data uji ($DB)…"
psql "$INDUK" -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null
psql "$INDUK" -q -c "CREATE DATABASE $DB" >/dev/null

echo "▸ Menjalankan migrasi…"
node skrip/migrasi.mjs

# Next 16 menolak dua server dev di folder yang sama, dan MENERUSKAN
# permintaan ke yang sudah berjalan. Akibatnya halus dan membingungkan:
# tes tetap dijawab — tapi oleh server lain, dengan variabel lingkungan
# lain, sehingga pembayaran diarahkan ke Midtrans sungguhan dan gagal.
# Ini benar-benar terjadi saat menyiapkan berkas ini; separuh tes merah
# tanpa satu pun yang rusak.
# Yang diperiksa: apakah ada next-server yang FOLDER KERJANYA folder ini.
# Percobaan pertama hanya memakai `pgrep -f next-server`, dan itu ikut
# menangkap server Next milik proyek LAIN di komputer yang sama — lalu
# menolak berjalan tanpa sebab yang bisa dimengerti.
BENTROK=""
for P in /proc/[0-9]*; do
  [ -r "$P/cmdline" ] || continue
  if tr '\0' ' ' < "$P/cmdline" 2>/dev/null | grep -q "next-server"; then
    if [ "$(readlink -f "$P/cwd" 2>/dev/null)" = "$(pwd -P)" ]; then
      BENTROK="${P#/proc/}"
      break
    fi
  fi
done

if [ -n "$BENTROK" ]; then
  echo "GAGAL: masih ada server Next yang berjalan di folder ini (PID $BENTROK)." >&2
  echo "       Hentikan dulu (Ctrl-C di jendela 'npm run dev'), lalu ulangi." >&2
  echo "       Kalau tidak yakin:  kill $BENTROK" >&2
  exit 1
fi

# Sisa kunci dari jalannya sebelumnya — milik kita sendiri, aman dibuang.
rm -rf .next/dev 2>/dev/null || true

echo "▸ Menjalankan Midtrans tiruan di port $TIRUAN_PORT…"
TIRUAN_PORT="$TIRUAN_PORT" setsid node skrip/uji/midtrans-tiruan.mjs >/tmp/uji-tiruan.log 2>&1 &
PID_TIRUAN=$!

echo "▸ Menjalankan penyedia model tiruan di port $MODEL_PORT…"
setsid node skrip/uji/model-tiruan.mjs >/tmp/uji-model.log 2>&1 &
PID_MODEL=$!

# Ditunggu sampai benar-benar menjawab, bukan `sleep 1`.
#
# Dengan sleep, aplikasi bisa menyala lebih dulu dan permintaan model
# pertama jatuh ke port yang belum ada yang mendengarkan. Yang terjadi
# kemudian bukan galat yang jelas: tes model gagal satu-dua, dan gagalnya
# tidak sama setiap kali dijalankan. Tes yang berkedip cepat berhenti
# dipercaya, lalu berhenti dibaca.
for _ in $(seq 1 30); do
  if curl -sf --noproxy '*' "http://127.0.0.1:$MODEL_PORT/_catatan" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

echo "▸ Menjalankan server di port $PORT…"
# Sengaja `next dev`, bukan build+start: yang diuji adalah perilaku API,
# dan `dev` jauh lebih cepat menyala. Perilaku endpoint-nya sama.
setsid npx next dev -p "$PORT" >/tmp/uji-server.log 2>&1 &
PID=$!

echo -n "▸ Menunggu server siap"
SIAP=0
for _ in $(seq 1 60); do
  if curl -sf --noproxy '*' "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    SIAP=1
    break
  fi
  echo -n "."
  sleep 1
done
echo

if [ "$SIAP" != "1" ]; then
  echo "GAGAL: server tidak siap dalam 60 detik." >&2
  tail -30 /tmp/uji-server.log >&2
  exit 1
fi

# Sekali panggil supaya data contoh terisi sebelum tes pertama berjalan.
curl -s --noproxy '*' "http://127.0.0.1:$PORT/api/platform" >/dev/null

echo "▸ Menjalankan tes…"
echo
set +e
node --test --test-reporter=spec "skrip/uji/*.test.mjs"
HASIL=$?
set -e

echo
if [ "$HASIL" = "0" ]; then
  echo "✓ Semua tes lulus."
else
  echo "✗ Ada tes yang gagal. Log server: /tmp/uji-server.log"
fi
exit "$HASIL"
