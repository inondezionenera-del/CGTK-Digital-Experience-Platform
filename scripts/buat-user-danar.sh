#!/usr/bin/env bash
#
# Membuat user database untuk layanan Python Danar.
#
#   bash scripts/buat-user-danar.sh
#
# Yang dia lakukan:
#   1. membaca DATABASE_URL dari .dev.vars, jadi kamu tidak perlu mengetiknya
#   2. membuat sandi acak sendiri, jadi kamu tidak perlu memikirkannya
#   3. menjalankan db/manual/peran-danar.sql
#   4. memeriksa hasilnya: apakah perannya jadi, dan apakah haknya benar
#   5. menulis alamat sambungan untuk Danar ke berkas di luar repo
#
# Sandi tidak pernah dicetak ke layar. Layar bisa terlihat orang lain dan
# riwayat terminal bisa tersimpan; berkasnya saja yang menyimpannya.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .dev.vars ]; then
  echo "  .dev.vars tidak ada. Jalankan dari folder backend." >&2
  exit 1
fi

# --- cari psql -------------------------------------------------------------
PSQL=""
if command -v psql >/dev/null 2>&1; then
  PSQL="psql"
else
  for v in 18 17 16 15; do
    kandidat="/c/Program Files/PostgreSQL/$v/bin/psql.exe"
    if [ -f "$kandidat" ]; then PSQL="$kandidat"; break; fi
  done
fi

if [ -z "$PSQL" ]; then
  echo "  psql tidak ketemu. Pasang PostgreSQL client dulu." >&2
  exit 1
fi

DB=$(grep '^DATABASE_URL=' .dev.vars | head -1 | cut -d= -f2- | tr -d '\r')
if [ -z "$DB" ]; then
  echo "  DATABASE_URL kosong di .dev.vars." >&2
  exit 1
fi

# peran-danar.sql membuat peran dan memberi hak. Itu pekerjaan yang butuh
# sambungan langsung; pooler transaksi di 6543 tidak bisa menjalankannya.
case "$DB" in
  *:6543*)
    echo "  DATABASE_URL memakai port 6543. Untuk ini pakai 5432." >&2
    exit 1
    ;;
esac

# --- sandi acak ------------------------------------------------------------
SANDI=$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")

echo
echo "=== Membuat peran cgtk_kuis ==="
"$PSQL" "$DB" -v ON_ERROR_STOP=1 -v sandi="$SANDI" -f db/manual/peran-danar.sql \
  >/dev/null 2>/tmp/danar-err.txt || {
    echo "  GAGAL:"; sed 's/^/    /' /tmp/danar-err.txt >&2; exit 1;
  }

echo "  peran dibuat."
echo
echo "=== Memeriksa hasilnya ==="
"$PSQL" "$DB" -At -c "
  select 'bisa login: ' || rolcanlogin from pg_roles where rolname = 'cgtk_kuis';
" | sed 's/^/  /'

echo "  hak per tabel:"
"$PSQL" "$DB" -At -F' ' -c "
  select table_name, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.table_privileges
  where grantee = 'cgtk_kuis'
  group by table_name order by table_name;
" | sed 's/^/    /'

echo
echo "  Yang paling penting dari daftar di atas: point_transactions harus"
echo "  SELECT saja. Kalau ada INSERT atau UPDATE di situ, berhenti dan"
echo "  beri tahu, karena itu berarti ledger XP bisa ditulis dua pihak."

# --- alamat sambungan untuk Danar ------------------------------------------
# Dia memakai pooler di 6543: layanannya memegang sambungan lama, tidak seperti
# Worker yang membuka dan menutup cepat.
HOST=$(printf '%s' "$DB" | sed -E 's|.*@([^:/]+).*|\1|')
TUJUAN="/c/Users/Lenovo/CGTK-Backup/SANDI-DANAR.txt"
mkdir -p "$(dirname "$TUJUAN")"

cat > "$TUJUAN" <<BERKAS
User database untuk layanan Python Danar
Dibuat $(date '+%Y-%m-%d %H:%M')

Kirim baris ini ke Danar lewat japri, jangan di grup:

DATABASE_URL=postgresql://cgtk_kuis:${SANDI}@${HOST}:6543/postgres

Port 6543 itu Connection Pooler, bukan 5432. Layanan dia memegang sambungan
lama, dan kalau memakai 5432 waktu pesertanya ramai, sambungan ke-61 ditolak
dan yang mati bukan cuma fiturnya.

Dia hanya bisa MEMBACA point_transactions. Untuk memberi XP dia memanggil
fungsi tambah_xp() lewat rpc, yang menerapkan batas XP per booth dan menulis
catatan audit.

Jangan taruh berkas ini di repo mana pun.
BERKAS

echo
echo "  Alamat sambungan untuk Danar tersimpan di:"
echo "    C:\\Users\\Lenovo\\CGTK-Backup\\SANDI-DANAR.txt"
echo "  Buka berkas itu, salin barisnya, kirim japri ke Danar."
echo
