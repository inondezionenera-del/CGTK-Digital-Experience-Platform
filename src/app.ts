import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Env, Variables } from './env';
import { tangkapError, tidakDitemukan } from './middleware/error';
import { batasi, BATAS } from './middleware/ratelimit';
import { loginOpsional } from './middleware/auth';
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
import gamifikasi from './modules/gamifikasi';

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

/**
 * Identitas pemanggil, dipasang SEBELUM pembatas laju. Urutannya yang penting.
 *
 * Pembatas laju memakai id pengguna sebagai kunci dan jatuh ke alamat IP kalau
 * tidak ada. Selama ini wajibLogin cuma dipasang per rute di dalam modul, jadi
 * saat pembatas laju berjalan belum ada satu pun yang menaruh pengguna di
 * context: kuncinya SELALU alamat IP, untuk semua orang.
 *
 * Di hari acara semua panitia dan lima ratus peserta berada di satu WiFi
 * venue, dan satu WiFi berarti satu alamat IP. Artinya mereka semua berbagi
 * satu jatah 120 permintaan per menit, dan aplikasinya akan menjawab 429 ke
 * semua orang beberapa menit setelah acara dimulai.
 *
 * Ketahuan waktu menguji halaman admin lewat browser: berpindah belasan
 * halaman dalam satu menit sudah cukup untuk kena.
 *
 * loginOpsional membiarkan yang anonim lewat, jadi halaman publik tidak ikut
 * terkunci. Yang anonim tetap dibatasi per IP, dan memang begitu seharusnya.
 */
app.use('*', loginOpsional);

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

/**
 * Kuis, misi, achievement, papan peringkat.
 *
 * Dijawab di Worker ini, bukan diteruskan ke layanan Python. Alasannya ada di
 * src/modules/gamifikasi.ts: tanpa ini keempat awalan itu menjawab 503 selama
 * layanan Python belum di-deploy, dan bentuk jawaban FastAPI juga tidak cocok
 * dengan amplop { sukses, data } yang dibaca frontend.
 *
 * Didaftarkan sebelum proxy supaya yang di sini yang menang.
 */
app.route('/', gamifikasi);

// Sisa modul Danar yang masih di layanan Python-nya, lewat Worker ini supaya
// frontend tetap melihat satu origin dan satu token. Tidak ada halaman yang
// memanggilnya sekarang, jadi 503-nya tidak terlihat peserta.
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
