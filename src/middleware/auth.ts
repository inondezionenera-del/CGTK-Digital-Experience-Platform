import type { MiddlewareHandler } from 'hono';
import type { Env, Pengguna, Variables } from '../env';
import { AppError } from '../lib/errors';
import { db } from '../lib/db';

/**
 * Authentication.
 *
 * Supabase issues HS256 access tokens. They are verified here with WebCrypto
 * rather than by calling Supabase for every request — at fifteen gate scans a
 * second, a round trip per scan is fifteen avoidable round trips.
 *
 * `sub` in the token is the same UUID as `public.users.id`: the application row
 * is created with the auth id on first sign-in, so no extra mapping is needed.
 */

const enc = new TextEncoder();

function dariBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

interface Klaim {
  sub: string;
  email?: string;
  exp: number;
  [k: string]: unknown;
}

export async function verifikasiToken(token: string, secret: string): Promise<Klaim> {
  const bagian = token.split('.');
  if (bagian.length !== 3) throw new AppError('TOKEN_KEDALUWARSA');

  const [header, payload, signature] = bagian as [string, string, string];

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['verify'],
  );

  const cocok = await crypto.subtle.verify(
    'HMAC', key, dariBase64Url(signature), enc.encode(`${header}.${payload}`),
  );
  if (!cocok) throw new AppError('TOKEN_KEDALUWARSA');

  const klaim = JSON.parse(new TextDecoder().decode(dariBase64Url(payload))) as Klaim;
  if (!klaim.sub) throw new AppError('TOKEN_KEDALUWARSA');
  if (klaim.exp && klaim.exp * 1000 < Date.now()) throw new AppError('TOKEN_KEDALUWARSA');

  return klaim;
}

async function muatPengguna(env: Env, userId: string): Promise<Pengguna> {
  const { data, error } = await db(env)
    .from('users')
    .select(`
      id, email, nama, status,
      roles!inner ( kode, role_permissions ( permissions ( kode ) ) ),
      participants ( id ),
      representatives ( id )
    `)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_LOGIN');
  if (data.status !== 'AKTIF') throw new AppError('AKUN_DINONAKTIFKAN');

  const peran = (data.roles as unknown as { kode: string }).kode;

  const izin = ((data.roles as unknown as {
    role_permissions?: { permissions?: { kode: string } }[];
  }).role_permissions ?? [])
    .map((rp) => rp.permissions?.kode)
    .filter((k): k is string => Boolean(k));

  const participants = data.participants as unknown as { id: string }[] | null;
  const representatives = data.representatives as unknown as { id: number }[] | null;

  return {
    id: data.id,
    email: data.email,
    nama: data.nama,
    peran,
    izin,
    participantId: participants?.[0]?.id,
    representativeId: representatives?.[0]?.id,
  };
}

/** Rejects anonymous callers. */
export const wajibLogin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> =
  async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new AppError('TIDAK_LOGIN');

    const klaim = await verifikasiToken(token, c.env.SUPABASE_JWT_SECRET);
    c.set('pengguna', await muatPengguna(c.env, klaim.sub));
    await next();
  };

/** Attaches the caller when a token is present, but lets anonymous through. */
export const loginOpsional: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> =
  async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) {
      try {
        const klaim = await verifikasiToken(token, c.env.SUPABASE_JWT_SECRET);
        c.set('pengguna', await muatPengguna(c.env, klaim.sub));
      } catch {
        // An invalid token on a public route is simply ignored.
      }
    }
    await next();
  };
