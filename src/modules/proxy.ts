import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { AppError } from '../lib/errors';
import { loginOpsional } from '../middleware/auth';

/**
 * Bridge to Danar's service.
 *
 * Danar writes his modules in Python. The web does not care — what crosses the
 * wire is JSON — but the frontend should not have to care either, so his service
 * is not exposed to browsers at all. It sits behind this Worker on the same
 * hostname, under the same base URL, reached with the same token.
 *
 * What that buys:
 *
 *   - One origin. No second CORS configuration, no second token to manage, and
 *     no second thing for Fariz and Haqi to learn.
 *   - Identity is verified once, here. Danar receives an already-checked user
 *     rather than reimplementing JWT verification and the permission table.
 *   - His service can move — Vercel today, somewhere else later — by changing
 *     one secret. No frontend release.
 *
 * If PYTHON_API_URL is unset, these routes answer 503 with a readable message
 * instead of failing oddly. That is the state before Danar deploys, and the
 * frontend can build against it.
 */

/** Prefixes Danar owns. Everything else stays in this Worker. */
export const PREFIKS_DANAR = [
  'quiz',
  'missions',
  'achievements',
  'leaderboard',
  'levels',
  'cosmetics',
  'reports',
] as const;

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Identity is passed as signed headers.
 *
 * Danar could verify the Supabase token himself — it is forwarded too — but then
 * the permission list would be read from the database in two places and would
 * eventually disagree. Signing it means he can trust the headers without
 * repeating the work, and without holding my Supabase keys.
 *
 * The signature covers the exact JSON body, so a header cannot be edited in
 * transit or replayed with a different user.
 */
async function tandatangani(isi: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(isi));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

app.all('/*', loginOpsional, async (c) => {
  const tujuan = c.env.PYTHON_API_URL;

  if (!tujuan) {
    throw new AppError('LAYANAN_BELUM_SIAP', undefined,
      'Fitur kuis dan gamifikasi belum dinyalakan. Bagian lain tetap berjalan normal.');
  }

  const asal = new URL(c.req.url);
  const url = new URL(asal.pathname.replace(/^\/api\/v1/, '') + asal.search, tujuan);

  const headers = new Headers();
  const teruskan = ['authorization', 'content-type', 'accept', 'accept-language'];
  for (const h of teruskan) {
    const v = c.req.header(h);
    if (v) headers.set(h, v);
  }

  const pengguna = c.get('pengguna');
  if (pengguna) {
    const isi = JSON.stringify({
      id: pengguna.id,
      peran: pengguna.peran,
      izin: pengguna.izin,
      participant_id: pengguna.participantId ?? null,
      representative_id: pengguna.representativeId ?? null,
      // Ties the signature to a moment, so a captured header stops working.
      waktu: Math.floor(Date.now() / 1000),
    });
    headers.set('X-CGTK-Pengguna', isi);
    headers.set('X-CGTK-Tanda-Tangan', await tandatangani(isi, c.env.QR_SIGNING_SECRET));
  }

  // Tells Danar's side which participant asked, for logging, and marks the hop
  // so his service can refuse anything that did not come through here.
  headers.set('X-CGTK-Lewat', 'worker');

  let jawaban: Response;
  try {
    jawaban = await fetch(url.toString(), {
      method: c.req.method,
      headers,
      body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : await c.req.raw.clone().arrayBuffer(),
      // A quiz submission that takes longer than this is broken anyway, and the
      // participant is staring at a spinner.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    // Danar's service being down must not look like my service being down —
    // otherwise the day is spent debugging the wrong half.
    console.error('proxy ke layanan python gagal', {
      path: asal.pathname,
      pesan: e instanceof Error ? e.message : String(e),
    });
    throw new AppError('LAYANAN_TIDAK_MERESPONS', undefined,
      'Fitur kuis sedang tidak bisa dihubungi. Presensi dan scan booth tetap jalan.');
  }

  const balik = new Headers(jawaban.headers);
  balik.delete('content-encoding');
  balik.delete('content-length');
  balik.set('X-CGTK-Sumber', 'python');

  return new Response(jawaban.body, { status: jawaban.status, headers: balik });
});

export default app;
