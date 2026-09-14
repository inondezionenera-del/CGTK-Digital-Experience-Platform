import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { ZodError } from 'zod';
import { AppError, ERRORS } from '../lib/errors';
import type { Env, Variables } from '../env';

/**
 * Central error handling.
 *
 * Two rules:
 *   1. Answer in the same envelope as everything else, so the frontend has one
 *      code path for failure.
 *   2. Never leak a stack trace or a database message to the caller. Those go
 *      to the log, where they belong.
 */

export const tangkapError: ErrorHandler<{ Bindings: Env; Variables: Variables }> = (err, c) => {
  if (err instanceof AppError) {
    return c.json(err.toJSON(), err.status as never);
  }

  if (err instanceof ZodError) {
    return c.json({
      sukses: false,
      error: {
        kode: 'DATA_TIDAK_VALID',
        pesan: ERRORS.DATA_TIDAK_VALID.pesan,
        detail: err.issues.map((i) => ({
          field: i.path.join('.'),
          pesan: i.message,
        })),
      },
    }, 400);
  }

  console.error('unhandled error', {
    path: c.req.path,
    method: c.req.method,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return c.json({
    sukses: false,
    error: { kode: 'ERROR_SERVER', pesan: ERRORS.ERROR_SERVER.pesan },
  }, 500);
};

export const tidakDitemukan: NotFoundHandler<{ Bindings: Env; Variables: Variables }> = (c: Context) =>
  c.json({
    sukses: false,
    error: { kode: 'TIDAK_DITEMUKAN', pesan: `Endpoint ${c.req.method} ${c.req.path} tidak ada` },
  }, 404);
