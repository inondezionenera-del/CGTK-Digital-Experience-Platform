import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError } from '../lib/errors';
import { ok, dibuat } from '../lib/respond';
import { wajibLogin } from '../middleware/auth';
import { butuhIzin } from '../middleware/rbac';

/**
 * Master data: campuses, majors, the link between them, and alumni.
 *
 * The campus↔major link is not decoration. Without it the quiz can recommend a
 * field of study but not a place to go and hear about it — and participants
 * need both, because Event 2 is organised by campus and Event 3 by major.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// =============================================================================
// UNIVERSITIES
// =============================================================================

app.get('/universities', async (c) => {
  const cari = (c.req.query('cari') ?? '').trim();
  let q = db(c.env)
    .from('universities')
    .select('id, nama, singkatan, logo_url, kota, akreditasi, website, warna_khas')
    .eq('aktif', true)
    .order('nama');

  if (cari) q = q.or(`nama.ilike.%${cari}%,singkatan.ilike.%${cari}%`);

  const { data, error } = await q;
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  // How many alumni are actually on site — so the directory shows who is
  // waiting, not just a list of logos.
  const hasil = [];
  for (const u of data ?? []) {
    const { count } = await db(c.env)
      .from('representatives')
      .select('id', { count: 'exact', head: true })
      .eq('university_id', u.id).eq('status', 'AKTIF');
    hasil.push({ ...u, jumlah_alumni: count ?? 0 });
  }

  return ok(c, hasil);
});

app.get('/universities/:id', async (c) => {
  const id = Number(c.req.param('id'));

  const { data } = await db(c.env)
    .from('universities').select('*').eq('id', id).maybeSingle();
  if (!data) throw new AppError('TIDAK_DITEMUKAN');

  const [{ data: jurusan }, { data: alumni }, { data: materi }, { data: booth }] =
    await Promise.all([
      db(c.env).from('university_majors')
        .select('majors!inner(id, nama, rumpun)').eq('university_id', id),
      db(c.env).from('representatives')
        .select('id, angkatan, bio, foto_url, users(nama), majors(nama)')
        .eq('university_id', id).eq('status', 'AKTIF'),
      db(c.env).from('materials')
        .select('id, judul, tipe, url, akses')
        .eq('university_id', id).eq('aktif', true).eq('akses', 'PUBLIK').order('urutan'),
      db(c.env).from('booths')
        .select('id, nama_tampilan, lokasi, status, events(nama, tipe)')
        .eq('university_id', id).neq('status', 'DRAFT'),
    ]);

  return ok(c, {
    ...data,
    jurusan: (jurusan ?? []).map((j) => j.majors),
    alumni: alumni ?? [],
    materi: materi ?? [],
    booth: booth ?? [],
  });
});

const skemaUniv = z.object({
  nama: z.string().min(2).max(160),
  singkatan: z.string().min(1).max(20),
  logo_url: z.string().url().nullable().optional(),
  kota: z.string().max(80).optional(),
  akreditasi: z.string().max(40).optional(),
  website: z.string().url().nullable().optional(),
  warna_khas: z.string().max(20).optional(),
  aktif: z.boolean().optional(),
});

app.post('/universities/admin', wajibLogin, butuhIzin('KELOLA_MASTER'), async (c) => {
  const body = skemaUniv.parse(await c.req.json());
  const { data, error } = await db(c.env).from('universities').insert(body).select('*').single();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return dibuat(c, data);
});

app.patch('/universities/admin/:id', wajibLogin, butuhIzin('KELOLA_MASTER'), async (c) => {
  const body = skemaUniv.partial().parse(await c.req.json());
  const { data, error } = await db(c.env)
    .from('universities').update(body).eq('id', Number(c.req.param('id')))
    .select('*').maybeSingle();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

/**
 * Bulk import. Typing forty campuses into a form one at a time is the kind of
 * task that gets half-finished.
 * Body: { baris: [{ nama, singkatan, kota?, akreditasi?, website?, warna_khas? }] }
 */
app.post('/universities/admin/impor', wajibLogin, butuhIzin('KELOLA_MASTER'), async (c) => {
  const body = z.object({ baris: z.array(skemaUniv).min(1).max(500) })
    .parse(await c.req.json());

  const { data, error } = await db(c.env).from('universities').insert(body.baris).select('id');
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return dibuat(c, { dibuat: data?.length ?? 0 });
});

// =============================================================================
// MAJORS
// =============================================================================

app.get('/majors', async (c) => {
  const rumpun = c.req.query('rumpun');
  let q = db(c.env).from('majors')
    .select('id, nama, rumpun, deskripsi, prospek_kerja')
    .eq('aktif', true).order('nama');
  if (rumpun) q = q.eq('rumpun', rumpun);

  const { data, error } = await q;
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return ok(c, data ?? []);
});

app.get('/majors/rumpun', async (c) => {
  const { data } = await db(c.env).from('majors').select('rumpun').eq('aktif', true);
  return ok(c, [...new Set((data ?? []).map((m) => m.rumpun))].sort());
});

const skemaMajor = z.object({
  nama: z.string().min(2).max(160),
  rumpun: z.string().min(2).max(80),
  deskripsi: z.string().max(2000).optional(),
  prospek_kerja: z.string().max(2000).optional(),
  aktif: z.boolean().optional(),
});

app.post('/majors/admin', wajibLogin, butuhIzin('KELOLA_MASTER'), async (c) => {
  const body = skemaMajor.parse(await c.req.json());
  const { data, error } = await db(c.env).from('majors').insert(body).select('*').single();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return dibuat(c, data);
});

app.patch('/majors/admin/:id', wajibLogin, butuhIzin('KELOLA_MASTER'), async (c) => {
  const body = skemaMajor.partial().parse(await c.req.json());
  const { data, error } = await db(c.env)
    .from('majors').update(body).eq('id', Number(c.req.param('id')))
    .select('*').maybeSingle();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

// =============================================================================
// UNIVERSITY ↔ MAJOR
// =============================================================================

app.get('/universities/:id/majors', async (c) => {
  const { data } = await db(c.env)
    .from('university_majors')
    .select('majors!inner(id, nama, rumpun)')
    .eq('university_id', Number(c.req.param('id')));
  return ok(c, (data ?? []).map((r) => r.majors));
});

app.put('/universities/admin/:id/majors', wajibLogin, butuhIzin('KELOLA_MASTER'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = z.object({ major_ids: z.array(z.coerce.number().int().positive()) })
    .parse(await c.req.json());

  // PUT, so the list is replaced rather than merged — no ambiguity about
  // whether a missing id means "leave it" or "remove it".
  await db(c.env).from('university_majors').delete().eq('university_id', id);

  if (body.major_ids.length) {
    const { error } = await db(c.env).from('university_majors')
      .insert(body.major_ids.map((m) => ({ university_id: id, major_id: m })));
    if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  }

  return ok(c, { university_id: id, jumlah: body.major_ids.length });
});

// =============================================================================
// REPRESENTATIVES (alumni)
// =============================================================================

app.get('/representatives', async (c) => {
  const { data } = await db(c.env)
    .from('representatives')
    .select('id, angkatan, bio, foto_url, users(nama), universities(id, nama, singkatan, logo_url), majors(id, nama)')
    .eq('status', 'AKTIF');
  return ok(c, data ?? []);
});

/**
 * Invite an alumnus.
 *
 * Campus and major are both required. The same person mans the campus booth in
 * Event 2 and the major booth in Event 3; with one missing they end up with no
 * booth in one of the two.
 */
const skemaUndang = z.object({
  email_undangan: z.string().email(),
  university_id: z.coerce.number().int().positive(),
  major_id: z.coerce.number().int().positive(),
  angkatan: z.coerce.number().int().min(1990).max(2100).optional(),
  kontak: z.string().max(40).optional(),
});

app.post('/representatives/admin/undang', wajibLogin, butuhIzin('UNDANG_ALUMNI'), async (c) => {
  const p = c.get('pengguna');
  const body = skemaUndang.parse(await c.req.json());
  const email = body.email_undangan.toLowerCase();

  const { data: sudah } = await db(c.env)
    .from('representatives').select('id').eq('email_undangan', email).maybeSingle();
  if (sudah) throw new AppError('EMAIL_SUDAH_DIUNDANG');

  const { data: adaUser } = await db(c.env)
    .from('users').select('id, roles!inner(kode)').eq('email', email).maybeSingle();
  if (adaUser && (adaUser.roles as unknown as { kode: string }).kode === 'PESERTA') {
    throw new AppError('EMAIL_SUDAH_PESERTA');
  }

  const { data, error } = await db(c.env)
    .from('representatives')
    .insert({ ...body, email_undangan: email, status: 'DIUNDANG' })
    .select('id, email_undangan, status').single();

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  await rpc(c.env, 'catat_audit', {
    p_user_id: p.id, p_aksi: 'UNDANG_ALUMNI',
    p_tabel: 'representatives', p_record_id: String(data.id), p_sesudah: data,
  });

  return dibuat(c, data);
});

app.post('/representatives/admin/undang-massal', wajibLogin, butuhIzin('UNDANG_ALUMNI'), async (c) => {
  const body = z.object({ baris: z.array(skemaUndang).min(1).max(200) })
    .parse(await c.req.json());

  const rincian: { email: string; status: string; alasan?: string }[] = [];

  for (const b of body.baris) {
    const email = b.email_undangan.toLowerCase();
    const { error } = await db(c.env)
      .from('representatives')
      .insert({ ...b, email_undangan: email, status: 'DIUNDANG' });
    rincian.push(error
      ? { email, status: 'GAGAL', alasan: error.code === '23505' ? 'SUDAH_DIUNDANG' : error.message }
      : { email, status: 'DIUNDANG' });
  }

  const berhasil = rincian.filter((r) => r.status === 'DIUNDANG').length;
  return dibuat(c, { berhasil, gagal: rincian.length - berhasil, rincian });
});

/** Alumni fill in their own profile — this is what gives them a face in the directory. */
app.patch('/representatives/saya', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  if (!p.representativeId) throw new AppError('BUKAN_ALUMNI');

  const body = z.object({
    bio: z.string().max(300).optional(),
    foto_url: z.string().url().nullable().optional(),
    angkatan: z.coerce.number().int().min(1990).max(2100).optional(),
    kontak: z.string().max(40).optional(),
  }).parse(await c.req.json());

  const { data, error } = await db(c.env)
    .from('representatives').update(body).eq('id', p.representativeId)
    .select('id, bio, foto_url, angkatan').single();

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return ok(c, data);
});

export default app;
