import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Env, Variables } from './env';
import { tangkapError, tidakDitemukan } from './middleware/error';
import { batasi, BATAS } from './middleware/ratelimit';
import { db } from './lib/db';

import auth from './modules/auth';
import registrations from './modules/registrations';
import payments from './modules/payments';
import attendance from './modules/attendance';
import booths from './modules/booths';
import materials from './modules/materials';
import events from './modules/events';
import master from './modules/master';
import content from './modules/content';
import admin from './modules/admin';
import lo from './modules/lo';
import alumni from './modules/alumni';
import proxy, { PREFIKS_DANAR } from './modules/proxy';

/**
 * Route table.
 *
 * Admin routes live under their own module (`/payments/admin/...`) rather than
 * under a shared `/admin` tree. One module owns one prefix, so a permission
 * mistake is contained to the file that caused it.
 */

const api = new Hono<{ Bindings: Env; Variables: Variables }>();
const app = api;

app.onError(tangkapError);
app.notFound(tidakDitemukan);

// -----------------------------------------------------------------------------
// Cross-cutting middleware
// -----------------------------------------------------------------------------

app.use('*', secureHeaders());

/**
 * CORS.
 *
 * In production the frontend is served by Cloudflare Pages on the same
 * hostname, so a browser never sends a preflight and this is effectively dead
 * code. It exists for `wrangler dev` on :8787 against Vite on :5173, and for
 * the preview deployments the frontend team works on.
 *
 * ALLOWED_ORIGINS is a comma-separated list. An unset value in production means
 * same-origin only — deliberately the strict default, since getting this wrong
 * in the permissive direction is what leaks a session token.
 */
app.use('*', (c, next) => {
  const daftar = (c.env.ALLOWED_ORIGINS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  return cors({
    origin: (asal) => {
      if (!asal) return undefined;
      if (daftar.includes(asal)) return asal;
      if (c.env.ENVIRONMENT === 'development' && /^http:\/\/localhost:\d+$/.test(asal)) {
        return asal;
      }
      return undefined;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
    maxAge: 86400,
  })(c, next);
});

/**
 * Request log.
 *
 * One line per request, and the duration is the part that matters: the number
 * we care about on the day is how long a scan takes, and that is only visible
 * if it was measured while the queue was actually forming.
 *
 * No request bodies are logged. They carry QR tokens.
 */
app.use('*', async (c, next) => {
  const mulai = Date.now();
  await next();
  console.log(JSON.stringify({
    m: c.req.method,
    p: c.req.path,
    s: c.res.status,
    ms: Date.now() - mulai,
    u: c.get('pengguna')?.id ?? null,
  }));
});

// A blanket ceiling. Tighter per-route limits are applied inside the modules
// that need them.
app.use('*', batasi(BATAS.umum));

// -----------------------------------------------------------------------------
// Health
// -----------------------------------------------------------------------------

app.get('/', (c) => c.json({
  nama: 'CGTK 2027 — API',
  versi: 1,
  lingkungan: c.env.ENVIRONMENT,
}));

/**
 * GET /health
 *
 * Touches the database rather than just answering 200, because the failure
 * this needs to catch is "the Worker is up and Supabase is not" — an uptime
 * monitor that only pings the Worker would report everything green while no
 * participant can check in.
 */
app.get('/health', async (c) => {
  const mulai = Date.now();
  let database = 'ok';
  try {
    const { error } = await db(c.env)
      .from('settings').select('kunci', { count: 'exact', head: true }).limit(1);
    if (error) database = 'error';
  } catch {
    database = 'error';
  }

  const sehat = database === 'ok';
  return c.json({
    status: sehat ? 'ok' : 'gagal',
    database,
    ms: Date.now() - mulai,
    waktu: new Date().toISOString(),
  }, sehat ? 200 : 503);
});

// -----------------------------------------------------------------------------
// Modules
// -----------------------------------------------------------------------------

app.route('/auth', auth);
app.route('/payments', payments);
app.route('/attendance', attendance);
app.route('/booths', booths);
app.route('/materials', materials);
app.route('/events', events);
app.route('/lo', lo);
app.route('/alumni', alumni);

// Danar's modules, in his own Python service, reached through this Worker so the
// frontend sees one origin and one token.
for (const p of PREFIKS_DANAR) app.route(`/${p}`, proxy);

// Mounted at the root: these own top-level nouns of their own
// (/registrations, /participants, /qr, /universities, /majors,
// /representatives, /announcements, /sponsors, /pages, /settings,
// /form_fields, /activities, /points, /audit, /exports).
app.route('/', registrations);
app.route('/', master);
app.route('/', content);
app.route('/', admin);

/**
 * The API Contract gives the base URL as `https://cgtk.my.id/api/v1`, so every
 * route answers under that prefix as well as at the root. Same router, two
 * spellings: the prefix is what the frontend team codes against, and the bare
 * path is what a Worker route without a prefix receives.
 */
const root = new Hono<{ Bindings: Env; Variables: Variables }>();
root.onError(tangkapError);
root.notFound(tidakDitemukan);
root.route('/api/v1', api);
root.route('/', api);

export default root;
