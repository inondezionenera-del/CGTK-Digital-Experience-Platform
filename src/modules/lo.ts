import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError } from '../lib/errors';
import { ok, dibuat } from '../lib/respond';
import * as setting from '../lib/settings';
import { wajibLogin } from '../middleware/auth';
import { butuhIzin } from '../middleware/rbac';

/**
 * Liaison officers (Education division).
 *
 * Read-only, without exception. Their job on the day is to walk the floor and
 * keep an eye on the alumni they are looking after — not to operate software.
 * The fewer things they can press, the fewer things can go wrong mid-event.
 *
 * The assignment is to the alumnus rather than the booth: the same person works
 * the campus booth in Event 2 and the major booth in Event 3, so a booth-level
 * assignment would have to be entered twice for one human being.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// -----------------------------------------------------------------------------
// GET /lo/alumni
// -----------------------------------------------------------------------------
app.get('/alumni', wajibLogin, butuhIzin('LIHAT_ALUMNI_DAMPINGAN'), async (c) => {
  const p = c.get('pengguna');

  const { data: tugas } = await db(c.env)
    .from('lo_assignments')
    .select(`
      representative_id,
      representatives!inner (
        id, angkatan, bio, foto_url, kontak, status,
        users ( nama ),
        universities ( id, nama, singkatan ),
        majors ( id, nama )
      )
    `)
    .eq('lo_user_id', p.id);

  if (!tugas?.length) {
    return ok(c, [], { total: 0, pesan: 'Belum ada alumni dampingan. Hubungi Super Admin.' });
  }

  // Which event is running decides which booth is "now".
  const { data: acaraAktif } = await db(c.env)
    .from('events')
    .select('id, nama, tipe')
    .eq('aktif', true)
    .order('urutan');

  const hasil = [];

  for (const t of tugas) {
    const rep = t.representatives as unknown as {
      id: number; angkatan: number | null; bio: string | null; foto_url: string | null;
      kontak: string | null; status: string;
      users: { nama: string } | null;
      universities: { id: number; nama: string; singkatan: string } | null;
      majors: { id: number; nama: string } | null;
    };

    // Both booths at once. An LO looking for someone needs to know where they
    // are in each event, otherwise they search the wrong hall.
    const { data: booths } = await db(c.env)
      .from('booths')
      .select('id, nama_tampilan, lokasi, status, booth_type, events!inner(id, nama, tipe)')
      .or(`university_id.eq.${rep.universities?.id ?? 0},major_id.eq.${rep.majors?.id ?? 0}`)
      .neq('status', 'DRAFT');

    const cocok = (booths ?? []).filter((b) =>
      (b.booth_type === 'KAMPUS' && rep.universities) ||
      (b.booth_type === 'JURUSAN' && rep.majors));

    const sekarang = cocok.find((b) =>
      b.status === 'ACTIVE' &&
      acaraAktif?.some((a) => a.id === (b.events as unknown as { id: number }).id));

    hasil.push({
      representative_id: rep.id,
      nama: rep.users?.nama ?? '(belum login)',
      foto_url: rep.foto_url,
      kampus: rep.universities?.nama ?? null,
      jurusan: rep.majors?.nama ?? null,
      angkatan: rep.angkatan,
      kontak: rep.kontak,
      status: rep.status,
      booth_sekarang: sekarang
        ? {
            nama_tampilan: sekarang.nama_tampilan,
            lokasi: sekarang.lokasi,
            status: sekarang.status,
            acara: (sekarang.events as unknown as { nama: string }).nama,
          }
        : null,
      booth_semua: cocok.map((b) => ({
        acara: (b.events as unknown as { nama: string }).nama,
        nama_tampilan: b.nama_tampilan,
        lokasi: b.lokasi,
        status: b.status,
      })),
    });
  }

  return ok(c, hasil, { total: hasil.length });
});

// -----------------------------------------------------------------------------
// GET /lo/statistik
//
// Numbers only. No participant names, no schools, nothing personal.
//
// Participants consent to their interests being seen by the campus whose booth
// they visited. An LO is not that campus, so they are not covered by that
// consent — the point of watching the floor is to spot a quiet booth, and a
// count is enough for that.
// -----------------------------------------------------------------------------
app.get('/statistik', wajibLogin, butuhIzin('LIHAT_STATISTIK_DAMPINGAN'), async (c) => {
  const p = c.get('pengguna');

  if (await setting.modeHemat(c.env)) {
    return ok(c, null, { pesan: 'Statistik sementara dimatikan (Mode Hemat)' });
  }

  const { data: tugas } = await db(c.env)
    .from('lo_assignments')
    .select('representatives!inner(id, university_id, major_id, users(nama))')
    .eq('lo_user_id', p.id);

  if (!tugas?.length) return ok(c, { ringkasan: { total_alumni_dampingan: 0 }, per_booth: [] });

  const univIds = new Set<number>();
  const majorIds = new Set<number>();
  const namaAlumni = new Map<string, string[]>();

  for (const t of tugas) {
    const r = t.representatives as unknown as {
      university_id: number | null; major_id: number | null; users: { nama: string } | null;
    };
    if (r.university_id) univIds.add(r.university_id);
    if (r.major_id) majorIds.add(r.major_id);
  }

  const { data: booths } = await db(c.env)
    .from('booths')
    .select('id, nama_tampilan, status, university_id, major_id')
    .neq('status', 'DRAFT');

  const dampingan = (booths ?? []).filter((b) =>
    (b.university_id && univIds.has(b.university_id)) ||
    (b.major_id && majorIds.has(b.major_id)));

  const hariIni = new Date(); hariIni.setHours(0, 0, 0, 0);
  const perBooth = [];
  let totalHariIni = 0;

  for (const b of dampingan) {
    const [{ count: total }, { count: hari }] = await Promise.all([
      db(c.env).from('booth_visits')
        .select('id', { count: 'exact', head: true })
        .eq('booth_id', b.id).eq('dibatalkan', false),
      db(c.env).from('booth_visits')
        .select('id', { count: 'exact', head: true })
        .eq('booth_id', b.id).eq('dibatalkan', false)
        .gte('waktu_terima', hariIni.toISOString()),
    ]);

    totalHariIni += hari ?? 0;

    // Alumni names are fine — they are adults the LO is actively working with.
    const { data: alumni } = await db(c.env)
      .from('representatives')
      .select('users(nama)')
      .or(`university_id.eq.${b.university_id ?? 0},major_id.eq.${b.major_id ?? 0}`)
      .eq('status', 'AKTIF');

    perBooth.push({
      booth: b.nama_tampilan,
      status: b.status,
      alumni: (alumni ?? []).map((a) => (a.users as unknown as { nama: string })?.nama).filter(Boolean),
      pengunjung_hari_ini: hari ?? 0,
      pengunjung_total: total ?? 0,
    });
  }

  return ok(c, {
    ringkasan: {
      total_alumni_dampingan: tugas.length,
      total_pengunjung_hari_ini: totalHariIni,
    },
    per_booth: perBooth,
  });
});

// =============================================================================
// ADMIN — assignments
// =============================================================================

app.get('/admin/assignments', wajibLogin, butuhIzin('UNDANG_ALUMNI'), async (c) => {
  const { data } = await db(c.env)
    .from('lo_assignments')
    .select('id, catatan, created_at, users!lo_assignments_lo_user_id_fkey(id, nama, email), representatives(id, users(nama), universities(singkatan), majors(nama))')
    .order('created_at', { ascending: false });
  return ok(c, data ?? []);
});

app.post('/admin/assign', wajibLogin, butuhIzin('UNDANG_ALUMNI'), async (c) => {
  const p = c.get('pengguna');
  const body = z.object({
    lo_user_id: z.string().uuid(),
    representative_id: z.coerce.number().int().positive(),
    catatan: z.string().max(300).optional(),
  }).parse(await c.req.json());

  const { data: lo } = await db(c.env)
    .from('users').select('id, roles!inner(kode)').eq('id', body.lo_user_id).maybeSingle();
  if (!lo) throw new AppError('TIDAK_DITEMUKAN');
  if ((lo.roles as unknown as { kode: string }).kode !== 'LO_PENDIDIKAN') {
    throw new AppError('BUKAN_LO');
  }

  const { data: rep } = await db(c.env)
    .from('representatives').select('id').eq('id', body.representative_id).maybeSingle();
  if (!rep) throw new AppError('ALUMNI_TIDAK_DITEMUKAN');

  const { data, error } = await db(c.env)
    .from('lo_assignments').insert(body).select('*').single();

  if (error) {
    if (error.code === '23505') throw new AppError('SUDAH_DITUGASKAN');
    throw new AppError('ERROR_SERVER', { pesan: error.message });
  }

  await rpc(c.env, 'catat_audit', {
    p_user_id: p.id, p_aksi: 'TUGASKAN_LO',
    p_tabel: 'lo_assignments', p_record_id: String(data.id), p_sesudah: data,
  });

  return dibuat(c, data);
});

app.delete('/admin/assign/:id', wajibLogin, butuhIzin('UNDANG_ALUMNI'), async (c) => {
  await db(c.env).from('lo_assignments').delete().eq('id', Number(c.req.param('id')));
  return ok(c, { dihapus: true });
});

export default app;
