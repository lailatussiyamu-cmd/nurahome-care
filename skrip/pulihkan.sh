#!/usr/bin/env bash
#
# Memulihkan cadangan NuraHome Care.
#
# Skrip ini dipakai pada hari terburuk, oleh orang yang sedang panik dan
# mungkin bukan orang yang menulisnya. Karena itu:
#   - tujuan pemulihan HARUS disebutkan sendiri, tidak ada nilai bawaan;
#   - kalau basis data tujuannya sudah berisi, skrip berhenti dan meminta
#     kata "TIMPA" diketik lengkap;
#   - setiap langkah dicetak, supaya kalau berhenti di tengah, jelas di
#     mana berhentinya.
#
# Pakai:
#   RESTORE_URL=postgresql://... BACKUP_PASSPHRASE=... \
#     ./skrip/pulihkan.sh /var/backups/nurahome/harian/nurahome-....dump.gpg
#
# LATIHAN memulihkan wajib dilakukan berkala ke basis data KOSONG —
# lihat CADANGAN.md §Latihan. Cadangan yang belum pernah dipulihkan
# belum diketahui bisa dipulihkan.

set -euo pipefail

BERKAS="${1:-}"
if [ -z "$BERKAS" ] || [ ! -f "$BERKAS" ]; then
  echo "Pakai: $0 <berkas-cadangan.dump.gpg>" >&2
  exit 1
fi
if [ -z "${RESTORE_URL:-}" ]; then
  echo "GAGAL: RESTORE_URL belum diisi." >&2
  echo "       Sengaja tidak ada nilai bawaan — supaya tidak ada yang tanpa" >&2
  echo "       sadar menimpa basis data yang sedang dipakai." >&2
  exit 1
fi
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "GAGAL: BACKUP_PASSPHRASE belum diisi." >&2
  exit 1
fi

SEMENTARA="$(mktemp -d)"
trap 'rm -rf "$SEMENTARA"' EXIT
chmod 700 "$SEMENTARA"

echo "[1/3] Mendekripsi…"
printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --quiet \
  --passphrase-fd 0 --pinentry-mode loopback \
  --decrypt "$BERKAS" > "$SEMENTARA/db.dump"
echo "      $(pg_restore -l "$SEMENTARA/db.dump" | grep -c 'TABLE DATA' || true) tabel berisi data"

echo "[2/3] Memeriksa tujuan…"

# Sambungannya diperiksa TERPISAH dari jumlah tabelnya.
#
# Versi pertama menggabungkan keduanya: `psql ... || echo 0`. Kalau basis
# data tujuannya tidak ada sama sekali, psql gagal dan skrip melaporkan
# "tujuan berisi 0 tabel" — terbaca seperti basis data kosong yang siap
# diisi. Lalu pemulihannya gagal dengan satu galat yang tenggelam di antara
# baris lain. Pada hari pemulihan sungguhan, salah paham itu menghabiskan
# menit-menit yang paling mahal. Ketahuan saat latihan memulihkan, karena
# basis data latihannya memang belum sempat dibuat.
if ! psql "$RESTORE_URL" -tAc "select 1" >/dev/null 2>&1; then
  echo "GAGAL: tidak bisa menyambung ke basis data tujuan." >&2
  echo "       Periksa RESTORE_URL, dan pastikan basis datanya SUDAH DIBUAT:" >&2
  echo "         createdb nurahome_pulih" >&2
  exit 1
fi

ADA=$(psql "$RESTORE_URL" -tAc \
  "select count(*) from information_schema.tables where table_schema='public'")
echo "      tujuan berisi $ADA tabel"

if [ "${ADA:-0}" -gt 0 ] && [ "${PAKSA:-}" != "1" ]; then
  echo
  echo "  Basis data tujuan SUDAH BERISI $ADA tabel."
  echo "  Melanjutkan akan menimpanya."
  echo
  printf "  Ketik TIMPA lalu Enter untuk lanjut: "
  read -r JAWAB
  if [ "$JAWAB" != "TIMPA" ]; then
    echo "  Dibatalkan. Tidak ada yang diubah."
    exit 1
  fi
fi

echo "[3/3] Memulihkan…"
# --clean --if-exists : membuang objek lama lebih dulu
# --no-owner --no-privileges : tidak menuntut nama pengguna yang sama
# Galat per-objek TIDAK menghentikan sisanya; ringkasannya dicetak di akhir,
# karena pemulihan yang berhenti di objek pertama yang bermasalah
# meninggalkan basis data setengah jadi — lebih buruk daripada selesai
# dengan beberapa catatan.
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "$RESTORE_URL" "$SEMENTARA/db.dump" 2>"$SEMENTARA/galat.log" || true

GALAT=$(grep -c "^pg_restore: error" "$SEMENTARA/galat.log" || true)
echo "      $GALAT galat saat memulihkan"
[ "$GALAT" -gt 0 ] && head -20 "$SEMENTARA/galat.log"

echo
echo "Isi setelah dipulihkan:"
psql "$RESTORE_URL" -c \
  "select 'bookings' t, count(*) from bookings
   union all select 'users', count(*) from users
   union all select 'providers', count(*) from providers
   union all select 'consents', count(*) from consents
   union all select 'task_photos', count(*) from task_photos
   union all select 'visit_reports', count(*) from visit_reports
   union all select 'testimoni', count(*) from testimoni
   union all select 'audit_logs', count(*) from audit_logs"

echo
echo "PENTING setelah pemulihan sungguhan:"
echo "  1. Cabut semua sesi — token lama bisa saja ikut dari salinan lama:"
echo "     psql \"\$RESTORE_URL\" -c \"update sessions set revoked_at = now(),"
echo "       revoked_reason = 'PEMULIHAN' where revoked_at is null\""
echo "  2. Periksa kunjungan berstatus DIBAYAR / DIKERJAKAN — bisa jadi"
echo "     kenyataannya sudah lebih maju daripada isi cadangan."
echo "  3. Beri tahu pasien yang pemesanannya terpengaruh. Rekam yang mundur"
echo "     beberapa jam tanpa ada yang memberi tahu lebih membingungkan"
echo "     daripada rekam yang hilang."
