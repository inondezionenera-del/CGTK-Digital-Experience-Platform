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
echo "=== 2/5  Memasang rahasia ==="
for nama in $RAHASIA; do
  printf '%s' "$(baca "$nama")" | npx wrangler secret put "$nama" >/dev/null 2>&1 \
    && echo "  $nama terpasang" \
    || { echo "  GAGAL memasang $nama" >&2; exit 1; }
done

echo
echo "=== 3/5  KV untuk rate limit ==="
# Tanpa KV, middleware batasi() langsung lewat tanpa menghitung apa pun
# (lihat src/middleware/ratelimit.ts, "if (!kv) return next()"). Artinya
# keempat batas yang dijanjikan di dokumen tidak ada yang aktif, dan halaman
# cek status bisa ditembaki terus untuk menebak kode registrasi orang.
if grep -q '^\[\[kv_namespaces\]\]' wrangler.toml; then
  echo "  KV sudah terdaftar di wrangler.toml, dilewati"
else
  KELUARAN=$(npx wrangler kv namespace create RATE_LIMIT 2>&1 || true)
  echo "$KELUARAN" | tail -3
  KV_ID=$(echo "$KELUARAN" | grep -oE '"?id"?[ =:]+"?[0-9a-f]{32}' | grep -oE '[0-9a-f]{32}' | head -1)

  if [ -z "$KV_ID" ]; then
    echo
    echo "  Tidak bisa membaca id KV dari keluaran di atas."
    echo "  Salin id-nya sendiri, lalu tambahkan ke wrangler.toml:"
    echo
    echo "    [[kv_namespaces]]"
    echo '    binding = "RATE_LIMIT"'
    echo '    id = "id-yang-tadi"'
    echo
    read -r -p "  Tekan Enter kalau sudah, atau Ctrl+C untuk berhenti. " _
  else
    # Sisipkan tepat sebelum [observability], menggantikan blok yang dikomentari.
    node -e '
      const fs = require("fs");
      const id = process.argv[1];
      let t = fs.readFileSync("wrangler.toml", "utf8");
      const blok = "[[kv_namespaces]]\nbinding = \"RATE_LIMIT\"\nid = \"" + id + "\"\n";
      t = t.replace(/# \[\[kv_namespaces\]\]\r?\n# binding = "RATE_LIMIT"\r?\n# id = "REPLACE_ME"\r?\n/, blok);
      if (!t.includes("[[kv_namespaces]]")) {
        throw new Error("blok KV yang dikomentari tidak ditemukan di wrangler.toml");
      }
      fs.writeFileSync("wrangler.toml", t);
    ' "$KV_ID"
    echo "  KV dibuat dan dicatat di wrangler.toml (id $KV_ID)"
    echo "  Jangan lupa commit wrangler.toml setelah ini."
  fi
fi

echo
echo "=== 4/5  Menaikkan Worker ==="
echo
echo "  Kalau wrangler bertanya soal subdomain workers.dev, jawab YES."
echo "  Tanpa subdomain itu Worker terunggah tapi tidak punya alamat."
echo

# Dijalankan langsung, TIDAK lewat pipe.
#
# Percobaan pertama memakai `| tee`, dan itu membuat stdin bukan terminal.
# Wrangler lalu tidak bisa bertanya, memilih jawaban cadangan "no" sendiri,
# dan berhenti dengan: "You need to register a workers.dev subdomain before
# publishing". Workernya terunggah tapi tidak punya alamat sama sekali.
npx wrangler deploy

echo
echo "=== 5/5  Alamat Worker ==="
echo "  Lihat keluaran di atas, cari baris yang berbentuk:"
echo "    https://cgtk-api.<sesuatu>.workers.dev"
echo
read -r -p "  Tempel alamat itu di sini lalu Enter: " ALAMAT
ALAMAT=$(printf '%s' "$ALAMAT" | tr -d ' ' | sed 's:/*$::')

if [ -z "$ALAMAT" ]; then
  echo
  echo "  Dilewati. Kamu bisa menjalankan skrip ini lagi kapan saja."
  exit 0
fi

echo
echo "  Mengetes $ALAMAT/health"
curl -s --max-time 25 "$ALAMAT/health" || true
echo
echo "  Mengetes $ALAMAT/api/v1/events"
curl -s --max-time 25 "$ALAMAT/api/v1/events" || true
echo

# Ditulis ke berkas supaya tidak hilang waktu jendela terminal ditutup.
TUJUAN="$HOME/Desktop/CGTK-env-frontend.txt"
URL=$(grep '^SUPABASE_URL=' .dev.vars | cut -d= -f2- | tr -d '')
ANON=$(grep '^SUPABASE_ANON_KEY=' .dev.vars | cut -d= -f2- | tr -d '')

cat > "$TUJUAN" <<BERKAS
# Isi .env untuk Fariz, Haqi, dan RIJAL.
# Kirim empat baris di bawah sebagai teks di chat, bukan sebagai berkas.
# Mereka yang membuat berkas .env-nya sendiri di folder repo masing-masing.

VITE_SUPABASE_URL=$URL
VITE_SUPABASE_ANON_KEY=$ANON
VITE_API_BASE=$ALAMAT/api/v1
VITE_SENTRY_DSN=
BERKAS

cat <<PESAN

-------------------------------------------------------------------
Kalau /health menjawab  "status":"ok"  berarti Worker sudah hidup.

Empat baris .env untuk tim sudah ditulis ke:
  Desktop\CGTK-env-frontend.txt

Buka berkas itu, salin isinya, tempel di grup sebagai teks.

Kalau /events menjawab  {"sukses":true,"data":[]}  berarti databasenya
masih kosong. Jalankan:  npm run db:contoh
-------------------------------------------------------------------

PESAN
