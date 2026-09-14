import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError, pastikanSukses } from '../lib/errors';
import { ok, dibuat, halaman, bacaPaginasi } from '../lib/respond';
import { bacaQr, hashToken } from '../lib/qr';
import { wajibLogin } from '../middleware/auth';
import { butuhIzin, wajibSuperAdmin } from '../middleware/rbac';
import { batasi, BATAS } from '../middleware/ratelimit';

/**
 * Session attendance — the scanner the Administration division runs at the door.
 *
 * Six outcomes, each with a colour the field staff can read at a glance. The
 * one that matters most is SUDAH_SCAN: it is shown in yellow, not red, because
 * it is not a fault. It means the system worked.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const skemaScan = z.object({
  isi_qr: z.string().min(8),
  session_id: z.coerce.number().int().positive(),
  scan_uuid: z.string().uuid(),
  waktu_scan: z.string().datetime({ offset: true }),
  mode_cepat: z.boolean().optional(),
});

// -----------------------------------------------------------------------------
// POST /attendance/scan
// -----------------------------------------------------------------------------
app.post('/scan',
  wajibLogin,
  butuhIzin('SCAN_PRESENSI'),
  batasi(BATAS.scan),
  async (c) => {
    const p = c.get('pengguna');
    const body = skemaScan.parse(await c.req.json());

    // Signature first. A forged code is rejected without touching the database
    // — the same check a phone performs while offline.
    const qr = await bacaQr(body.isi_qr, c.env.QR_SIGNING_SECRET);
    if (!qr.valid) throw new AppError('QR_TIDAK_VALID', { alasan: qr.alasan });

    const hasil = await rpc<{ sukses: boolean; kode?: string; pesan?: string; data?: unknown }>(
      c.env, 'scan_presensi', {
        p_qr_token: qr.token,
        p_session_id: body.session_id,
        p_scan_uuid: body.scan_uuid,
        p_waktu_scan: body.waktu_scan,
        p_oleh: p.id,
        p_sumber: 'ONLINE',
      },
    );

    pastikanSukses(hasil);

    // A resent scan_uuid answers 200, not 409. The phone that sent it did
    // nothing wrong, and an error would make it retry forever.
    return dibuat(c, hasil.data);
  });

// -----------------------------------------------------------------------------
// POST /attendance/manual
//
// For the participant whose phone is flat, which happens every year. Requires a
// written reason and lands in the audit log.
// -----------------------------------------------------------------------------
const skemaManual = z.object({
  participant_id: z.string().uuid(),
  session_id: z.coerce.number().int().positive(),
  alasan: z.string().min(3).max(200),
});

app.post('/manual', wajibLogin, butuhIzin('SCAN_PRESENSI'), async (c) => {
  const p = c.get('pengguna');
  const body = skemaManual.parse(await c.req.json());

  const { data: peserta } = await db(c.env)
    .from('participants')
    .select('user_id, asal_sekolah, users!inner(nama)')
    .eq('id', body.participant_id)
    .maybeSingle();

  if (!peserta) throw new AppError('TIDAK_DITEMUKAN');

  const { data: sesi } = await db(c.env)
    .from('sessions').select('id, nama, status, xp')
    .eq('id', body.session_id).maybeSingle();

  if (!sesi) throw new AppError('SESI_TIDAK_DITEMUKAN');
  if (sesi.status !== 'ACTIVE') throw new AppError('SESI_DITUTUP');

  const { data: baris, error } = await db(c.env)
    .from('attendances')
    .insert({
      user_id: peserta.user_id,
      session_id: body.session_id,
      scan_uuid: crypto.randomUUID(),
      waktu_scan: new Date().toISOString(),
      scanned_by: p.id,
      sumber: 'MANUAL',
      alasan_manual: body.alasan,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') throw new AppError('SUDAH_SCAN');
    throw new AppError('ERROR_SERVER', { pesan: error.message });
  }

  await rpc(c.env, 'tambah_xp', {
    p_participant_id: body.participant_id,
    p_activity_kode: 'PRESENSI_SESI',
    p_sumber_tipe: 'ATTENDANCE',
    p_sumber_id: baris.id,
    p_xp_override: sesi.xp,
    p_diberikan_oleh: p.id,
  });

  await rpc(c.env, 'catat_audit', {
    p_user_id: p.id,
    p_aksi: 'PRESENSI_MANUAL',
    p_tabel: 'attendances',
    p_record_id: String(baris.id),
    p_sesudah: { alasan: body.alasan, session_id: body.session_id },
  });

  return dibuat(c, {
    nama: (peserta.users as unknown as { nama: string }).nama,
    sesi: sesi.nama,
    xp_didapat: sesi.xp,
    sumber: 'MANUAL',
  });
});

// -----------------------------------------------------------------------------
// GET /attendance/saya
// -----------------------------------------------------------------------------
app.get('/saya', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  const { data } = await db(c.env)
    .from('attendances')
    .select('id, waktu_scan, sessions(id, nama, lokasi, events(nama))')
    .eq('user_id', p.id)
    .order('waktu_scan', { ascending: true });

  return ok(c, data ?? []);
});

// -----------------------------------------------------------------------------
// GET /admin/attendance  — per-session roll
// -----------------------------------------------------------------------------
app.get('/admin', wajibLogin, butuhIzin('EKSPOR_PRESENSI'), async (c) => {
  const { hal, per, dari, sampai } = bacaPaginasi(c, 50);
  const sessionId = c.req.query('session_id');

  let q = db(c.env)
    .from('attendances')
    .select(`
      id, waktu_scan, waktu_terima, sumber, alasan_manual,
      users!attendances_user_id_fkey ( nama, email, participants ( asal_sekolah, kelas ) ),
      sessions ( id, nama )
    `, { count: 'exact' })
    .order('waktu_terima', { ascending: true })
    .range(dari, sampai);

  if (sessionId) q = q.eq('session_id', Number(sessionId));

  const { data, count, error } = await q;
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  return halaman(c, data ?? [], count ?? 0, hal, per);
});

// -----------------------------------------------------------------------------
// GET /admin/attendance/rekap
// -----------------------------------------------------------------------------
app.get('/admin/rekap', wajibLogin, butuhIzin('EKSPOR_PRESENSI'), async (c) => {
  const { data: sesi } = await db(c.env)
    .from('sessions')
    .select('id, nama, status, events(nama)')
    .order('urutan');

  const hasil = [];
  for (const s of sesi ?? []) {
    const { count } = await db(c.env)
      .from('attendances')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', s.id);
    hasil.push({ ...s, jumlah_hadir: count ?? 0 });
  }

  return ok(c, hasil);
});

// -----------------------------------------------------------------------------
// GET /sync/data-offline
//
// Downloaded before the event, while there is still signal. Ships token
// hashes rather than the tokens themselves: a staff phone that goes missing
// should not carry everything needed to mint working badges.
// -----------------------------------------------------------------------------
app.get('/sync/data-offline', wajibLogin,
  butuhIzin('SCAN_PRESENSI', 'SCAN_BOOTH'),
  async (c) => {
    const [{ data: peserta }, { data: sesi }, { data: booth }] = await Promise.all([
      db(c.env).from('participants')
        .select('qr_token, asal_sekolah, users!inner(nama), registrations:users!inner(registrations(status))')
        .not('qr_token', 'is', null),
      db(c.env).from('sessions').select('id, nama, status, xp').neq('status', 'DRAFT'),
      db(c.env).from('booths').select('id, nama_tampilan, xp_max, status, kode_booth').neq('status', 'DRAFT'),
    ]);

    const daftar = await Promise.all((peserta ?? []).map(async (p) => {
      const u = p.users as unknown as { nama: string };
      const reg = (p.registrations as unknown as { registrations?: { status: string }[] })?.registrations?.[0];
      return {
        token_hash: await hashToken(p.qr_token as string),
        nama: u.nama,
        sekolah: p.asal_sekolah,
        lunas: reg?.status === 'LUNAS',
      };
    }));

    return ok(c, {
      // Lets a phone reject a forged QR with no network at all.
      kunci_verifikasi: c.env.QR_SIGNING_SECRET ? 'aktif' : 'tidak-dikonfigurasi',
      peserta: daftar,
      sesi: sesi ?? [],
      booth: booth ?? [],
      diunduh_at: new Date().toISOString(),
    });
  });

// -----------------------------------------------------------------------------
// POST /sync/attendance
//
// Always answers 200, even when part of the batch is rejected — the caller
// reads `rincian` row by row. An HTTP error on a partially accepted batch would
// make the phone resend rows the server already has.
//
// Resending an identical batch is safe: scan_uuid makes each row idempotent.
// -----------------------------------------------------------------------------
const skemaSync = z.object({
  batch: z.array(z.object({
    isi_qr: z.string().min(8),
    session_id: z.coerce.number().int().positive(),
    scan_uuid: z.string().uuid(),
    waktu_scan: z.string().datetime({ offset: true }),
  })).min(1).max(20),
});

app.post('/sync/attendance',
  wajibLogin,
  butuhIzin('SCAN_PRESENSI'),
  batasi(BATAS.sync),
  async (c) => {
    const p = c.get('pengguna');
    const body = skemaSync.parse(await c.req.json());

    const rincian: {
      scan_uuid: string; status: 'DITERIMA' | 'DITOLAK'; alasan?: string; pesan?: string;
    }[] = [];

    for (const item of body.batch) {
      const qr = await bacaQr(item.isi_qr, c.env.QR_SIGNING_SECRET);

      if (!qr.valid) {
        rincian.push({ scan_uuid: item.scan_uuid, status: 'DITOLAK', alasan: 'QR_TIDAK_VALID' });
        await catatKonflik(c.env, item.scan_uuid, 'ATTENDANCE', 'QR_TIDAK_VALID', item, p.id);
        continue;
      }

      const hasil = await rpc<{ sukses: boolean; kode?: string; pesan?: string }>(
        c.env, 'scan_presensi', {
          p_qr_token: qr.token,
          p_session_id: item.session_id,
          p_scan_uuid: item.scan_uuid,
          p_waktu_scan: item.waktu_scan,
          p_oleh: p.id,
          p_sumber: 'OFFLINE_SYNC',
        },
      );

      if (hasil?.sukses) {
        rincian.push({ scan_uuid: item.scan_uuid, status: 'DITERIMA' });
      } else {
        rincian.push({
          scan_uuid: item.scan_uuid, status: 'DITOLAK',
          alasan: hasil?.kode, pesan: hasil?.pesan,
        });
        // Two phones that were both offline could not know about each other.
        // The data stays correct, but the staff already saw a green tick — so
        // the clash is recorded for them to see afterwards.
        await catatKonflik(c.env, item.scan_uuid, 'ATTENDANCE',
          hasil?.kode ?? 'TIDAK_DIKETAHUI', item, p.id);
      }
    }

    const diterima = rincian.filter((r) => r.status === 'DITERIMA').length;
    return ok(c, { diterima, ditolak: rincian.length - diterima, rincian });
  });

async function catatKonflik(
  env: Env, scanUuid: string, tipe: string, alasan: string,
  payload: unknown, oleh: string,
) {
  await db(env).from('sync_conflicts').insert({
    scan_uuid: scanUuid, tipe, alasan, payload, dilaporkan_oleh: oleh,
  });
}

// -----------------------------------------------------------------------------
// GET /admin/scan-ditolak
// -----------------------------------------------------------------------------
app.get('/admin/scan-ditolak', wajibLogin, butuhIzin('EKSPOR_PRESENSI'), async (c) => {
  const { hal, per, dari, sampai } = bacaPaginasi(c, 50);
  const { data, count, error } = await db(c.env)
    .from('sync_conflicts')
    .select('*, users(nama)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(dari, sampai);

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  return halaman(c, data ?? [], count ?? 0, hal, per);
});

// -----------------------------------------------------------------------------
// DELETE /admin/attendance/:id  — Super Admin, audited
// -----------------------------------------------------------------------------
app.delete('/admin/:id', wajibLogin, wajibSuperAdmin, async (c) => {
  const p = c.get('pengguna');
  const id = Number(c.req.param('id'));

  const { data: lama } = await db(c.env)
    .from('attendances').select('*').eq('id', id).maybeSingle();
  if (!lama) throw new AppError('TIDAK_DITEMUKAN');

  await db(c.env).from('attendances').delete().eq('id', id);
  await rpc(c.env, 'catat_audit', {
    p_user_id: p.id, p_aksi: 'HAPUS_PRESENSI',
    p_tabel: 'attendances', p_record_id: String(id), p_sebelum: lama,
  });

  return ok(c, { dihapus: true });
});

export default app;
