# Layanan Python CGTK

Kuis, misi, achievement, leaderboard, dan level. Dipanggil lewat Worker, tidak
pernah langsung dari browser peserta.

## Menjalankan di laptop

```bash
python -m venv venv
venv/Scripts/activate          # Windows
pip install -r requirements.txt
cp .env.example .env           # isinya minta ke Rafly
uvicorn app.main:app --reload
```

Buka `http://127.0.0.1:8000/docs` untuk melihat semua endpoint.

## Catatan penting

**Folder ini masih berada di dalam repo backend TypeScript**, dan `wrangler
deploy` tidak melihatnya sama sekali. Supaya benar-benar jalan, isi folder ini
harus dipindah ke repo sendiri lalu dihubungkan ke Vercel, dengan
`requirements.txt` berada di akar repo itu.

Dua nilai yang perlu diisi di Environment Variables Vercel:

| Nama | Isi |
|---|---|
| `DATABASE_URL` | user `cgtk_kuis`, **port 6543** (pooler), bukan 5432 |
| `CGTK_SECRET` | kunci bersama dengan Worker, minta ke Rafly |

Kalau `CGTK_SECRET` kosong, layanan menolak semua permintaan. Itu disengaja:
kunci yang lupa dipasang tidak boleh berarti pintunya terbuka.

## Tiga aturan yang tidak boleh dilanggar

1. **XP selalu lewat `tambah_xp()` di database**, tidak pernah dengan menulis
   ke `point_transactions`. Fungsi itu yang menerapkan batas XP per booth dan
   menulis catatan audit. User `cgtk_kuis` memang cuma punya hak SELECT di
   tabel itu, jadi penulisan langsung akan ditolak Postgres.

2. **`bobot` di `quiz_options` tidak pernah dikirim keluar.** Itu kunci
   jawabannya; siapa pun yang membacanya bisa menyusun jawaban yang
   menghasilkan rumpun apa pun.

3. **Jangan panggil `Base.metadata.create_all`.** Struktur tabel milik
   migration di sisi TypeScript. Dua sumber kebenaran akan berselisih, dan yang
   kalah adalah datanya.
