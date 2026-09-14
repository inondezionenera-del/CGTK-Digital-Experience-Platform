import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db } from '../lib/db';
import { AppError } from '../lib/errors';
import { ok, dibuat } from '../lib/respond';
import { wajibLogin } from '../middleware/auth';
import { butuhIzin, wajibLunas } from '../middleware/rbac';

/**
 * Materials.
 *
 * Two visibility levels:
 *
 *   PUBLIK    — readable by anyone, any time, even before the event.
 *   DI_BOOTH  — readable once the participant has actually reached that booth,
 *               either by scanning the poster or by being scanned by an alumnus.
 *
 * Once unlocked it stays unlocked, so the slides can be read again at home and
 * carry through to the participant's report.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAKS_PER_INDUK = 5;
const MAKS_KB = 10 * 1024;

/**
 * PowerPoint is refused outright.
 *
 * A deck is routinely 20–50 MB. Forty booths uploading two each would exhaust
 * the entire 1 GB storage allowance before the event opens. A PDF export of the
 * same deck is a fraction of the size and opens on any phone without an app.
 *
 * The error message carries the way out, because alumni are guests rather than
 * technical staff — "file rejected" on its own just makes them give up and
 * message a committee member.
 */
const EKSTENSI_DITOLAK = /\.(ppt|pptx|key|odp)$/i;

// -----------------------------------------------------------------------------
// GET /universities/:id/materials  — public campus material
// -----------------------------------------------------------------------------
app.get('/universities/:id', async (c) => {
  const { data } = await db(c.env)
    .from('materials')
    .select('id, judul, tipe, url, urutan')
    .eq('university_id', Number(c.req.param('id')))
    .eq('akses', 'PUBLIK').eq('aktif', true)
    .order('urutan');
  return ok(c, data ?? []);
});

// -----------------------------------------------------------------------------
// GET /booths/:id/materials
//
// Locked items are reported as a count, never as URLs. Showing that something
// is waiting is the point — it is what makes a participant walk over rather
// than look from a distance.
// -----------------------------------------------------------------------------
app.get('/booths/:id', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  const boothId = Number(c.req.param('id'));

  const { data: semua } = await db(c.env)
    .from('materials')
    .select('id, judul, tipe, url, akses, urutan')
    .eq('booth_id', boothId).eq('aktif', true)
    .order('urutan');

  const publik = (semua ?? []).filter((m) => m.akses === 'PUBLIK');
  const terkunci = (semua ?? []).filter((m) => m.akses === 'DI_BOOTH');

  let sudahDiBooth = false;
  if (p?.participantId) {
    const { data: checkin } = await db(c.env)
      .from('booth_checkins').select('booth_id')
      .eq('participant_id', p.participantId).eq('booth_id', boothId).maybeSingle();
    sudahDiBooth = Boolean(checkin);
  }

  return ok(c, {
    sudah_di_booth: sudahDiBooth,
    publik,
    di_booth: sudahDiBooth
      ? terkunci
      : {
          jumlah: terkunci.length,
          terkunci: true,
          pesan: terkunci.length
            ? `Scan QR di meja booth untuk membuka ${terkunci.length} materi`
            : 'Belum ada materi khusus di booth ini',
        },
  });
});

// -----------------------------------------------------------------------------
// GET /materials/saya  — what this alumnus has uploaded
// -----------------------------------------------------------------------------
app.get('/saya', wajibLogin, butuhIzin('KELOLA_MATERI'), async (c) => {
  const p = c.get('pengguna');
  if (!p.representativeId) throw new AppError('BUKAN_ALUMNI');

  const { data } = await db(c.env)
    .from('materials')
    .select('id, judul, tipe, url, akses, ukuran_kb, aktif, urutan, universities(nama), booths(nama_tampilan)')
    .eq('representative_id', p.representativeId)
    .order('urutan');

  return ok(c, data ?? []);
});

// -----------------------------------------------------------------------------
// POST /materials
// -----------------------------------------------------------------------------
const skemaMateri = z.object({
  judul: z.string().min(2).max(160),
  lampiran_ke: z.enum(['KAMPUS', 'BOOTH']),
  booth_id: z.coerce.number().int().positive().optional(),
  tipe: z.enum(['LINK', 'FILE']),
  url: z.string().url(),
  akses: z.enum(['PUBLIK', 'DI_BOOTH']).default('PUBLIK'),
  ukuran_kb: z.coerce.number().int().min(0).optional(),
});

app.post('/', wajibLogin, butuhIzin('KELOLA_MATERI'), async (c) => {
  const p = c.get('pengguna');
  if (!p.representativeId) throw new AppError('BUKAN_ALUMNI');

  const body = skemaMateri.parse(await c.req.json());

  if (body.tipe === 'FILE') {
    if (EKSTENSI_DITOLAK.test(body.url)) throw new AppError('TIPE_FILE_DITOLAK');
    if ((body.ukuran_kb ?? 0) > MAKS_KB) throw new AppError('FILE_TERLALU_BESAR');
  }

  const { data: rep } = await db(c.env)
    .from('representatives').select('university_id, major_id')
    .eq('id', p.representativeId).maybeSingle();
  if (!rep) throw new AppError('BUKAN_ALUMNI');

  let universityId: number | null = null;
  let boothId: number | null = null;

  if (body.lampiran_ke === 'KAMPUS') {
    universityId = rep.university_id;
  } else {
    if (!body.booth_id) throw new AppError('DATA_TIDAK_VALID', undefined,
      'booth_id wajib diisi kalau materi dilampirkan ke booth');

    // An alumnus may only attach material to a booth they actually staff.
    const { data: booth } = await db(c.env)
      .from('booths').select('id, booth_type, university_id, major_id')
      .eq('id', body.booth_id).maybeSingle();
    if (!booth) throw new AppError('BOOTH_TIDAK_DITEMUKAN');

    const boleh = booth.booth_type === 'KAMPUS'
      ? booth.university_id === rep.university_id
      : booth.major_id === rep.major_id;
    if (!boleh) throw new AppError('BUKAN_BOOTH_ANDA');

    boothId = booth.id;
  }

  const { count } = await db(c.env)
    .from('materials')
    .select('id', { count: 'exact', head: true })
    .match(boothId ? { booth_id: boothId } : { university_id: universityId })
    .eq('aktif', true);

  if ((count ?? 0) >= MAKS_PER_INDUK) throw new AppError('BATAS_MATERI_TERCAPAI');

  const { data, error } = await db(c.env)
    .from('materials')
    .insert({
      judul: body.judul,
      university_id: universityId,
      booth_id: boothId,
      representative_id: p.representativeId,
      tipe: body.tipe,
      url: body.url,
      akses: body.akses,
      ukuran_kb: body.ukuran_kb ?? null,
      urutan: count ?? 0,
    })
    .select('*').single();

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return dibuat(c, data);
});

app.patch('/:id', wajibLogin, butuhIzin('KELOLA_MATERI'), async (c) => {
  const p = c.get('pengguna');
  const body = z.object({
    judul: z.string().min(2).max(160).optional(),
    akses: z.enum(['PUBLIK', 'DI_BOOTH']).optional(),
    urutan: z.coerce.number().int().optional(),
    aktif: z.boolean().optional(),
  }).parse(await c.req.json());

  const { data, error } = await db(c.env)
    .from('materials').update(body)
    .eq('id', Number(c.req.param('id')))
    .eq('representative_id', p.representativeId ?? -1)
    .select('*').maybeSingle();

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

app.delete('/:id', wajibLogin, butuhIzin('KELOLA_MATERI'), async (c) => {
  const p = c.get('pengguna');
  const { error } = await db(c.env)
    .from('materials').delete()
    .eq('id', Number(c.req.param('id')))
    .eq('representative_id', p.representativeId ?? -1);
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return ok(c, { dihapus: true });
});

export default app;
