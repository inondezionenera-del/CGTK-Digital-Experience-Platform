import type { Env } from '../env';
import { db } from './db';

/**
 * Settings access.
 *
 * Every number that a division might want to change lives in the `settings`
 * table rather than in this codebase. That single decision is what lets the
 * project be handed over: Administration edits the payment instructions,
 * Events edits XP values, and nobody has to find a developer.
 *
 * Cached for 30 seconds inside one isolate. Short enough that a change made
 * during the event takes effect almost immediately; long enough that a
 * three-hundred-person dashboard rush does not turn into three hundred reads.
 */

interface Baris {
  kunci: string;
  nilai: string | null;
  tipe: string;
  publik: boolean;
}

const TTL_MS = 30_000;
let cache: Map<string, Baris> | null = null;
let kedaluwarsa = 0;

async function muat(env: Env): Promise<Map<string, Baris>> {
  const now = Date.now();
  if (cache && now < kedaluwarsa) return cache;

  const { data, error } = await db(env)
    .from('settings')
    .select('kunci, nilai, tipe, publik');

  if (error) {
    // Serving a slightly stale value beats failing the request outright.
    if (cache) return cache;
    throw error;
  }

  cache = new Map((data ?? []).map((r) => [r.kunci, r as Baris]));
  kedaluwarsa = now + TTL_MS;
  return cache;
}

export async function teks(env: Env, kunci: string, bawaan = ''): Promise<string> {
  const m = await muat(env);
  return m.get(kunci)?.nilai ?? bawaan;
}

export async function angka(env: Env, kunci: string, bawaan = 0): Promise<number> {
  const v = await teks(env, kunci, '');
  const n = Number(v);
  return Number.isFinite(n) && v !== '' ? n : bawaan;
}

export async function boolean_(env: Env, kunci: string, bawaan = false): Promise<boolean> {
  const v = (await teks(env, kunci, '')).toLowerCase();
  if (v === '') return bawaan;
  return v === 'true' || v === '1' || v === 'ya';
}

/** Only rows flagged public. The payment form URL is deliberately not one of them. */
export async function semuaPublik(env: Env): Promise<Record<string, string | number | boolean>> {
  const m = await muat(env);
  const out: Record<string, string | number | boolean> = {};
  for (const [k, r] of m) {
    if (!r.publik) continue;
    out[k] = r.tipe === 'ANGKA' ? Number(r.nilai ?? 0)
           : r.tipe === 'BOOLEAN' ? (r.nilai ?? '').toLowerCase() === 'true'
           : (r.nilai ?? '');
  }
  return out;
}

export async function simpan(
  env: Env,
  kunci: string,
  nilai: string,
  oleh: string,
): Promise<void> {
  const { error } = await db(env)
    .from('settings')
    .update({ nilai, diubah_oleh: oleh, diubah_at: new Date().toISOString() })
    .eq('kunci', kunci);
  if (error) throw error;
  cache = null;   // next read reflects the change immediately
}

/**
 * When the day turns out busier than planned, this trims the expensive reads
 * and leaves the essentials alone. Scanning, attendance and XP are never
 * touched — those are the event itself.
 */
export async function modeHemat(env: Env): Promise<boolean> {
  return boolean_(env, 'mode_hemat', false);
}
