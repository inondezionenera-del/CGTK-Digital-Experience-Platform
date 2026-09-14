import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError, pastikanSukses } from '../lib/errors';
import { ok, dibuat } from '../lib/respond';
import { bacaQr, bacaQrBooth, susunQrBooth } from '../lib/qr';
import { wajibLogin } from '../middleware/auth';
import { butuhIzin, wajibAlumni, wajibLunas } from '../middleware/rbac';
import { batasi, BATAS } from '../middleware/ratelimit';

/**
 * Booths, visits and check-ins.
 *
 * Two shapes of booth exist and they behave differently:
 *
 *   Event 2 (Campus Expo) — one booth per campus. "Booth ITB", ITB alumni.
 *   Event 3 (Major Expo)  — one booth per major.  "Booth Informatics", staffed
 *                           together by alumni from ITB, ITS and UB.
 *
 * That second case is why the anti-farming key is the booth and not the campus.
 * Keyed on campus, a participant standing at one table could collect from each
 * alumnus in turn and walk away with triple points without moving.
 *
 * Two separate paths run through this module:
 *   - the alumnus scans the participant  -> XP
 *   - the participant scans the poster   -> unlocks the slides, no XP
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// =============================================================================
// ALUMNI SIDE
// =============================================================================

// -----------------------------------------------------------------------------
// GET /booths/saya
//
// Alumni are never asked which booth they are on. Campus and major are already
// on their record, and the active event decides which one applies — so the page
// opens straight onto the camera.
// -----------------------------------------------------------------------------
app.get('/saya', wajibLogin, wajibAlumni, async (c) => {
  const p = c.get('pengguna');
  const hasil = await rpc<{ sukses: boolean; kode?: string; data?: unknown; pesan?: string }>(
    c.env, 'booth_untuk_alumni', { p_user_id: p.id },
  );
  pastikanSukses(hasil);
  return ok(c, hasil.data, hasil.pesan ? { pesan: hasil.pesan } : undefined);
});

// -----------------------------------------------------------------------------
// POST /booth/scan
// -----------------------------------------------------------------------------
const skemaScanBooth = z.object({
  isi_qr: z.string().min(8),
  booth_id: z.coerce.number().int().positive(),
  jenis: z.enum(['HADIR', 'AKTIF', 'SANGAT_AKTIF']),
  scan_uuid: z.string().uuid(),
  waktu_scan: z.string().datetime({ offset: true }),
  ditandai: z.boolean().optional(),
  catatan: z.string().max(300).optional(),
});

app.post('/scan',
  wajibLogin,
  butuhIzin('SCAN_BOOTH'),
  batasi(BATAS.scan),
  async (c) => {
    const p = c.get('pengguna');
    const body = skemaScanBooth.parse(await c.req.json());

    const qr = await bacaQr(body.isi_qr, c.env.QR_SIGNING_SECRET);
    if (!qr.valid) throw new AppError('QR_TIDAK_VALID', { alasan: qr.alasan });

    // The XP ceiling is applied inside the function, on the server. A limit
    // enforced only by the phone app is not a limit — the three buttons are a
    // convenience, not a control.
    const hasil = await rpc<{ sukses: boolean; kode?: string; pesan?: string; data?: unknown }>(
      c.env, 'scan_booth', {
        p_qr_token: qr.token,
        p_booth_id: body.booth_id,
        p_jenis: body.jenis,
        p_scan_uuid: body.scan_uuid,
        p_waktu_scan: body.waktu_scan,
        p_oleh: p.id,
        p_ditandai: body.ditandai ?? false,
        p_catatan: body.catatan ?? null,
      },
    );

    pastikanSukses(hasil);
    return dibuat(c, hasil.data);
  });

// -----------------------------------------------------------------------------
// POST /booth/batal/:id
//
// No countdown, no expiry. Alumni typically notice a mis-tap two or three
// participants later; a button that has already vanished sends them looking for
// a committee member instead, which costs everyone more.
// -----------------------------------------------------------------------------
app.post('/batal/:id', wajibLogin, butuhIzin('SCAN_BOOTH'), async (c) => {
  const p = c.get('pengguna');
  const hasil = await rpc<{ sukses: boolean; kode?: string; data?: unknown }>(
    c.env, 'batal_scan_booth', {
      p_visit_id: Number(c.req.param('id')),
      p_oleh: p.id,
    },
  );
  pastikanSukses(hasil);
  return ok(c, hasil.data);
});

// -----------------------------------------------------------------------------
// GET /booth/scan-terakhir  — feeds the undo list
// -----------------------------------------------------------------------------
app.get('/scan-terakhir', wajibLogin, butuhIzin('SCAN_BOOTH'), async (c) => {
  const p = c.get('pengguna');
  if (!p.representativeId) throw new AppError('BUKAN_ALUMNI');

  const { data } = await db(c.env)
    .from('booth_visits')
    .select('id, jenis, xp_diberikan, waktu_terima, dibatalkan, participants!inner(users!inner(nama))')
    .eq('representative_id', p.representativeId)
    .eq('dibatalkan', false)
    .order('waktu_terima', { ascending: false })
    .limit(20);

  return ok(c, (data ?? []).map((v) => ({
    id: v.id,
    nama: ((v.participants as unknown as { users: { nama: string } }).users).nama,
    jenis: v.jenis,
    xp: v.xp_diberikan,
    waktu: v.waktu_terima,
  })));
});

// -----------------------------------------------------------------------------
// PATCH /booth/visits/:id/tandai  — the star, for a participant worth following up
// -----------------------------------------------------------------------------
app.patch('/visits/:id/tandai', wajibLogin, butuhIzin('SCAN_BOOTH'), async (c) => {
  const p = c.get('pengguna');
  const body = z.object({ ditandai: z.boolean() }).parse(await c.req.json());

  const { data, error } = await db(c.env)
    .from('booth_visits')
    .update({ ditandai: body.ditandai })
    .eq('id', Number(c.req.param('id')))
    .eq('representative_id', p.representativeId ?? -1)
    .select('id, ditandai')
    .maybeSingle();

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

// =============================================================================
// PARTICIPANT SIDE
// =============================================================================

// -----------------------------------------------------------------------------
// POST /booth/checkin
//
// The Education division asked for participants to be able to read the slides
// while they are standing at the booth. The difficulty is that alumni scan them
// at the *end* of the conversation — too late to be useful for opening
// material.
//
// So the participant marks their own arrival, by scanning the poster on the
// table or typing the short code printed under it. Alumni workload is unchanged.
//
// This grants no XP on purpose. If it did, photographing the poster and sharing
// it would hand points to people who never came. Because all it unlocks is
// reading material, a leaked poster costs nothing.
// -----------------------------------------------------------------------------
const skemaCheckin = z.object({
  qr_booth: z.string().optional(),
  kode_booth: z.string().optional(),
}).refine((v) => v.qr_booth || v.kode_booth, {
  message: 'Kirim qr_booth atau kode_booth',
});

app.post('/checkin', wajibLogin, wajibLunas, async (c) => {
  const p = c.get('pengguna');
  const body = skemaCheckin.parse(await c.req.json());

  let boothId: number | null = null;
  let cara: 'SCAN_QR' | 'KETIK_KODE' = 'KETIK_KODE';

  if (body.qr_booth) {
    const token = bacaQrBooth(body.qr_booth);
    if (!token) throw new AppError('BOOTH_TIDAK_DITEMUKAN');
    const { data } = await db(c.env)
      .from('booths').select('id').eq('qr_token_booth', token).maybeSingle();
    boothId = data?.id ?? null;
    cara = 'SCAN_QR';
  } else {
    const { data } = await db(c.env)
      .from('booths').select('id')
      .eq('kode_booth', body.kode_booth!.trim().toUpperCase())
      .maybeSingle();
    boothId = data?.id ?? null;
  }

  if (!boothId) throw new AppError('BOOTH_TIDAK_DITEMUKAN');

  const hasil = await rpc<{ sukses: boolean; kode?: string; pesan?: string; data?: unknown }>(
    c.env, 'checkin_booth', {
      p_participant_id: p.participantId,
      p_booth_id: boothId,
      p_cara: cara,
    },
  );

  pastikanSukses(hasil);
  // Scanning again is answered with 200 and `sudah_pernah`, never an error.
  // Nothing went wrong, and a red banner would just confuse the participant.
  return ok(c, hasil.data);
});

// -----------------------------------------------------------------------------
// GET /booth/checkin/saya
// -----------------------------------------------------------------------------
app.get('/checkin/saya', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  const { data } = await db(c.env)
    .from('booth_checkins')
    .select('booth_id, waktu, booths(nama_tampilan, booth_type)')
    .eq('participant_id', p.participantId ?? '');
  return ok(c, data ?? []);
});

// -----------------------------------------------------------------------------
// GET /passport/saya  — two tabs, one per expo event
// -----------------------------------------------------------------------------
app.get('/passport/saya', wajibLogin, wajibLunas, async (c) => {
  const p = c.get('pengguna');

  const { data: booths } = await db(c.env)
    .from('booths')
    .select('id, nama_tampilan, booth_type, lokasi, status, events!inner(id, nama, tipe, tanggal), universities(logo_url)')
    .neq('status', 'DRAFT')
    .order('urutan');

  const { data: visits } = await db(c.env)
    .from('booth_visits')
    .select('booth_id, xp_diberikan')
    .eq('participant_id', p.participantId ?? '')
    .eq('dibatalkan', false);

  const sudah = new Map((visits ?? []).map((v) => [v.booth_id, v.xp_diberikan]));

  const bentuk = (tipe: string) => {
    const daftar = (booths ?? [])
      .filter((b) => (b.events as unknown as { tipe: string }).tipe === tipe)
      .map((b) => ({
        id: b.id,
        nama: b.nama_tampilan,
        lokasi: b.lokasi,
        logo_url: (b.universities as unknown as { logo_url?: string } | null)?.logo_url ?? null,
        dikunjungi: sudah.has(b.id),
        xp_didapat: sudah.get(b.id) ?? null,
        status: b.status,
        // Closed booths stay on the board, greyed out. Removing them makes the
        // grid change size during the day and hides what was missed.
        abu_abu: b.status === 'CLOSED',
      }));
    return {
      acara: (booths ?? []).find((b) => (b.events as unknown as { tipe: string }).tipe === tipe)
        ? (booths!.find((b) => (b.events as unknown as { tipe: string }).tipe === tipe)!
            .events as unknown as { nama: string }).nama
        : null,
      terkumpul: daftar.filter((b) => b.dikunjungi).length,
      total: daftar.length,
      booth: daftar,
    };
  };

  return ok(c, {
    paspor_kampus: bentuk('EXPO_KAMPUS'),
    paspor_jurusan: bentuk('EXPO_JURUSAN'),
  });
});

// =============================================================================
// PUBLIC / DIRECTORY
// =============================================================================

app.get('/', async (c) => {
  const tipe = c.req.query('tipe');
  let q = db(c.env)
    .from('booths')
    .select('id, nama_tampilan, booth_type, lokasi, status, deskripsi, events!inner(id, nama, tipe, tanggal), universities(nama, singkatan, logo_url), majors(nama, rumpun)')
    .neq('status', 'DRAFT')
    .order('urutan');

  if (tipe) q = q.eq('booth_type', tipe);

  const { data, error } = await q;
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return ok(c, data ?? []);
});

app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const { data } = await db(c.env)
    .from('booths')
    .select(`
      id, nama_tampilan, booth_type, lokasi, deskripsi, status, xp_max,
      events ( id, nama, tipe, tanggal ),
      universities ( id, nama, singkatan, logo_url, kota ),
      majors ( id, nama, rumpun, deskripsi )
    `)
    .eq('id', id)
    .maybeSingle();

  if (!data) throw new AppError('BOOTH_TIDAK_DITEMUKAN');

  // Alumni on duty, so participants know who is waiting rather than just a
  // campus name on a sign.
  const filter = data.booth_type === 'KAMPUS'
    ? { university_id: (data.universities as unknown as { id: number })?.id }
    : { major_id: (data.majors as unknown as { id: number })?.id };

  const { data: alumni } = await db(c.env)
    .from('representatives')
    .select('id, angkatan, bio, foto_url, users(nama), universities(nama, singkatan), majors(nama)')
    .match({ ...filter, status: 'AKTIF' });

  return ok(c, { ...data, alumni: alumni ?? [] });
});

// =============================================================================
// ADMIN
// =============================================================================

const skemaBooth = z.object({
  event_id: z.coerce.number().int().positive(),
  booth_type: z.enum(['KAMPUS', 'JURUSAN']),
  university_id: z.coerce.number().int().positive().nullable().optional(),
  major_id: z.coerce.number().int().positive().nullable().optional(),
  nama_tampilan: z.string().min(2).max(120),
  lokasi: z.string().max(120).optional(),
  deskripsi: z.string().max(1000).optional(),
  xp_max: z.coerce.number().int().min(0).max(1000).optional(),
  urutan: z.coerce.number().int().optional(),
});

function kodeBooth(nama: string): string {
  const awalan = nama.replace(/^booth\s+/i, '')
    .split(/\s+/).map((w) => w[0] ?? '').join('')
    .toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'BT';
  return `${awalan}-${Math.floor(100 + Math.random() * 900)}`;
}

app.post('/admin', wajibLogin, butuhIzin('KELOLA_BOOTH'), async (c) => {
  const p = c.get('pengguna');
  const body = skemaBooth.parse(await c.req.json());

  const { data, error } = await db(c.env)
    .from('booths')
    .insert({ ...body, kode_booth: kodeBooth(body.nama_tampilan) })
    .select('*')
    .single();

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  await rpc(c.env, 'catat_audit', {
    p_user_id: p.id, p_aksi: 'BUAT_BOOTH',
    p_tabel: 'booths', p_record_id: String(data.id), p_sesudah: data,
  });

  return dibuat(c, data);
});

// -----------------------------------------------------------------------------
// POST /admin/booths/buat-otomatis
//
// Creating forty booths through a form one at a time is how a task gets
// abandoned halfway. This builds them from the alumni already registered.
// -----------------------------------------------------------------------------
app.post('/admin/buat-otomatis', wajibLogin, butuhIzin('KELOLA_BOOTH'), async (c) => {
  const body = z.object({ event_id: z.coerce.number().int().positive() })
    .parse(await c.req.json());

  const { data: acara } = await db(c.env)
    .from('events').select('id, tipe').eq('id', body.event_id).maybeSingle();
  if (!acara) throw new AppError('TIDAK_DITEMUKAN');

  if (acara.tipe === 'EXPO_KAMPUS') {
    const { data: kampus } = await db(c.env)
      .from('representatives')
      .select('university_id, universities!inner(id, nama, singkatan)')
      .not('university_id', 'is', null);

    const unik = new Map<number, { nama: string }>();
    for (const r of kampus ?? []) {
      const u = r.universities as unknown as { id: number; nama: string; singkatan: string };
      if (u) unik.set(u.id, { nama: `Booth ${u.singkatan}` });
    }

    const baris = [...unik.entries()].map(([id, v], i) => ({
      event_id: body.event_id, booth_type: 'KAMPUS' as const,
      university_id: id, major_id: null,
      nama_tampilan: v.nama, kode_booth: kodeBooth(v.nama), urutan: i,
    }));

    const { data, error } = await db(c.env).from('booths').insert(baris).select('id');
    if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
    return dibuat(c, { dibuat: data?.length ?? 0, tipe: 'KAMPUS' });
  }

  if (acara.tipe === 'EXPO_JURUSAN') {
    const { data: jurusan } = await db(c.env)
      .from('representatives')
      .select('major_id, majors!inner(id, nama)')
      .not('major_id', 'is', null);

    const unik = new Map<number, string>();
    for (const r of jurusan ?? []) {
      const m = r.majors as unknown as { id: number; nama: string };
      if (m) unik.set(m.id, `Booth ${m.nama}`);
    }

    const baris = [...unik.entries()].map(([id, nama], i) => ({
      event_id: body.event_id, booth_type: 'JURUSAN' as const,
      university_id: null, major_id: id,
      nama_tampilan: nama, kode_booth: kodeBooth(nama), urutan: i,
    }));

    const { data, error } = await db(c.env).from('booths').insert(baris).select('id');
    if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
    return dibuat(c, { dibuat: data?.length ?? 0, tipe: 'JURUSAN' });
  }

  throw new AppError('DATA_TIDAK_VALID', undefined,
    'Acara bertipe ini tidak memakai booth');
});

app.patch('/admin/:id', wajibLogin, butuhIzin('KELOLA_BOOTH'), async (c) => {
  const body = skemaBooth.partial().parse(await c.req.json());
  const { data, error } = await db(c.env)
    .from('booths').update(body).eq('id', Number(c.req.param('id')))
    .select('*').maybeSingle();

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

app.patch('/admin/:id/saklar', wajibLogin, butuhIzin('KELOLA_BOOTH'), async (c) => {
  const p = c.get('pengguna');
  const body = z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']) })
    .parse(await c.req.json());

  const { data, error } = await db(c.env)
    .from('booths').update({ status: body.status })
    .eq('id', Number(c.req.param('id'))).select('id, nama_tampilan, status').maybeSingle();

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');

  await rpc(c.env, 'catat_audit', {
    p_user_id: p.id, p_aksi: 'SAKLAR_BOOTH',
    p_tabel: 'booths', p_record_id: String(data.id),
    p_sesudah: { status: body.status },
  });

  return ok(c, data);
});

// -----------------------------------------------------------------------------
// GET /admin/booths/:id/kode  — poster payload
// -----------------------------------------------------------------------------
app.get('/admin/:id/kode', wajibLogin, butuhIzin('KELOLA_BOOTH'), async (c) => {
  const { data } = await db(c.env)
    .from('booths')
    .select('id, nama_tampilan, lokasi, kode_booth, qr_token_booth')
    .eq('id', Number(c.req.param('id')))
    .maybeSingle();

  if (!data) throw new AppError('TIDAK_DITEMUKAN');

  return ok(c, {
    nama_tampilan: data.nama_tampilan,
    lokasi: data.lokasi,
    kode_booth: data.kode_booth,
    qr_booth: susunQrBooth(data.qr_token_booth),
  });
});

// -----------------------------------------------------------------------------
// GET /admin/booths/poster  — everything needed for one print run
// -----------------------------------------------------------------------------
app.get('/admin/poster/semua', wajibLogin, butuhIzin('KELOLA_BOOTH'), async (c) => {
  const { data } = await db(c.env)
    .from('booths')
    .select('id, nama_tampilan, lokasi, kode_booth, qr_token_booth, status, events(nama)')
    .neq('status', 'DRAFT')
    .order('urutan');

  return ok(c, (data ?? []).map((b) => ({
    id: b.id,
    nama_tampilan: b.nama_tampilan,
    lokasi: b.lokasi,
    acara: (b.events as unknown as { nama: string } | null)?.nama ?? null,
    kode_booth: b.kode_booth,
    qr_booth: susunQrBooth(b.qr_token_booth),
  })));
});

export default app;
