import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError } from '../lib/errors';
import { ok, dibuat, kosong } from '../lib/respond';
import * as setting from '../lib/settings';
import { wajibLogin } from '../middleware/auth';
import { butuhIzin } from '../middleware/rbac';

/**
 * Announcements, sponsors and static pages.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// =============================================================================
// ANNOUNCEMENTS
// =============================================================================

app.get('/announcements', async (c) => {
  const { data } = await db(c.env)
    .from('announcements')
    .select('id, judul, isi, tingkat, created_at')
    .eq('aktif', true)
    .or(`berlaku_sampai.is.null,berlaku_sampai.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(50);
  return ok(c, data ?? []);
});

/**
 * GET /announcements/terbaru?sejak=
 *
 * The delivery mechanism for urgent notices. Polling, not Realtime: the free
 * tier allows 200 concurrent Realtime connections and the expected peak is
 * 250–300, so the connections past the cap would receive nothing at all — and
 * silently, which is the part that would hurt.
 *
 * 204 when there is nothing new keeps the common case near-empty on the wire.
 * At roughly ten requests a second that is a few dozen megabytes across the
 * whole day, against a 5 GB allowance.
 */
app.get('/announcements/terbaru', wajibLogin, async (c) => {
  const sejak = c.req.query('sejak');
  const sekarang = new Date().toISOString();

  let q = db(c.env)
    .from('announcements')
    .select('id, judul, isi, tingkat, created_at')
    .eq('aktif', true)
    .order('created_at', { ascending: false })
    .limit(5);

  if (sejak) q = q.gt('created_at', sejak);

  const { data } = await q;
  if (!data?.length) return kosong(c);

  // The client echoes meta.server_time back as `sejak`. Phone clocks drift, and
  // a participant whose clock runs fast would silently skip notices.
  return c.json({ sukses: true, data, meta: { server_time: sekarang } });
});

const skemaPengumuman = z.object({
  judul: z.string().min(2).max(160),
  isi: z.string().min(2).max(2000),
  tingkat: z.enum(['BIASA', 'DARURAT']).default('BIASA'),
  berlaku_sampai: z.string().datetime({ offset: true }).nullable().optional(),
});

app.post('/announcements/admin', wajibLogin, butuhIzin('KIRIM_PENGUMUMAN'), async (c) => {
  const p = c.get('pengguna');
  const body = skemaPengumuman.parse(await c.req.json());

  const { data, error } = await db(c.env)
    .from('announcements').insert({ ...body, dibuat_oleh: p.id })
    .select('*').single();

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  await rpc(c.env, 'catat_audit', {
    p_user_id: p.id, p_aksi: 'KIRIM_PENGUMUMAN',
    p_tabel: 'announcements', p_record_id: String(data.id), p_sesudah: data,
  });

  return dibuat(c, data);
});

app.patch('/announcements/admin/:id', wajibLogin, butuhIzin('KIRIM_PENGUMUMAN'), async (c) => {
  const body = skemaPengumuman.partial().extend({ aktif: z.boolean().optional() })
    .parse(await c.req.json());
  const { data, error } = await db(c.env)
    .from('announcements').update(body).eq('id', Number(c.req.param('id')))
    .select('*').maybeSingle();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

app.delete('/announcements/admin/:id', wajibLogin, butuhIzin('KIRIM_PENGUMUMAN'), async (c) => {
  await db(c.env).from('announcements').update({ aktif: false })
    .eq('id', Number(c.req.param('id')));
  return ok(c, { dinonaktifkan: true });
});

// =============================================================================
// SPONSORS
// =============================================================================

/**
 * Grouped by tier, because that is how they are drawn: tier decides logo size
 * and which row, `urutan` decides position within the row.
 *
 * The dashboard / leaderboard / cosmetics slots sit behind a switch that is
 * currently off. Empty slots collapse rather than leaving a blank frame, so a
 * participant sees nothing at all until Fundraising actually sells one.
 */
app.get('/sponsors', async (c) => {
  const penempatan = c.req.query('penempatan') ?? 'landing';

  if (['dashboard', 'leaderboard', 'kosmetik'].includes(penempatan)) {
    if (!(await setting.boolean_(c.env, 'sponsor_slots_enabled', false))) {
      return ok(c, { PLATINUM: [], GOLD: [], SILVER: [], MEDIA_PARTNER: [] });
    }
  }

  const { data } = await db(c.env)
    .from('sponsors')
    .select('id, nama, logo_url, tier, url, urutan')
    .eq('aktif', true)
    .contains('penempatan', [penempatan])
    .order('urutan');

  const dikelompokkan: Record<string, unknown[]> = {
    PLATINUM: [], GOLD: [], SILVER: [], MEDIA_PARTNER: [],
  };
  for (const s of data ?? []) dikelompokkan[s.tier]?.push(s);

  return ok(c, dikelompokkan);
});

const skemaSponsor = z.object({
  nama: z.string().min(1).max(120),
  logo_url: z.string().url(),
  tier: z.enum(['PLATINUM', 'GOLD', 'SILVER', 'MEDIA_PARTNER']),
  url: z.string().url().nullable().optional(),
  urutan: z.coerce.number().int().min(0).optional(),
  penempatan: z.array(z.enum(['landing', 'footer', 'dashboard', 'leaderboard', 'kosmetik'])).optional(),
  aktif: z.boolean().optional(),
});

app.get('/sponsors/admin', wajibLogin, butuhIzin('KELOLA_SPONSOR'), async (c) => {
  const { data } = await db(c.env).from('sponsors').select('*').order('tier').order('urutan');
  return ok(c, data ?? []);
});

app.post('/sponsors/admin', wajibLogin, butuhIzin('KELOLA_SPONSOR'), async (c) => {
  const body = skemaSponsor.parse(await c.req.json());
  const { data, error } = await db(c.env).from('sponsors').insert(body).select('*').single();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return dibuat(c, data);
});

app.patch('/sponsors/admin/:id', wajibLogin, butuhIzin('KELOLA_SPONSOR'), async (c) => {
  const body = skemaSponsor.partial().parse(await c.req.json());
  const { data, error } = await db(c.env)
    .from('sponsors').update(body).eq('id', Number(c.req.param('id')))
    .select('*').maybeSingle();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

app.delete('/sponsors/admin/:id', wajibLogin, butuhIzin('KELOLA_SPONSOR'), async (c) => {
  await db(c.env).from('sponsors').delete().eq('id', Number(c.req.param('id')));
  return ok(c, { dihapus: true });
});

// =============================================================================
// PAGES
// =============================================================================

app.get('/pages', async (c) => {
  const { data } = await db(c.env)
    .from('pages').select('slug, judul').eq('aktif', true).order('slug');
  return ok(c, data ?? []);
});

app.get('/pages/:slug', async (c) => {
  const { data } = await db(c.env)
    .from('pages').select('slug, judul, isi, updated_at')
    .eq('slug', c.req.param('slug')).eq('aktif', true).maybeSingle();
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

app.patch('/pages/admin/:slug', wajibLogin, butuhIzin('KELOLA_KONTEN'), async (c) => {
  const body = z.object({
    judul: z.string().min(2).max(160).optional(),
    isi: z.string().max(50_000).optional(),
    aktif: z.boolean().optional(),
  }).parse(await c.req.json());

  const { data, error } = await db(c.env)
    .from('pages').update(body).eq('slug', c.req.param('slug'))
    .select('*').maybeSingle();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

export default app;
