import type { MiddlewareHandler } from 'hono';
import type { Env, Variables } from '../env';
import { AppError } from '../lib/errors';

/**
 * Rate limiting.
 *
 * The scanner runs in "fast mode" — under a second per participant. A frontend
 * bug that re-reads the same QR without a cooldown could fire hundreds of
 * requests a second from one phone and burn through the free tier on the
 * morning of the event. This is the backstop for that.
 *
 * Uses a fixed window in KV. Approximate at the boundaries, which is fine for
 * what it guards against. Without a KV binding it does nothing rather than
 * failing closed — losing rate limiting is survivable, refusing every scan is
 * not.
 */

export interface OpsiBatas {
  /** Requests allowed inside the window. */
  maks: number;
  /** Window length in seconds. */
  jendela: number;
  /** Bucket name, so different routes do not share a counter. */
  nama: string;
}

export function batasi(opsi: OpsiBatas): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const kv = c.env.RATE_LIMIT;
    if (!kv) return next();

    const pengguna = c.get('pengguna');
    const identitas =
      pengguna?.id ??
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for') ??
      'anon';

    const bucket = Math.floor(Date.now() / (opsi.jendela * 1000));
    const kunci = `rl:${opsi.nama}:${identitas}:${bucket}`;

    const sekarang = Number((await kv.get(kunci)) ?? 0);

    if (sekarang >= opsi.maks) {
      c.header('Retry-After', String(opsi.jendela));
      throw new AppError('TERLALU_SERING', { batas: opsi.maks, jendela_detik: opsi.jendela });
    }

    // Not atomic — two simultaneous requests can both read the same value.
    // Being off by one or two at the edge does not matter for a guard rail.
    c.executionCtx.waitUntil(
      kv.put(kunci, String(sekarang + 1), { expirationTtl: opsi.jendela + 10 }),
    );

    await next();
  };
}

/** Limits from the API contract. */
export const BATAS = {
  auth:      { nama: 'auth',   maks: 10,  jendela: 60 },
  scan:      { nama: 'scan',   maks: 30,  jendela: 60 },
  sync:      { nama: 'sync',   maks: 5,   jendela: 60 },
  cekStatus: { nama: 'cek',    maks: 10,  jendela: 60 },
  umum:      { nama: 'umum',   maks: 120, jendela: 60 },
} as const;
