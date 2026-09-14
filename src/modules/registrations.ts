import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError } from '../lib/errors';
import { ok, dibuat, halaman, bacaPaginasi } from '../lib/respond';
import { susunQr } from '../lib/qr';
import * as setting from '../lib/settings';
import { wajibLogin } from '../middleware/auth';
import { butuhIzin, wajibLunas } from '../middleware/rbac';
import { batasi, BATAS } from '../middleware/ratelimit';

/**
 * Registration, participant profile and QR identity.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// -----------------------------------------------------------------------------
// POST /registrations
// -----------------------------------------------------------------------------
const skemaDaftar = z.object({
  asal_sekolah: z.string().min(2).max(120),
  kelas: z.string().min(1).max(40),
  target_jurusan: z.string().max(120).optional(),
  kampus_impian: z.string().max(120).optional(),
  izin_bagi_data: z.boolean(),
  extra_fields: z.record(z.unknown()).optional(),
});

app.post('/registrations', wajibLogin, async (c) => {
  const p = c.get('pengguna');

  if (!(await setting.boolean_(c.env, 'registrasi_dibuka', true))) {
    throw new AppError('PENDAFTARAN_DITUTUP');
  }

  const { data: ada } = await db(c.env)
    .from('registrations').select('id').eq('user_id', p.id).maybeSingle();
  if (ada) throw new AppError('SUDAH_DAFTAR');

  const body = skemaDaftar.parse(await c.req.json());

  const { data: peserta, error: e1 } = await db(c.env)
    .from('participants')
    .insert({
      user_id: p.id,
      asal_sekolah: body.asal_sekolah,
      kelas: body.kelas,
      target_jurusan: body.target_jurusan ?? null,
      kampus_impian: body.kampus_impian ?? null,
      // Asked for explicitly, never assumed. These are high-school students,
      // and this flag is what alumni visibility hangs on.
      izin_bagi_data: body.izin_bagi_data,
      extra_fields: body.extra_fields ?? {},
    })
    .select('id')
    .single();

  if (e1) throw new AppError('ERROR_SERVER', { pesan: e1.message });

  const { data: reg, error: e2 } = await db(c.env)
    .from('registrations').insert({ user_id: p.id })
    .select('id, kode_registrasi, status').single();

  if (e2) throw new AppError('ERROR_SERVER', { pesan: e2.message });

  const hasil = await rpc<{ data: { profil_lengkap: boolean; field_belum_diisi: string[] } }>(
    c.env, 'hitung_profil_lengkap', { p_participant_id: peserta.id },
  );

  return dibuat(c, {
    id: reg.id,
    kode_registrasi: reg.kode_registrasi,
    profil_lengkap: hasil?.data?.profil_lengkap ?? false,
    field_belum_diisi: hasil?.data?.field_belum_diisi ?? [],
    status: hasil?.data?.profil_lengkap ? 'MENUNGGU_PEMBAYARAN' : 'PROFIL_BELUM_LENGKAP',
  });
});

// -----------------------------------------------------------------------------
// GET /registrations/saya
// -----------------------------------------------------------------------------
app.get('/registrations/saya', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  const { data } = await db(c.env)
    .from('registrations')
    .select('id, kode_registrasi, status, profil_lengkap, created_at')
    .eq('user_id', p.id).maybeSingle();

  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

// -----------------------------------------------------------------------------
// GET /cek-status?kode=
//
// Public, no login. Payment is recorded by hand, so there is a lag between
// paying and the QR appearing — this is how someone who paid at eleven at night
// checks without messaging a committee member.
//
// Deliberately thin: an abbreviated name and a status. Anyone holding the code
// can open it, which is also why codes are random rather than sequential.
// -----------------------------------------------------------------------------
app.get('/cek-status', batasi(BATAS.cekStatus), async (c) => {
  const kode = (c.req.query('kode') ?? '').trim().toUpperCase();
  if (!kode) throw new AppError('DATA_TIDAK_VALID');

  const { data } = await db(c.env)
    .from('registrations')
    .select('kode_registrasi, status, users!inner(nama)')
    .ilike('kode_registrasi', kode)
    .maybeSingle();

  if (!data) throw new AppError('KODE_TIDAK_DITEMUKAN');

  const nama = (data.users as unknown as { nama: string }).nama;
  const bagian = nama.trim().split(/\s+/);
  const namaSingkat = bagian.length > 1
    ? `${bagian[0]} ${bagian[bagian.length - 1]![0]}.`
    : bagian[0]!;

  const pesan: Record<string, string> = {
    PROFIL_BELUM_LENGKAP: 'Profil belum lengkap. Masuk ke akunmu untuk melengkapinya.',
    MENUNGGU_PEMBAYARAN:  'Pendaftaran tercatat, pembayaran belum diterima panitia.',
    LUNAS:                'Pembayaran lunas. Silakan masuk untuk melihat QR-mu.',
    DIBATALKAN:           'Pendaftaran dibatalkan. Hubungi panitia.',
  };

  // No email, no school, no phone number.
  return ok(c, {
    kode_registrasi: data.kode_registrasi,
    nama: namaSingkat,
    status: data.status,
    pesan: pesan[data.status] ?? '',
  });
});

// -----------------------------------------------------------------------------
// GET / PATCH /participants/saya
// -----------------------------------------------------------------------------
app.get('/participants/saya', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  if (!p.participantId) throw new AppError('TIDAK_DITEMUKAN');

  const { data } = await db(c.env)
    .from('participants').select('*').eq('id', p.participantId).maybeSingle();
  if (!data) throw new AppError('TIDAK_DITEMUKAN');

  const { qr_token, ...aman } = data as Record<string, unknown>;
  return ok(c, aman);
});

const skemaUbah = skemaDaftar.partial();

app.patch('/participants/saya', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  if (!p.participantId) throw new AppError('TIDAK_DITEMUKAN');

  const body = skemaUbah.parse(await c.req.json());

  const { data: lama } = await db(c.env)
    .from('participants')
    .select('jumlah_edit_profil, extra_fields')
    .eq('id', p.participantId).maybeSingle();
  if (!lama) throw new AppError('TIDAK_DITEMUKAN');

  const maks = await setting.angka(c.env, 'max_edit_profil', 2);
  if (lama.jumlah_edit_profil >= maks) throw new AppError('BATAS_EDIT_HABIS');

  // Administration can mark a question as locked once answered. Honour that.
  if (body.extra_fields) {
    const { data: terkunci } = await db(c.env)
      .from('form_fields').select('kunci')
      .eq('aktif', true).eq('bisa_diedit_peserta', false);

    for (const f of terkunci ?? []) {
      const sebelum = (lama.extra_fields as Record<string, unknown>)?.[f.kunci];
      const sesudah = body.extra_fields[f.kunci];
      if (sesudah !== undefined && sebelum !== undefined && sesudah !== sebelum) {
        throw new AppError('FIELD_TIDAK_BOLEH_DIEDIT', { field: f.kunci });
      }
    }
  }

  const { error } = await db(c.env)
    .from('participants')
    .update({
      ...body,
      extra_fields: body.extra_fields
        ? { ...(lama.extra_fields as object), ...body.extra_fields }
        : undefined,
      jumlah_edit_profil: lama.jumlah_edit_profil + 1,
    })
    .eq('id', p.participantId);

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  // Completeness is recomputed on every save — this is what opens or closes
  // the payment button.
  const hasil = await rpc<{ data: { profil_lengkap: boolean; field_belum_diisi: string[] } }>(
    c.env, 'hitung_profil_lengkap', { p_participant_id: p.participantId },
  );

  return ok(c, {
    sisa_kesempatan_edit: Math.max(0, maks - (lama.jumlah_edit_profil + 1)),
    profil_lengkap: hasil?.data?.profil_lengkap ?? false,
    field_belum_diisi: hasil?.data?.field_belum_diisi ?? [],
  });
});

// -----------------------------------------------------------------------------
// GET /qr/saya
// -----------------------------------------------------------------------------
app.get('/qr/saya', wajibLogin, wajibLunas, async (c) => {
  const p = c.get('pengguna');

  const { data } = await db(c.env)
    .from('participants')
    .select('qr_token, qr_terbit_at, asal_sekolah, users!inner(nama)')
    .eq('id', p.participantId ?? '').maybeSingle();

  if (!data?.qr_token) throw new AppError('BELUM_BAYAR');

  return ok(c, {
    isi_qr: await susunQr(data.qr_token, c.env.QR_SIGNING_SECRET),
    nama: (data.users as unknown as { nama: string }).nama,
    asal_sekolah: data.asal_sekolah,
    terbit_at: data.qr_terbit_at,
  });
});

// -----------------------------------------------------------------------------
// GET /participants  — admin listing
// -----------------------------------------------------------------------------
app.get('/participants', wajibLogin, butuhIzin('EKSPOR_LPJ', 'EKSPOR_PRESENSI'), async (c) => {
  const { hal, per, dari, sampai } = bacaPaginasi(c);
  const cari = (c.req.query('cari') ?? '').trim();

  let q = db(c.env)
    .from('participants')
    .select('id, asal_sekolah, kelas, target_jurusan, extra_fields, created_at, users!inner(nama, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(dari, sampai);

  if (cari) q = q.ilike('asal_sekolah', `%${cari}%`);

  const { data, count, error } = await q;
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return halaman(c, data ?? [], count ?? 0, hal, per);
});

// -----------------------------------------------------------------------------
// GET /participants/cari  — quick lookup for the phone-less participant
// -----------------------------------------------------------------------------
app.get('/participants/cari', wajibLogin, butuhIzin('SCAN_PRESENSI'), async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return ok(c, []);

  const { data } = await db(c.env)
    .from('participants')
    .select('id, asal_sekolah, kelas, users!inner(nama)')
    .ilike('users.nama', `%${q}%`)
    .limit(20);

  return ok(c, (data ?? []).map((p) => ({
    id: p.id,
    nama: (p.users as unknown as { nama: string }).nama,
    asal_sekolah: p.asal_sekolah,
    kelas: p.kelas,
  })));
});

export default app;
