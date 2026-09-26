#!/usr/bin/env node
/**
 * Menjalankan satu berkas .sql apa saja, di luar jalur migration.
 *
 *   node scripts/jalankan-sql.mjs db/manual/data-contoh.sql
 *
 * Dipakai untuk berkas di db/manual/ yang sengaja TIDAK jadi migration: data
 * contoh, pembuatan user database, tindakan sekali jalan. Berkas seperti itu
 * tidak boleh dicatat di tabel _migrations, karena kalau tercatat dia ikut
 * terpasang lagi setiap kali database dibangun ulang.
 *
 * Butuh DATABASE_URL, sama seperti migrate.mjs. Diambil dari .dev.vars.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(HERE, '..');

const berkas = process.argv[2];
if (!berkas) {
  console.error('\n  Belum ada berkas yang disebut.');
  console.error('  Contoh: node scripts/jalankan-sql.mjs db/manual/data-contoh.sql\n');
  process.exit(1);
}

const jalur = path.isAbsolute(berkas) ? berkas : path.join(AKAR, berkas);
if (!fs.existsSync(jalur)) {
  console.error(`\n  Berkas tidak ditemukan: ${jalur}\n`);
  process.exit(1);
}

// Muat .dev.vars atau .env tanpa menambah dependensi. Sama seperti migrate.mjs.
for (const nama of ['.dev.vars', '.env']) {
  const p = path.join(AKAR, nama);
  if (!fs.existsSync(p)) continue;
  for (const baris of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n  DATABASE_URL belum diisi di .dev.vars.\n');
  process.exit(1);
}

if (url.includes(':6543')) {
  console.error('\n  DATABASE_URL menunjuk ke transaction pooler (port 6543).');
  console.error('  Pakai port 5432. Yang 6543 tidak bisa menjalankan perintah seperti ini.\n');
  process.exit(1);
}

const isi = fs.readFileSync(jalur, 'utf8');

// psql punya perintah sendiri yang diawali backslash, misalnya \set. Postgres
// tidak mengenalnya, jadi barisnya dibuang di sini supaya berkas yang sama tetap
// bisa dijalankan lewat psql maupun lewat skrip ini.
const bersih = isi
  .split('\n')
  .filter((b) => !/^\s*\\/.test(b))
  .join('\n');

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  console.log(`\n  Menjalankan ${path.relative(AKAR, jalur)} ...`);
  await sql.unsafe(bersih);
  console.log('  Selesai.\n');

  // Tunjukkan hasilnya, supaya tidak perlu buka dasbor Supabase untuk memastikan.
  const ringkas = await sql`
    select 'events' as tabel, count(*)::int as baris from events
    union all select 'sessions',          count(*)::int from sessions
    union all select 'universities',      count(*)::int from universities
    union all select 'majors',            count(*)::int from majors
    union all select 'university_majors', count(*)::int from university_majors
    union all select 'booths',            count(*)::int from booths
    union all select 'sponsors',          count(*)::int from sponsors
    union all select 'pages',             count(*)::int from pages
    order by tabel
  `;
  console.log('  Isi tabel sekarang:');
  for (const r of ringkas) {
    console.log(`    ${String(r.tabel).padEnd(20)} ${r.baris}`);
  }
  console.log('');
} catch (e) {
  console.error(`\n  Gagal: ${e.message}\n`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
