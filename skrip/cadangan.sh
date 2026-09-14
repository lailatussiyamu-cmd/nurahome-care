#!/usr/bin/env bash
#
# Cadangan basis data NuraHome Care.
#
# ┌──────────────────────────────────────────────────────────────────────┐
# │  YANG DICADANGKAN DI SINI ADALAH DATA KESEHATAN.                      │
# │  Foto luka, catatan klinis, nomor telepon, alamat rumah, teks         │
# │  persetujuan yang ditandatangani. Karena itu berkasnya SELALU         │
# │  dienkripsi sebelum menyentuh disk, dan tidak pernah ditulis ke       │
# │  /tmp atau folder yang dibagi.                                        │
# │                                                                       │
# │  Cadangan yang tidak dienkripsi adalah salinan lengkap rekam medis    │
# │  seluruh pasien dalam satu berkas yang gampang dipindahkan. Kalau     │
# │  laptop atau kunci penyimpanan awan-nya hilang, yang hilang bukan     │
# │  "cadangan" — yang hilang adalah rekam medis semua orang sekaligus.   │
# └──────────────────────────────────────────────────────────────────────┘
#
# Pakai:
#   DATABASE_URL=postgresql://... BACKUP_PASSPHRASE=... ./skrip/cadangan.sh
#
# Lihat CADANGAN.md untuk jadwal, penyimpanan luar, dan latihan memulihkan.

set -euo pipefail

TUJUAN="${BACKUP_DIR:-/var/backups/nurahome}"
SIMPAN_HARIAN="${BACKUP_KEEP_DAILY:-14}"
SIMPAN_MINGGUAN="${BACKUP_KEEP_WEEKLY:-8}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "GAGAL: DATABASE_URL belum diisi." >&2
  exit 1
fi

# Tanpa kunci, skrip ini BERHENTI — bukan membuat cadangan polos.
#
# Godaannya besar untuk menulis "kalau tidak ada kunci, simpan apa adanya
# dulu". Yang terjadi sesudahnya bisa ditebak: cadangan polos itu berjalan
# tiap malam selama setahun dan tidak ada yang ingat.
if [ -z "${BACKUP_PASSPHRASE:-}" ] || [ "${#BACKUP_PASSPHRASE}" -lt 16 ]; then
  echo "GAGAL: BACKUP_PASSPHRASE belum diisi atau kurang dari 16 karakter." >&2
  echo "       Buat dengan: openssl rand -base64 32" >&2
  exit 1
fi

STEMPEL="$(date -u +%Y%m%dT%H%M%SZ)"
HARI="$(date -u +%u)"   # 7 = Minggu
if [ "$HARI" = "7" ]; then JENIS="mingguan"; else JENIS="harian"; fi

mkdir -p "$TUJUAN/$JENIS"
chmod 700 "$TUJUAN" "$TUJUAN/$JENIS"

BERKAS="$TUJUAN/$JENIS/nurahome-$STEMPEL.dump.gpg"
SEMENTARA="$(mktemp -d)"
trap 'rm -rf "$SEMENTARA"' EXIT
chmod 700 "$SEMENTARA"

echo "[1/4] Mengambil dump…"
# -Fc  : format custom — bisa dipulihkan sebagian tabel, dan sudah terkompres
# --no-owner --no-privileges : supaya bisa dipulihkan ke server dengan
#                              nama pengguna yang berbeda; ini yang paling
#                              sering menggagalkan pemulihan saat panik.
pg_dump "$DATABASE_URL" -Fc --no-owner --no-privileges -f "$SEMENTARA/db.dump"

UKURAN=$(stat -c%s "$SEMENTARA/db.dump")
echo "      $UKURAN byte"

# Dump yang terlalu kecil hampir pasti dump dari basis data yang kosong —
# misalnya karena DATABASE_URL menunjuk ke tempat yang salah. Menyimpannya
# diam-diam berarti cadangan hari ini menimpa antrean dengan berkas kosong.
if [ "$UKURAN" -lt 10000 ]; then
  echo "GAGAL: dump hanya $UKURAN byte — hampir pasti basis data kosong." >&2
  exit 1
fi

echo "[2/4] Mengenkripsi…"
# --batch + --passphrase-fd 0 : kunci lewat stdin, tidak pernah muncul di
# daftar proses (`ps aux`), tempat ia bisa dibaca pengguna lain di server.
printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet \
  --passphrase-fd 0 --pinentry-mode loopback \
  --symmetric --cipher-algo AES256 \
  --output "$BERKAS" "$SEMENTARA/db.dump"
chmod 600 "$BERKAS"

echo "[3/4] Memeriksa hasilnya bisa dibuka kembali…"
# Cadangan yang tidak pernah dicoba dibuka bukan cadangan, melainkan
# harapan. Di sini yang diperiksa bukan hanya bahwa berkasnya bisa
# didekripsi, tapi bahwa isinya benar-benar dump Postgres yang utuh dan
# berisi tabel-tabel yang diharapkan.
printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --quiet \
  --passphrase-fd 0 --pinentry-mode loopback \
  --decrypt "$BERKAS" > "$SEMENTARA/uji.dump"

JUMLAH_TABEL=$(pg_restore -l "$SEMENTARA/uji.dump" | grep -c 'TABLE DATA' || true)
echo "      $JUMLAH_TABEL tabel berisi data"
if [ "$JUMLAH_TABEL" -lt 10 ]; then
  echo "GAGAL: hanya $JUMLAH_TABEL tabel di dalam cadangan." >&2
  rm -f "$BERKAS"
  exit 1
fi

for T in bookings consents task_photos visit_reports users providers; do
  if ! pg_restore -l "$SEMENTARA/uji.dump" | grep -q " $T "; then
    echo "GAGAL: tabel '$T' tidak ada di dalam cadangan." >&2
    rm -f "$BERKAS"
    exit 1
  fi
done

echo "[4/4] Membersihkan cadangan lama…"
# Yang lama dihapus DI AKHIR, setelah yang baru terbukti bisa dibuka.
# Kebalikannya — membersihkan dulu lalu membuat yang baru — berarti satu
# cadangan yang gagal meninggalkan lebih sedikit salinan daripada sebelumnya.
# Selalu berakhir dengan status 0.
#
# Versi pertama fungsi ini diakhiri oleh `[ "$n" -gt "$simpan" ]`. Kalau
# tidak ada yang perlu dihapus, ujinya bernilai salah, fungsinya
# mengembalikan status 1, dan `set -e` di atas MENGHENTIKAN seluruh skrip —
# tepat sebelum baris terakhir yang mengingatkan menyalin cadangan ke tempat
# lain. Cadangannya tetap jadi, jadi tidak ada yang terlihat gagal; yang
# hilang hanya pengingat paling pentingnya. Ketahuan karena skripnya
# benar-benar dijalankan, bukan karena membacanya.
bersihkan() {
  local dir="$1" simpan="$2"
  local n
  # `|| true` di dalam substitusi bukan hiasan.
  #
  # Skrip ini memakai `set -o pipefail`, jadi status pipa diambil dari
  # perintah yang GAGAL, bukan dari yang terakhir. Pada folder mingguan yang
  # masih kosong, `ls` gagal, pipanya bernilai gagal, dan seluruh skrip
  # berhenti — tepat sebelum baris terakhirnya. Ini kelanjutan dari galat
  # yang sama seperti di komentar di atas: dua-duanya hanya terlihat kalau
  # skripnya dijalankan pada keadaan folder yang masih kosong.
  n=$( { ls -1t "$dir"/nurahome-*.dump.gpg 2>/dev/null || true; } | wc -l)
  if [ "$n" -gt "$simpan" ]; then
    { ls -1t "$dir"/nurahome-*.dump.gpg || true; } | tail -n +$((simpan + 1)) | while read -r f; do
      echo "      hapus $(basename "$f")"
      rm -f "$f"
    done
  fi
  return 0
}
bersihkan "$TUJUAN/harian" "$SIMPAN_HARIAN"
bersihkan "$TUJUAN/mingguan" "$SIMPAN_MINGGUAN"

echo
echo "SELESAI: $BERKAS"
echo "Ukuran : $(stat -c%s "$BERKAS") byte"
echo
echo "Salin ke tempat LAIN sekarang (lihat CADANGAN.md §Salinan luar)."
echo "Cadangan yang hanya ada di server yang sama dengan basis datanya"
echo "tidak menolong pada satu-satunya kejadian yang paling mungkin:"
echo "servernya yang hilang."
