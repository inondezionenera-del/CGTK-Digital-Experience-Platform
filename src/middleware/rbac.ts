import type { MiddlewareHandler } from 'hono';
import type { Env, Variables } from '../env';
import { AppError } from '../lib/errors';
import { db } from '../lib/db';

/**
 * Authorisation.
 *
 * Checked here, on the server, every time. The frontend also hides buttons a
 * role cannot use, but that is a courtesy to the user — not a control. Anyone
 * can call the endpoint directly.
 */

/** Requires one of the listed permissions. */
export function butuhIzin(...izin: string[]): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const p = c.get('pengguna');
    if (!p) throw new AppError('TIDAK_LOGIN');
    if (!izin.some((i) => p.izin.includes(i))) {
      throw new AppError('TIDAK_BERHAK', { butuh: izin });
    }
    await next();
  };
}

/** Requires one of the listed roles. Prefer butuhIzin() — roles change, permissions do not. */
export function butuhPeran(...peran: string[]): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const p = c.get('pengguna');
    if (!p) throw new AppError('TIDAK_LOGIN');
    if (!peran.includes(p.peran)) throw new AppError('TIDAK_BERHAK', { butuh: peran });
    await next();
  };
}

/**
 * Requires a participant whose payment has been settled.
 *
 * Everything a participant does — the quiz, the passport, missions — sits
 * behind this. The QR is only issued once Administration marks the payment, so
 * an unsettled account has nothing to scan either.
 */
export const wajibLunas: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> =
  async (c, next) => {
    const p = c.get('pengguna');
    if (!p) throw new AppError('TIDAK_LOGIN');
    if (!p.participantId) throw new AppError('TIDAK_BERHAK');

    const { data } = await db(c.env)
      .from('registrations')
      .select('status')
      .eq('user_id', p.id)
      .maybeSingle();

    if (data?.status !== 'LUNAS') throw new AppError('BELUM_BAYAR');
    await next();
  };

/** Requires an alumnus with an activated invitation. */
export const wajibAlumni: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> =
  async (c, next) => {
    const p = c.get('pengguna');
    if (!p) throw new AppError('TIDAK_LOGIN');
    if (!p.representativeId) throw new AppError('BUKAN_ALUMNI');
    await next();
  };

export const SUPER_ADMIN = 'SUPER_ADMIN';

export const wajibSuperAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> =
  async (c, next) => {
    const p = c.get('pengguna');
    if (!p) throw new AppError('TIDAK_LOGIN');
    if (p.peran !== SUPER_ADMIN) throw new AppError('TIDAK_BERHAK');
    await next();
  };
