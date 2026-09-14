import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { AppError } from './errors';

/**
 * Supabase client, service role.
 *
 * Data access goes over HTTP (PostgREST) rather than a TCP connection. That is
 * what makes this deployable to Workers at all, and it sidesteps the Postgres
 * connection ceiling entirely — there is no pool to exhaust when 300 people
 * open their dashboards at once.
 *
 * The cost is that multi-table writes are not atomic over HTTP. Anything that
 * has to be all-or-nothing — a gate scan, settling a payment — lives in a
 * Postgres function and is called through `rpc()`.
 */

let cache: SupabaseClient | null = null;
let cacheKey = '';

export function db(env: Env): SupabaseClient {
  const key = env.SUPABASE_URL + env.SUPABASE_SERVICE_ROLE_KEY;
  if (cache && cacheKey === key) return cache;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured');
  }

  cache = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'cgtk-api' } },
  });
  cacheKey = key;
  return cache;
}

/** Calls a Postgres function and unwraps its jsonb result. */
export async function rpc<T = unknown>(
  env: Env,
  nama: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await db(env).rpc(nama, args);
  if (error) {
    console.error(`rpc ${nama} failed`, error);
    throw new AppError('ERROR_SERVER', { rpc: nama, pesan: error.message });
  }
  return data as T;
}

/** Throws TIDAK_DITEMUKAN instead of returning null. */
export function wajibAda<T>(row: T | null | undefined): T {
  if (row === null || row === undefined) throw new AppError('TIDAK_DITEMUKAN');
  return row;
}
