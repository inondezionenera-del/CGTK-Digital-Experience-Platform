#!/usr/bin/env bash
#
# Menaikkan Worker ke Cloudflare, sekali jalan.
#
#   bash scripts/deploy.sh
#
# Yang dia lakukan, berurutan:
#   1. memastikan kamu sudah login ke Cloudflare (kalau belum, membuka browser)
#   2. memasang empat rahasia dari .dev.vars ke Cloudflare
#   3. menaikkan Worker
#   4. mengetes /health, lalu mencetak alamat yang harus dikirim ke tim frontend
#
# Sengaja memakai lingkungan BAWAAN, bukan --env production. Alasannya CORS:
# lingkungan bawaan memakai ENVIRONMENT=development, dan hanya di situ
# localhost diizinkan. Kalau dinaikkan ke production, Rijal dan yang lain
# langsung tertolak CORS dari localhost:5173 dan tidak akan paham kenapa.
#
# Nanti kalau sudah mau dipakai peserta sungguhan, baru:
#   npx wrangler deploy --env production
#   npx wrangler secret put ALLOWED_ORIGINS --env production   # https://cgtk.my.id
# beserta keempat rahasia di bawah, diulang dengan --env production.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .dev.vars ]; then
  echo "  .dev.vars tidak ada. Isinya yang dipakai untuk memasang rahasia." >&2
  exit 1
fi

baca() {
  grep "^$1=" .dev.vars | head -1 | cut -d= -f2- | tr -d '\r'
}

RAHASIA="SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY SUPABASE_JWT_SECRET QR_SIGNING_SECRET"

for nama in $RAHASIA; do
  if [ -z "$(baca "$nama")" ]; then
    echo "  $nama kosong di .dev.vars. Isi dulu sebelum deploy." >&2
    exit 1
  fi
done

echo
echo "=== 1/4  Memeriksa login Cloudflare ==="
if ! npx wrangler whoami 2>/dev/null | grep -qi "account"; then
  echo "  Belum login. Browser akan terbuka, izinkan akses lalu kembali ke sini."
  npx wrangler login
fi
npx wrangler whoami | tail -5

echo
echo "=== 2/4  Memasang rahasia ==="
for nama in $RAHASIA; do
  printf '%s' "$(baca "$nama")" | npx wrangler secret put "$nama" >/dev/null 2>&1 \
    && echo "  $nama terpasang" \
    || { echo "  GAGAL memasang $nama" >&2; exit 1; }
done

echo
echo "=== 3/4  Menaikkan Worker ==="
npx wrangler deploy 2>&1 | tee /tmp/cgtk-deploy.log

ALAMAT=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' /tmp/cgtk-deploy.log | head -1 || true)

if [ -z "$ALAMAT" ]; then
  echo
  echo "  Worker naik, tapi alamatnya tidak terbaca dari catatan di atas."
  echo "  Lihat sendiri di dasbor Cloudflare, lalu lanjut ke langkah 4 secara manual."
  exit 0
fi

echo
echo "=== 4/4  Mengetes ==="
echo "  $ALAMAT/health"
curl -s --max-time 20 "$ALAMAT/health" || true
echo
echo "  $ALAMAT/api/v1/events"
curl -s --max-time 20 "$ALAMAT/api/v1/events" || true
echo

cat <<PESAN

-------------------------------------------------------------------
Kalau /health menjawab  "status":"ok"  berarti beres.

Kirim baris ini ke Fariz, Haqi, dan RIJAL:

  VITE_API_BASE=$ALAMAT/api/v1

Kalau /events masih menjawab  {"sukses":true,"data":[]}  berarti
databasenya masih kosong. Jalankan:

  npm run db:contoh
-------------------------------------------------------------------

PESAN
