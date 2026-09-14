import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard rails on the migrations.
 *
 * These read the SQL as text rather than running it. They cannot prove the
 * schema is correct, and they are not trying to — each one pins a decision that
 * was expensive to reach and would be quietly undone by a plausible-looking
 * edit. A real database is needed for anything more than that.
 */

const DIR = join(__dirname, '..', 'db', 'migrations');
const berkas = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const semua = berkas.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n').toLowerCase();

describe('migrasi', () => {
  it('bernomor urut tanpa lompatan', () => {
    const nomor = berkas.map((f) => Number(f.slice(0, 4)));
    expect(nomor).toEqual(nomor.map((_, i) => i + 1));
  });

  it('tidak ada nomor ganda', () => {
    const nomor = berkas.map((f) => f.slice(0, 4));
    expect(new Set(nomor).size).toBe(nomor.length);
  });
});

describe('anti-farming booth', () => {
  /**
   * The single most expensive thing to get wrong in this schema.
   *
   * In Event 3 one table is staffed by alumni from several campuses at once. A
   * unique key on (participant, campus) would let a participant take XP from
   * each of them without moving — three times the points for standing still.
   * The key has to be the booth.
   */
  it('unik per (participant_id, booth_id), bukan campus_id', () => {
    expect(semua).toMatch(/unique index[\s\S]*booth_visits[\s\S]*\(\s*participant_id\s*,\s*booth_id\s*\)/);
    expect(semua).not.toMatch(/unique index[\s\S]*booth_visits[\s\S]*\(\s*participant_id\s*,\s*university_id\s*\)/);
  });

  it('kunjungan yang dibatalkan tidak ikut mengunci', () => {
    // Without the partial predicate, cancelling a mis-scan would permanently
    // bar the participant from that booth.
    expect(semua).toMatch(/booth_visits[\s\S]{0,200}where\s+dibatalkan\s*=\s*false/);
  });
});

describe('presensi', () => {
  // Attendance points at user_id, not participant_id, so alumni attendance can
  // be switched on later without rebuilding a table that already holds data.
  it('attendances mengacu ke user_id', () => {
    expect(semua).toMatch(/create table( if not exists)? attendances[\s\S]*?user_id/);
  });

  // Idempotency key for the offline queue. A phone that resends after a dropped
  // connection must not create a second row.
  it('scan_uuid unik', () => {
    expect(semua).toMatch(/scan_uuid[\s\S]{0,200}unique|unique[\s\S]{0,120}scan_uuid/);
  });
});

describe('pembayaran', () => {
  /**
   * Administration handles money entirely outside the web app — cash or
   * transfer, recorded in their own book. The app records only that someone
   * marked it settled, and who. A nominal column would create a second set of
   * figures that will not match theirs.
   */
  it('tabel payments tidak menyimpan nominal', () => {
    const isi = readFileSync(join(DIR, '0003_registration_payment.sql'), 'utf8').toLowerCase();
    const tabel = isi.slice(isi.indexOf('create table payments'));
    const badan = tabel.slice(0, tabel.indexOf(');'));
    for (const kolom of ['jumlah', 'nominal', 'amount', 'harga', 'total_bayar']) {
      expect(badan).not.toContain(kolom);
    }
  });

  it('tidak ada tabel ticket_batches', () => {
    expect(semua).not.toContain('create table ticket_batches');
  });
});

describe('kode registrasi', () => {
  // Read aloud across a table at a school desk, and typed by hand on a phone.
  // 0/O and 1/I/L are where that goes wrong.
  it('alfabet kode tidak memuat huruf/angka yang mirip', () => {
    const isi = readFileSync(join(DIR, '0001_extensions.sql'), 'utf8');
    const alfabet = isi.match(/'([A-Z0-9]{20,})'/)?.[1];
    expect(alfabet).toBeTruthy();
    for (const c of ['0', 'O', '1', 'I', 'L']) {
      expect(alfabet).not.toContain(c);
    }
  });
});

describe('XP', () => {
  // The ledger is append-only: a reversal is a new negative row, never a
  // deletion. It is the only way the audit trail can answer "why does this
  // number look wrong" after the fact.
  it('level tidak disimpan sebagai kolom', () => {
    expect(semua).not.toMatch(/alter table participants[\s\S]{0,80}add column level/);
  });

  it('ada fungsi hitung level dari ledger', () => {
    expect(semua).toContain('level_peserta');
    expect(semua).toContain('total_xp');
  });
});

describe('RLS', () => {
  const rls = readFileSync(join(DIR, '0011_rls.sql'), 'utf8').toLowerCase();

  it('menyalakan RLS untuk semua tabel', () => {
    expect(rls).toContain('enable row level security');
  });

  // The anon key is public by design. Anything readable with it is readable by
  // anyone who opens devtools.
  it('mencabut hak anon dan authenticated', () => {
    expect(rls).toMatch(/revoke all on all tables in schema public from anon, authenticated/);
  });

  it('settings tidak dibuka untuk publik', () => {
    // It holds link_pembayaran, which the whole /payments/buka redirect exists
    // to keep out of participant-facing responses.
    expect(rls).not.toMatch(/create policy[^;]*on public\.settings[^;]*for select to anon/);
  });
});
