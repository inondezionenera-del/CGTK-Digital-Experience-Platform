import type { Context } from 'hono';

/**
 * Response envelope. Every endpoint answers in the same shape so the frontend
 * can handle success and failure in one place.
 *
 *   { "sukses": true,  "data": {...}, "meta": {...} }
 *   { "sukses": false, "error": { "kode", "pesan", "detail" } }
 */

export interface Meta {
  halaman?: number;
  per_halaman?: number;
  total?: number;
  total_halaman?: number;
  [k: string]: unknown;
}

export function ok<T>(c: Context, data: T, meta?: Meta) {
  return c.json({ sukses: true, data, ...(meta ? { meta } : {}) });
}

export function dibuat<T>(c: Context, data: T, meta?: Meta) {
  return c.json({ sukses: true, data, ...(meta ? { meta } : {}) }, 201);
}

export function kosong(c: Context) {
  return c.body(null, 204);
}

export function halaman<T>(c: Context, rows: T[], total: number, hal: number, per: number) {
  return c.json({
    sukses: true,
    data: rows,
    meta: {
      halaman: hal,
      per_halaman: per,
      total,
      total_halaman: Math.max(1, Math.ceil(total / per)),
    },
  });
}

/** Reads ?halaman= & ?per_halaman= with sane bounds. */
export function bacaPaginasi(c: Context, perDefault = 25) {
  const hal = Math.max(1, Number(c.req.query('halaman') ?? 1) || 1);
  const per = Math.min(200, Math.max(1, Number(c.req.query('per_halaman') ?? perDefault) || perDefault));
  return { hal, per, dari: (hal - 1) * per, sampai: hal * per - 1 };
}
