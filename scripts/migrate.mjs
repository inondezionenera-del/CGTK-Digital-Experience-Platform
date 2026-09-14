#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Applies db/migrations/*.sql in filename order, recording each one so it is
 * never applied twice.
 *
 *   node scripts/migrate.mjs              apply pending migrations
 *   node scripts/migrate.mjs --seed-only  re-run 0010_seed.sql only
 *   node scripts/migrate.mjs --reset      DROP the public schema, then re-apply
 *
 * Requires DATABASE_URL pointing at the DIRECT connection (port 5432).
 * DDL needs a real session; the transaction pooler on 6543 cannot run it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, '..', 'db', 'migrations');

const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const SEED_ONLY = args.includes('--seed-only');

// Load .dev.vars or .env without pulling in a dependency
for (const file of ['.dev.vars', '.env']) {
  const p = path.join(HERE, '..', file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n  DATABASE_URL is not set.');
  console.error('  Copy .env.example to .dev.vars and fill it in.\n');
  process.exit(1);
}

if (url.includes(':6543')) {
  console.error('\n  DATABASE_URL points at the transaction pooler (port 6543).');
  console.error('  Migrations need the direct connection on port 5432.\n');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

async function main() {
  if (RESET) {
    console.log('\n  Dropping and recreating the public schema...');
    await sql.unsafe('drop schema public cascade; create schema public;');
  }

  await sql.unsafe(`
    create table if not exists _migrations (
      nama        text primary key,
      dijalankan  timestamptz not null default now()
    );
  `);

  const sudah = RESET
    ? new Set()
    : new Set((await sql`select nama from _migrations`).map((r) => r.nama));

  let files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  if (SEED_ONLY) files = files.filter((f) => f.includes('seed'));

  let applied = 0;

  for (const file of files) {
    if (sudah.has(file) && !SEED_ONLY) {
      console.log(`  skip   ${file}`);
      continue;
    }

    const isi = fs.readFileSync(path.join(DIR, file), 'utf8');
    process.stdout.write(`  apply  ${file} ... `);

    try {
      // Each migration runs in its own transaction: a failure halfway leaves
      // nothing behind to clean up by hand.
      await sql.begin(async (tx) => {
        await tx.unsafe(isi);
        await tx`
          insert into _migrations (nama) values (${file})
          on conflict (nama) do update set dijalankan = now()
        `;
      });
      console.log('ok');
      applied++;
    } catch (err) {
      console.log('FAILED');
      console.error(`\n  ${file}`);
      console.error(`  ${err.message}\n`);
      if (err.position) {
        const pos = Number(err.position);
        const before = isi.slice(0, pos);
        const line = before.split('\n').length;
        console.error(`  around line ${line}:`);
        console.error(`  ${isi.split('\n')[line - 1]?.trim()}\n`);
      }
      process.exit(1);
    }
  }

  const [{ count }] = await sql`
    select count(*)::int as count
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `;

  console.log(`\n  ${applied} migration(s) applied. ${count} tables in the database.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => sql.end());
