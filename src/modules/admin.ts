import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError } from '../lib/errors';
import { ok, dibuat, halaman, bacaPaginasi } from '../lib/respond';
import { satu } from '../lib/relasi';
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

/**
 * Izin mana yang boleh mengubah kelompok setelan mana.
 *
 * Dideklarasikan di atas kedua handler karena keduanya memakainya, dan const
 * tidak ikut terangkat seperti function.
 */
const IZIN_KELOMPOK: Record<string, string[]> = {
  bayar:  ['ATUR_PEMBAYARAN'],
  xp:     ['ATUR_XP'],
  form:   ['KELOLA_FORM'],
  kuis:   ['KELOLA_KUIS'],
  acara:  ['KELOLA_JADWAL'],
  sistem: ['PENGATURAN_SISTEM'],
};

app.get('/settings/admin', wajibLogin, async (c) => {
  const p = c.get('pengguna');

  // Pemeriksaan izin, yang sebelumnya TIDAK ADA di sini.
  //
  // Endpoint ini cuma memakai wajibLogin, jadi peserta biasa yang mengambil
  // alamatnya mendapat seluruh isi tabel settings: nilai XP tiap kegiatan,
  // jumlah pemenang, batas percobaan kuis, saklar Mode Hemat, sampai petunjuk
  // pembayaran. Sudah dicoba dengan token peserta sungguhan dan dijawab 200
  // berisi delapan belas baris.
  //
  // Yang boleh dibaca sekarang HANYA kelompok yang memang boleh dia ubah.
  // Divisi Pendanaan tidak perlu melihat setelan XP, dan Divisi Acara tidak
  // perlu melihat petunjuk pembayaran. Yang tidak punya izin satu pun ditolak.
  //
  // Setelan yang memang untuk peserta sudah punya pintunya sendiri di
  // GET /settings/publik, dan itu yang dipakai halaman depan.
  const kelompokBoleh = Object.entries(IZIN_KELOMPOK)
    .filter(([, butuh]) => butuh.some((i) => p.izin.includes(i)))
    .map(([kelompok]) => kelompok);

  const superAdmin = p.peran === 'SUPER_ADMIN';
  if (!superAdmin && kelompokBoleh.length === 0) {
    throw new AppError('TIDAK_BERHAK', undefined,
      'Kamu tidak punya akses ke pengaturan mana pun.');
  }

  let q = db(c.env)
    .from('settings').select('kunci, nilai, tipe, kelompok, deskripsi, diubah_at')
    .order('kelompok').order('kunci');

  if (!superAdmin) q = q.in('kelompok', kelompokBoleh);

  const { data, error } = await q;
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  // Rahasia tetap tersamar walaupun untuk admin. Tidak ada yang perlu MEMBACA
  // alamat form pembayaran dari layar pengaturan; mereka cuma perlu bisa
  // menggantinya.
  const rahasia = new Set(['link_pembayaran', 'prefill_entry_id']);
  const bolehLihatRahasia = p.izin.includes('ATUR_PEMBAYARAN') || superAdmin;

  return ok(c, (data ?? []).map((s) => ({
    ...s,
    nilai: rahasia.has(s.kunci) && !bolehLihatRahasia
      ? (s.nilai ? '••••••' : '')
      : s.nilai,
  })));
});

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

// -----------------------------------------------------------------------------
// GET /admin/ringkasan
//
// Angka untuk dashboard panitia. Sebelum ini tidak ada endpoint semacam ini
// sama sekali, jadi halaman /admin cuma bisa jadi daftar tautan: tidak ada
// satu pun angka yang bisa ditampilkan.
//
// Semua dihitung dengan count head, bukan menarik barisnya lalu menghitung
// panjang array. Lima ratus peserta yang ditarik utuh cuma untuk diambil
// jumlahnya adalah cara paling mudah membuat dashboard ini lambat justru di
// hari yang paling ramai.
//
// Izinnya longgar dengan sengaja: siapa pun yang punya salah satu izin
// operasional boleh melihat ringkasannya. Yang dikembalikan cuma JUMLAH,
// tidak ada satu pun nama atau sekolah peserta, jadi tidak ada yang bocor
// walaupun yang membuka cuma pemindai.
// -----------------------------------------------------------------------------
// LIHAT_DASHBOARD SENGAJA tidak ada di daftar ini. Namanya terdengar seperti
// izin admin, tapi itu izin PESERTA untuk membuka dashboard-nya sendiri.
// Memasukkannya membuat endpoint ini dijawab 200 untuk semua peserta; sudah
// terjadi sekali dan ketahuan waktu diuji dengan token peserta sungguhan.
app.get('/admin/ringkasan', wajibLogin, butuhIzin(
  'TANDAI_LUNAS', 'SCAN_PRESENSI', 'SAKLAR_SESI', 'KELOLA_JADWAL',
  'KELOLA_BOOTH', 'LIHAT_ANALITIK', 'PENGATURAN_SISTEM',
), async (c) => {
  const d = db(c.env);
  const awalHariIni = new Date();
  awalHariIni.setHours(0, 0, 0, 0);
  const sejak = awalHariIni.toISOString();

  // Ditulis lugas satu per satu, bukan lewat pembantu generik. Tipe builder
  // PostgREST berubah begitu .eq() dipanggil, dan membungkusnya cuma membuat
  // kode yang harus ditipu dengan cast di tiap pemanggilan.
  //
  // head: true dengan count: 'exact' artinya server hanya mengirim angkanya,
  // tanpa satu baris pun. Lima ratus peserta yang ditarik utuh cuma untuk
  // dihitung panjangnya adalah cara paling mudah membuat dashboard ini lambat
  // justru di hari yang paling ramai.
  const H = { count: 'exact' as const, head: true };

  const [
    pendaftar, lunas, menunggu, dibatalkan,
    hadirHariIni, kunjunganHariIni,
    boothAktif, boothDraf,
    sesiAktif, sesiDraf,
    alumniAktif, alumniDiundang,
  ] = await Promise.all([
    d.from('registrations').select('*', H),
    d.from('registrations').select('*', H).eq('status', 'LUNAS'),
    d.from('registrations').select('*', H).eq('status', 'MENUNGGU_PEMBAYARAN'),
    d.from('registrations').select('*', H).eq('status', 'DIBATALKAN'),
    d.from('attendances').select('*', H).gte('waktu_terima', sejak),
    d.from('booth_visits').select('*', H).gte('waktu_terima', sejak).eq('dibatalkan', false),
    d.from('booths').select('*', H).eq('status', 'ACTIVE'),
    d.from('booths').select('*', H).eq('status', 'DRAFT'),
    d.from('sessions').select('*', H).eq('status', 'ACTIVE'),
    d.from('sessions').select('*', H).eq('status', 'DRAFT'),
    d.from('representatives').select('*', H).eq('status', 'AKTIF'),
    d.from('representatives').select('*', H).eq('status', 'DIUNDANG'),
  ]);

  const n = (r: { count: number | null }) => r.count ?? 0;

  // Sesi yang sedang dibuka, untuk ditulis namanya di dashboard. Panitia yang
  // membuka halaman ini di tengah acara ingin tahu sesi mana yang hidup, bukan
  // cuma berapa banyak.
  const { data: sesiHidup } = await d
    .from('sessions')
    .select('id, nama, lokasi')
    .eq('status', 'ACTIVE')
    .order('urutan')
    .limit(5);

  // Setelan pembayaran yang masih kosong. Ini yang paling sering jadi sebab
  // peserta tidak bisa membayar, dan paling mudah terlewat karena tidak
  // memunculkan error di mana pun.
  const { data: setelanBayar } = await d
    .from('settings')
    .select('kunci, nilai')
    .eq('kelompok', 'bayar');

  const bayarKosong = (setelanBayar ?? [])
    .filter((s) => !s.nilai && s.kunci !== 'prefill_entry_id')
    .map((s) => s.kunci);

  return ok(c, {
    pendaftaran: {
      total: n(pendaftar),
      lunas: n(lunas),
      menunggu: n(menunggu),
      dibatalkan: n(dibatalkan),
    },
    hari_ini: {
      presensi: n(hadirHariIni),
      kunjungan_booth: n(kunjunganHariIni),
    },
    booth: { aktif: n(boothAktif), draf: n(boothDraf) },
    sesi: { aktif: n(sesiAktif), draf: n(sesiDraf), sedang_hidup: sesiHidup ?? [] },
    alumni: { aktif: n(alumniAktif), diundang: n(alumniDiundang) },
    perlu_perhatian: {
      setelan_bayar_kosong: bayarKosong,
      booth_draf: n(boothDraf),
      alumni_belum_masuk: n(alumniDiundang),
    },
  });
});

// -----------------------------------------------------------------------------
// GET /users/panitia
//
// Daftar akun panitia, untuk layar yang perlu memilih orang: menugaskan LO ke
// alumni, misalnya. Tidak ada endpoint semacam ini sebelumnya, jadi penugasan
// LO mustahil dibuat lewat web walaupun endpoint penugasannya sudah ada.
//
// PESERTA dan ALUMNI SENGAJA tidak pernah ikut, apa pun yang diminta di query.
// Peserta berjumlah lima ratus orang dan di bawah umur; daftar lengkap nama
// dan email mereka tidak dibutuhkan layar mana pun, dan satu endpoint yang
// mengembalikannya adalah satu endpoint yang bisa disalahgunakan nanti.
// Peserta dicari lewat /participants/cari yang hanya mengembalikan dua puluh
// baris sekali cari dan tidak memuat email.
// -----------------------------------------------------------------------------
const PERAN_PANITIA = [
  'SUPER_ADMIN', 'DIV_ACARA', 'DIV_ADMINISTRASI', 'DIV_PENDANAAN', 'LO_PENDIDIKAN',
];

app.get('/users/panitia', wajibLogin, butuhIzin('UNDANG_ALUMNI', 'KELOLA_USER'), async (c) => {
  const diminta = (c.req.query('peran') ?? '').trim();
  const peran = diminta && PERAN_PANITIA.includes(diminta) ? [diminta] : PERAN_PANITIA;

  const { data, error } = await db(c.env)
    .from('users')
    .select('id, nama, email, status, roles!inner(kode, nama)')
    .in('roles.kode', peran)
    // Kolomnya status dengan nilai AKTIF, bukan boolean bernama aktif.
    .eq('status', 'AKTIF')
    .order('nama');

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  return ok(c, (data ?? []).map((u) => ({
    id: u.id,
    nama: u.nama,
    email: u.email,
    peran: satu<{ kode: string }>(u.roles)?.kode ?? null,
  })));
});

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
    // registrations.user_id UNIQUE, jadi PostgREST menempelkannya sebagai objek.
    const pemilik = (p as Record<string, unknown>)['users2'];
    const reg = satu<{ registrations?: unknown }>(pemilik)?.registrations;
    return satu<{ status: string }>(reg)?.status === 'LUNAS';
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
