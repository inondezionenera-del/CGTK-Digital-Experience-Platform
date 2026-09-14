import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db } from '../lib/db';
import { AppError } from '../lib/errors';
import { ok, kosong } from '../lib/respond';
import { wajibLogin, verifikasiToken } from '../middleware/auth';
import { batasi, BATAS } from '../middleware/ratelimit';

/**
 * Authentication.
 *
 * Sign-in itself is handled by Supabase Auth on the client. What happens here
 * is the part that follows: creating the application row on first arrival,
 * matching alumni invitations by email, and deciding where the person lands.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Where a person goes after signing in.
 *
 * Returned by the server rather than decided in the browser. Eight branches
 * duplicated across two codebases will drift apart, and the bug that follows is
 * hard to see: someone lands on the wrong page and assumes they lack access.
 */
async function tujuan(env: Env, userId: string, peran: string): Promise<string> {
  switch (peran) {
    case 'PESERTA': {
      const { data } = await db(env)
        .from('registrations').select('status').eq('user_id', userId).maybeSingle();
      if (!data) return '/register';
      return data.status === 'LUNAS' ? '/dashboard' : '/bayar';
    }
    case 'ALUMNI': {
      const { data } = await db(env)
        .from('representatives').select('bio, foto_url').eq('user_id', userId).maybeSingle();
      // First visit goes to the welcome page — alumni never attend a briefing,
      // so without it they arrive knowing nothing about the day.
      return data?.bio || data?.foto_url ? '/alumni' : '/alumni/sambutan';
    }
    case 'LO_PENDIDIKAN': return '/lo';
    case 'SUPER_ADMIN':
    case 'DIV_ADMINISTRASI':
    case 'DIV_ACARA':
    case 'DIV_PENDANAAN':   return '/admin';
    default:                return '/dashboard';
  }
}

// -----------------------------------------------------------------------------
// POST /auth/sinkron
//
// Called once, right after Supabase Auth returns a session. Creates the
// application row if this is a first sign-in, then answers with the role,
// permissions and destination.
// -----------------------------------------------------------------------------
const skemaSinkron = z.object({ access_token: z.string().min(20) });

app.post('/sinkron', batasi(BATAS.auth), async (c) => {
  const body = skemaSinkron.parse(await c.req.json());
  const klaim = await verifikasiToken(body.access_token, c.env.SUPABASE_JWT_SECRET);

  const email = String(klaim.email ?? '').toLowerCase();
  if (!email) throw new AppError('KODE_GOOGLE_TIDAK_VALID');

  const nama = String(
    (klaim.user_metadata as Record<string, unknown> | undefined)?.['full_name'] ??
    (klaim.user_metadata as Record<string, unknown> | undefined)?.['name'] ??
    email.split('@')[0],
  );
  const foto = (klaim.user_metadata as Record<string, unknown> | undefined)?.['avatar_url'] as string | undefined;

  let { data: user } = await db(c.env)
    .from('users').select('id, status, roles!inner(kode)').eq('id', klaim.sub).maybeSingle();

  let akunBaru = false;

  if (!user) {
    akunBaru = true;

    // An alumnus is recognised by their invitation. Matching on email is what
    // lets campus and major be filled in before they ever sign in, so they
    // never have to pick a booth themselves.
    const { data: undangan } = await db(c.env)
      .from('representatives')
      .select('id, university_id, major_id')
      .eq('email_undangan', email)
      .is('user_id', null)
      .maybeSingle();

    const kodePeran = undangan ? 'ALUMNI' : 'PESERTA';
    const { data: peran } = await db(c.env)
      .from('roles').select('id').eq('kode', kodePeran).single();

    // Seeded by 0010. If it is missing the seed never ran, and creating the
    // account without a role would leave someone permanently unable to sign in
    // with no way to tell why.
    if (!peran) throw new AppError('ERROR_SERVER', { pesan: `Peran ${kodePeran} belum ada di database` });

    // id mirrors the Supabase auth uid, so no separate mapping table is needed.
    const { data: baru, error } = await db(c.env)
      .from('users')
      .insert({ id: klaim.sub, email, nama, foto_url: foto ?? null, role_id: peran.id })
      .select('id, status, roles!inner(kode)')
      .single();

    if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
    user = baru;

    if (undangan) {
      await db(c.env).from('representatives')
        .update({ user_id: klaim.sub, status: 'AKTIF' })
        .eq('id', undangan.id);
    }
  }

  if (user.status !== 'AKTIF') throw new AppError('AKUN_DINONAKTIFKAN');

  await db(c.env).from('users')
    .update({ terakhir_login: new Date().toISOString() }).eq('id', klaim.sub);

  const peranKode = (user.roles as unknown as { kode: string }).kode;

  const { data: izinRows } = await db(c.env)
    .from('role_permissions')
    .select('permissions!inner(kode), roles!inner(kode)')
    .eq('roles.kode', peranKode);

  const izin = (izinRows ?? [])
    .map((r) => (r.permissions as unknown as { kode: string })?.kode)
    .filter(Boolean);

  return ok(c, {
    pengguna: { id: klaim.sub, email, nama, foto_url: foto ?? null, peran: peranKode, izin },
    arahkan_ke: await tujuan(c.env, klaim.sub, peranKode),
    akun_baru: akunBaru,
  });
});

// -----------------------------------------------------------------------------
// GET /auth/saya
// -----------------------------------------------------------------------------
app.get('/saya', wajibLogin, async (c) => {
  const p = c.get('pengguna');

  let peserta = null;
  if (p.participantId) {
    const { data: reg } = await db(c.env)
      .from('registrations').select('status, kode_registrasi, profil_lengkap')
      .eq('user_id', p.id).maybeSingle();

    const { data: part } = await db(c.env)
      .from('participants').select('qr_token').eq('id', p.participantId).maybeSingle();

    const { data: xp } = await db(c.env).rpc('total_xp', { p_participant_id: p.participantId });
    const { data: level } = await db(c.env).rpc('level_peserta', { p_total_xp: xp ?? 0 });

    peserta = {
      id: p.participantId,
      status_bayar: reg?.status ?? null,
      kode_registrasi: reg?.kode_registrasi ?? null,
      profil_lengkap: reg?.profil_lengkap ?? false,
      qr_aktif: Boolean(part?.qr_token),
      total_xp: xp ?? 0,
      level,
    };
  }

  return ok(c, {
    id: p.id, nama: p.nama, email: p.email,
    peran: p.peran, izin: p.izin,
    peserta,
    alumni: p.representativeId ? { representative_id: p.representativeId } : null,
  });
});

// -----------------------------------------------------------------------------
// GET /auth/izin
//
// Used by the frontend to hide buttons. Convenience only — every endpoint
// re-checks on the server, because anyone can call the API directly.
// -----------------------------------------------------------------------------
app.get('/izin', wajibLogin, (c) => ok(c, c.get('pengguna').izin));

app.post('/logout', wajibLogin, (c) => kosong(c));

export default app;
