import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError } from '../lib/errors';
import { ok, dibuat } from '../lib/respond';
import { wajibLogin, loginOpsional } from '../middleware/auth';
import { butuhIzin } from '../middleware/rbac';

/**
 * Events and sessions.
 *
 * Nothing about the agenda is fixed in code: the Events division decides how
 * many days, how many events, and what kind each one is. When they change their
 * minds — and they will — nobody has to be called.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// -----------------------------------------------------------------------------
// GET /events
// -----------------------------------------------------------------------------
app.get('/', async (c) => {
  const { data, error } = await db(c.env)
    .from('events')
    .select('id, nama, tipe, tanggal, deskripsi, urutan')
    .eq('aktif', true)
    .order('urutan');

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return ok(c, data ?? []);
});

// -----------------------------------------------------------------------------
// GET /sessions  — the participant timeline
// -----------------------------------------------------------------------------
app.get('/sessions', loginOpsional, async (c) => {
  const eventId = c.req.query('event_id');
  const p = c.get('pengguna');

  let q = db(c.env)
    .from('sessions')
    .select('id, nama, lokasi, jam_mulai, jam_selesai, status, xp, urutan, events!inner(id, nama, tipe, tanggal)')
    .neq('status', 'DRAFT')     // drafts are not shown to participants at all
    .order('urutan');

  if (eventId) q = q.eq('event_id', Number(eventId));

  const { data, error } = await q;
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  let hadir = new Set<number>();
  if (p) {
    const { data: att } = await db(c.env)
      .from('attendances').select('session_id').eq('user_id', p.id);
    hadir = new Set((att ?? []).map((a) => a.session_id));
  }

  return ok(c, (data ?? []).map((s) => ({
    ...s,
    // The LIVE badge comes from status, never from the clock. A schedule that
    // slips twenty minutes is normal here, and a time-derived badge would send
    // participants to the wrong room.
    saya_sudah_hadir: hadir.has(s.id),
  })));
});

app.get('/sessions/live', async (c) => {
  const { data } = await db(c.env)
    .from('sessions')
    .select('id, nama, lokasi, jam_mulai, jam_selesai, xp, events(nama, tipe)')
    .eq('status', 'ACTIVE')
    .order('urutan');
  return ok(c, data ?? []);
});

// =============================================================================
// ADMIN — events
// =============================================================================

const skemaEvent = z.object({
  nama: z.string().min(2).max(120),
  tipe: z.enum(['PEMBUKAAN', 'EXPO_KAMPUS', 'EXPO_JURUSAN', 'PENUTUPAN', 'LAINNYA']),
  tanggal: z.string().date().nullable().optional(),
  deskripsi: z.string().max(1000).optional(),
  urutan: z.coerce.number().int().optional(),
  aktif: z.boolean().optional(),
});

app.post('/admin', wajibLogin, butuhIzin('KELOLA_JADWAL'), async (c) => {
  const body = skemaEvent.parse(await c.req.json());
  const { data, error } = await db(c.env).from('events').insert(body).select('*').single();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return dibuat(c, data);
});

app.patch('/admin/:id', wajibLogin, butuhIzin('KELOLA_JADWAL'), async (c) => {
  const body = skemaEvent.partial().parse(await c.req.json());
  const { data, error } = await db(c.env)
    .from('events').update(body).eq('id', Number(c.req.param('id')))
    .select('*').maybeSingle();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

app.delete('/admin/:id', wajibLogin, butuhIzin('KELOLA_JADWAL'), async (c) => {
  const { error } = await db(c.env).from('events').delete().eq('id', Number(c.req.param('id')));
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return ok(c, { dihapus: true });
});

// =============================================================================
// ADMIN — sessions
// =============================================================================

const skemaSesi = z.object({
  event_id: z.coerce.number().int().positive(),
  nama: z.string().min(2).max(120),
  lokasi: z.string().max(120).optional(),
  jam_mulai: z.string().datetime({ offset: true }).nullable().optional(),
  jam_selesai: z.string().datetime({ offset: true }).nullable().optional(),
  xp: z.coerce.number().int().min(0).max(1000).optional(),
  wajib_presensi: z.boolean().optional(),
  urutan: z.coerce.number().int().optional(),
});

app.post('/sessions/admin', wajibLogin, butuhIzin('KELOLA_JADWAL'), async (c) => {
  const body = skemaSesi.parse(await c.req.json());
  const { data, error } = await db(c.env).from('sessions').insert(body).select('*').single();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return dibuat(c, data);
});

app.patch('/sessions/admin/:id', wajibLogin, butuhIzin('KELOLA_JADWAL'), async (c) => {
  const body = skemaSesi.partial().parse(await c.req.json());
  const { data, error } = await db(c.env)
    .from('sessions').update(body).eq('id', Number(c.req.param('id')))
    .select('*').maybeSingle();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

// -----------------------------------------------------------------------------
// PATCH /sessions/admin/:id/saklar
//
// The single most consequential button on the day. Flipping a session to CLOSED
// locks every field scanner for it, instantly.
// -----------------------------------------------------------------------------
app.patch('/sessions/admin/:id/saklar', wajibLogin, butuhIzin('SAKLAR_SESI'), async (c) => {
  const p = c.get('pengguna');
  const body = z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']) })
    .parse(await c.req.json());

  const id = Number(c.req.param('id'));
  const { data: lama } = await db(c.env)
    .from('sessions').select('status, nama').eq('id', id).maybeSingle();
  if (!lama) throw new AppError('SESI_TIDAK_DITEMUKAN');

  const { data, error } = await db(c.env)
    .from('sessions').update({ status: body.status }).eq('id', id)
    .select('id, nama, status').single();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  await rpc(c.env, 'catat_audit', {
    p_user_id: p.id, p_aksi: 'SAKLAR_SESI',
    p_tabel: 'sessions', p_record_id: String(id),
    p_sebelum: { status: lama.status }, p_sesudah: { status: body.status },
  });

  return ok(c, {
    ...data,
    diubah_oleh: p.nama,
    diubah_at: new Date().toISOString(),
  });
});

app.delete('/sessions/admin/:id', wajibLogin, butuhIzin('KELOLA_JADWAL'), async (c) => {
  const { error } = await db(c.env).from('sessions').delete().eq('id', Number(c.req.param('id')));
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return ok(c, { dihapus: true });
});

export default app;
