import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError } from '../lib/errors';
import { ok, dibuat, halaman, bacaPaginasi } from '../lib/respond';
import * as setting from '../lib/settings';
import { wajibLogin } from '../middleware/auth';
import { butuhIzin, wajibSuperAdmin } from '../middleware/rbac';

/**
 * Settings, form builder, XP values, audit log and reporting exports.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// =============================================================================
// SETTINGS
// =============================================================================

/**
 * GET /settings/publik
 *
 * Called once when the app loads. Everything the frontend would otherwise be
 * tempted to hard-code lives here.
 *
 * Only rows flagged public. The payment form URL is deliberately not one of
 * them — it is reachable solely through the server-side redirect.
 */
app.get('/settings/publik', async (c) => ok(c, await setting.semuaPublik(c.env)));

app.get('/settings/admin', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  const { data } = await db(c.env)
    .from('settings').select('kunci, nilai, tipe, kelompok, deskripsi, diubah_at')
    .order('kelompok').order('kunci');

  // Secrets stay masked even for admins. Nobody needs to read the form URL out
  // of a settings screen; they only need to be able to replace it.
  const rahasia = new Set(['link_pembayaran', 'prefill_entry_id']);
  const bolehLihatRahasia = p.izin.includes('ATUR_PEMBAYARAN') || p.peran === 'SUPER_ADMIN';

  return ok(c, (data ?? []).map((s) => ({
    ...s,
    nilai: rahasia.has(s.kunci) && !bolehLihatRahasia
      ? (s.nilai ? '••••••' : '')
      : s.nilai,
  })));
});

/** Which permission may edit which group of settings. */
const IZIN_KELOMPOK: Record<string, string[]> = {
  bayar:  ['ATUR_PEMBAYARAN'],
  xp:     ['ATUR_XP'],
  form:   ['KELOLA_FORM'],
  kuis:   ['KELOLA_KUIS'],
  acara:  ['KELOLA_JADWAL'],
  sistem: ['PENGATURAN_SISTEM'],
};

app.patch('/settings/admin/:kunci', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  const kunci = c.req.param('kunci');
  const body = z.object({ nilai: z.string().max(5000) }).parse(await c.req.json());

  const { data: lama } = await db(c.env)
    .from('settings').select('kunci, nilai, kelompok').eq('kunci', kunci).maybeSingle();
  if (!lama) throw new AppError('TIDAK_DITEMUKAN');

  const butuh = IZIN_KELOMPOK[lama.kelompok] ?? ['PENGATURAN_SISTEM'];
  if (!butuh.some((i) => p.izin.includes(i))) {
    throw new AppError('TIDAK_BERHAK', { butuh });
  }

  await setting.simpan(c.env, kunci, body.nilai, p.id);

  await rpc(c.env, 'catat_audit', {
    p_user_id: p.id, p_aksi: 'UBAH_PENGATURAN',
    p_tabel: 'settings', p_record_id: kunci,
    p_sebelum: { nilai: lama.nilai }, p_sesudah: { nilai: body.nilai },
  });

  return ok(c, { kunci, nilai: body.nilai });
});

// =============================================================================
// FORM BUILDER
// =============================================================================

app.get('/form_fields', async (c) => {
  const { data } = await db(c.env)
    .from('form_fields')
    .select('kunci, label, tipe, opsi, wajib, bisa_diedit_peserta, bantuan, urutan')
    .eq('aktif', true).order('urutan');
  return ok(c, data ?? []);
});

app.get('/form_fields/admin', wajibLogin, butuhIzin('KELOLA_FORM'), async (c) => {
  const { data } = await db(c.env).from('form_fields').select('*').order('urutan');
  return ok(c, data ?? []);
});

const skemaField = z.object({
  kunci: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Kunci harus huruf kecil dan garis bawah'),
  label: z.string().min(2).max(160),
  tipe: z.enum(['TEKS', 'ANGKA', 'PILIHAN', 'PILIHAN_GANDA', 'TANGGAL', 'YA_TIDAK']),
  opsi: z.array(z.string()).optional(),
  wajib: z.boolean().default(false),
  bisa_diedit_peserta: z.boolean().default(true),
  bantuan: z.string().max(300).optional(),
  urutan: z.coerce.number().int().optional(),
});

app.post('/form_fields/admin', wajibLogin, butuhIzin('KELOLA_FORM'), async (c) => {
  const body = skemaField.parse(await c.req.json());

  if (['PILIHAN', 'PILIHAN_GANDA'].includes(body.tipe) && !body.opsi?.length) {
    throw new AppError('OPSI_KOSONG');
  }

  const { data, error } = await db(c.env)
    .from('form_fields').insert({ ...body, opsi: body.opsi ?? null })
    .select('*').single();

  if (error) {
    if (error.code === '23505') throw new AppError('KUNCI_SUDAH_DIPAKAI');
    throw new AppError('ERROR_SERVER', { pesan: error.message });
  }
  return dibuat(c, data);
});

app.patch('/form_fields/admin/:id', wajibLogin, butuhIzin('KELOLA_FORM'), async (c) => {
  const body = skemaField.partial().omit({ kunci: true }).parse(await c.req.json());
  const { data, error } = await db(c.env)
    .from('form_fields').update(body).eq('id', Number(c.req.param('id')))
    .select('*').maybeSingle();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

/**
 * Deactivate, never delete.
 *
 * There is no DELETE route on purpose: removing a field orphans every answer
 * already collected, and the gap only surfaces when the final report is being
 * assembled — far too late to fix.
 */
app.patch('/form_fields/admin/:id/nonaktif', wajibLogin, butuhIzin('KELOLA_FORM'), async (c) => {
  const { data, error } = await db(c.env)
    .from('form_fields').update({ aktif: false }).eq('id', Number(c.req.param('id')))
    .select('id, kunci, aktif').maybeSingle();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_DITEMUKAN');
  return ok(c, data);
});

// =============================================================================
// ACTIVITIES / XP VALUES
// =============================================================================

app.get('/activities', async (c) => {
  const { data } = await db(c.env)
    .from('activities').select('kode, nama, xp_default, bisa_diubah').order('kode');
  return ok(c, data ?? []);
});

app.patch('/activities/admin/:id', wajibLogin, butuhIzin('ATUR_XP'), async (c) => {
  const p = c.get('pengguna');
  const body = z.object({ xp_default: z.coerce.number().int().min(0).max(1000) })
    .parse(await c.req.json());

  const id = Number(c.req.param('id'));
  const { data: lama } = await db(c.env)
    .from('activities').select('*').eq('id', id).maybeSingle();
  if (!lama) throw new AppError('TIDAK_DITEMUKAN');

  // Fixed-value activities exist so that some XP cannot be renegotiated
  // mid-event.
  if (!lama.bisa_diubah) {
    throw new AppError('TIDAK_BERHAK', undefined, 'Nilai XP kegiatan ini tidak bisa diubah');
  }

  const { data, error } = await db(c.env)
    .from('activities').update(body).eq('id', id).select('*').single();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  await rpc(c.env, 'catat_audit', {
    p_user_id: p.id, p_aksi: 'UBAH_NILAI_XP',
    p_tabel: 'activities', p_record_id: String(id),
    p_sebelum: { xp_default: lama.xp_default }, p_sesudah: body,
  });

  return ok(c, data);
});

// =============================================================================
// FAIRNESS CHECK
// =============================================================================

/**
 * GET /points/admin/kewajaran
 *
 * Flags only — it never penalises anyone. The committee decides.
 *
 * Once prizes are attached, the exposure worth watching is not participants
 * gaming the app; it is an alumnus quietly handing the maximum to every friend
 * who walks past. When someone protests that a winner cheated, this is what
 * turns the answer into evidence instead of an opinion.
 */
app.get('/points/admin/kewajaran', wajibLogin, wajibSuperAdmin, async (c) => {
  const hasil = await rpc(c.env, 'cek_kewajaran_xp', {});
  return ok(c, hasil);
});

// =============================================================================
// AUDIT
// =============================================================================

app.get('/audit', wajibLogin, butuhIzin('LIHAT_AUDIT'), async (c) => {
  const { hal, per, dari, sampai } = bacaPaginasi(c, 50);
  const aksi = c.req.query('aksi');
  const dariTgl = c.req.query('dari');
  const sampaiTgl = c.req.query('sampai');

  let q = db(c.env)
    .from('audit_logs')
    .select('id, aksi, tabel, record_id, sebelum, sesudah, created_at, users(nama)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(dari, sampai);

  if (aksi) q = q.eq('aksi', aksi);
  if (dariTgl) q = q.gte('created_at', dariTgl);
  if (sampaiTgl) q = q.lte('created_at', sampaiTgl);

  const { data, count, error } = await q;
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return halaman(c, data ?? [], count ?? 0, hal, per);
});

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * GET /exports/lpj
 *
 * Returns raw JSON; the browser assembles the spreadsheet. Building an .xlsx
 * server-side means holding the whole workbook in memory, which on the free
 * tier is a reliable way to kill the worker. An admin laptop has memory to
 * spare and no such limit.
 *
 * Six sheets. There is no payment sheet: Administration keeps the books
 * themselves, so this system has no amounts to report.
 */
app.get('/exports/lpj', wajibLogin, butuhIzin('EKSPOR_LPJ'), async (c) => {
  const [peserta, presensi, kunjungan, rekapXp, audit, fields] = await Promise.all([
    db(c.env).from('participants')
      .select('id, asal_sekolah, kelas, target_jurusan, kampus_impian, extra_fields, created_at, users!inner(nama, email), users2:users!inner(registrations(status, kode_registrasi))'),
    db(c.env).from('attendances')
      .select('waktu_terima, sumber, users!attendances_user_id_fkey(nama, participants(asal_sekolah, kelas)), sessions(nama, events(nama))'),
    db(c.env).from('booth_visits')
      .select('waktu_terima, jenis, xp_diberikan, dibatalkan, booths(nama_tampilan, booth_type), universities(nama), participants(users(nama), asal_sekolah)')
      .eq('dibatalkan', false),
    db(c.env).rpc('hitung_leaderboard', { p_limit: 1000 }),
    db(c.env).from('audit_logs')
      .select('aksi, tabel, record_id, sebelum, sesudah, created_at, users(nama)')
      .order('created_at', { ascending: false }).limit(5000),
    db(c.env).from('form_fields').select('kunci, label').eq('aktif', true).order('urutan'),
  ]);

  const totalDaftar = peserta.data?.length ?? 0;
  const totalLunas = (peserta.data ?? []).filter((p) => {
    const reg = (p as Record<string, unknown>)['users2'] as { registrations?: { status: string }[] } | null;
    return reg?.registrations?.[0]?.status === 'LUNAS';
  }).length;

  return ok(c, {
    ringkasan: {
      total_daftar: totalDaftar,
      total_lunas: totalLunas,
      total_hadir: new Set((presensi.data ?? []).map((a) => JSON.stringify(a.users))).size,
      dibuat_at: new Date().toISOString(),
    },
    // Column headings for the admin-defined questions, so sheet 2 can carry
    // them without the frontend guessing.
    kolom_form_builder: fields.data ?? [],
    peserta: peserta.data ?? [],
    presensi: presensi.data ?? [],
    kunjungan_booth: kunjungan.data ?? [],
    rekap_xp: rekapXp.data ?? {},
    audit: audit.data ?? [],
  });
});

/** Streaming CSV fallback, for when the admin laptop struggles with the workbook. */
app.get('/exports/csv/:jenis', wajibLogin, butuhIzin('EKSPOR_LPJ'), async (c) => {
  const jenis = c.req.param('jenis');

  const sumber: Record<string, () => Promise<Record<string, unknown>[]>> = {
    peserta: async () => {
      const { data } = await db(c.env).from('participants')
        .select('asal_sekolah, kelas, target_jurusan, kampus_impian, users!inner(nama, email)');
      return (data ?? []).map((p) => ({
        nama: (p.users as unknown as { nama: string }).nama,
        email: (p.users as unknown as { email: string }).email,
        asal_sekolah: p.asal_sekolah, kelas: p.kelas,
        target_jurusan: p.target_jurusan, kampus_impian: p.kampus_impian,
      }));
    },
    presensi: async () => {
      const { data } = await db(c.env).from('attendances')
        .select('waktu_terima, sumber, users!attendances_user_id_fkey(nama), sessions(nama)');
      return (data ?? []).map((a) => ({
        nama: (a.users as unknown as { nama: string })?.nama,
        sesi: (a.sessions as unknown as { nama: string })?.nama,
        waktu: a.waktu_terima, sumber: a.sumber,
      }));
    },
  };

  const ambil = sumber[jenis];
  if (!ambil) throw new AppError('TIDAK_DITEMUKAN');

  const rows = await ambil();
  if (!rows.length) return c.text('', 200, { 'Content-Type': 'text/csv; charset=utf-8' });

  const kolom = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [
    kolom.join(','),
    ...rows.map((r) => kolom.map((k) => escape(r[k])).join(',')),
  ].join('\n');

  return c.text('﻿' + csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="cgtk-${jenis}.csv"`,
  });
});

export default app;
