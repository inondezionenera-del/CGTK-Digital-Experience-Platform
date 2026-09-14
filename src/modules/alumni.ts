import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { db } from '../lib/db';
import { AppError } from '../lib/errors';
import { ok } from '../lib/respond';
import * as setting from '../lib/settings';
import { wajibLogin } from '../middleware/auth';
import { wajibAlumni } from '../middleware/rbac';

/**
 * Alumni dashboard.
 *
 * Alumni are invited guests, not committee members. They travel in on their own
 * time, sit through a whole day, and get nothing out of it unless we make the
 * experience worth their while — so this is deliberately more than a scan
 * button.
 *
 * Two rules run through the whole module:
 *
 *   1. No alumnus ever sees another booth's numbers. A quiet major booth is not
 *      the fault of the person staffing it, and ranking them would sour the one
 *      relationship we most want to keep for next year.
 *
 *   2. Participant contact details are never exposed, and only participants who
 *      ticked the consent box appear at all.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', wajibLogin, wajibAlumni);

async function repSaya(c: { env: Env; get: (k: 'pengguna') => { representativeId?: number } }) {
  const id = c.get('pengguna').representativeId;
  if (!id) throw new AppError('BUKAN_ALUMNI');
  const { data } = await db(c.env)
    .from('representatives')
    .select('id, angkatan, bio, foto_url, university_id, major_id, universities(nama, singkatan), majors(nama), users(nama)')
    .eq('id', id).maybeSingle();
  if (!data) throw new AppError('BUKAN_ALUMNI');
  return data;
}

/** Booths this alumnus staffs, across every event. */
async function boothSaya(env: Env, univId: number | null, majorId: number | null) {
  const { data } = await db(env)
    .from('booths')
    .select('id, nama_tampilan, lokasi, status, booth_type, events(nama, tipe)')
    .or(`university_id.eq.${univId ?? 0},major_id.eq.${majorId ?? 0}`)
    .neq('status', 'DRAFT');

  return (data ?? []).filter((b) =>
    (b.booth_type === 'KAMPUS' && univId) || (b.booth_type === 'JURUSAN' && majorId));
}

// -----------------------------------------------------------------------------
// GET /alumni/dashboard
// -----------------------------------------------------------------------------
app.get('/dashboard', async (c) => {
  const rep = await repSaya(c as never);
  const booths = await boothSaya(c.env, rep.university_id, rep.major_id);
  const ids = booths.map((b) => b.id);

  const hariIni = new Date(); hariIni.setHours(0, 0, 0, 0);
  const { count } = ids.length
    ? await db(c.env).from('booth_visits')
        .select('id', { count: 'exact', head: true })
        .in('booth_id', ids).eq('dibatalkan', false)
        .gte('waktu_terima', hariIni.toISOString())
    : { count: 0 };

  return ok(c, {
    nama: (rep.users as unknown as { nama: string } | null)?.nama,
    kampus: (rep.universities as unknown as { nama: string } | null)?.nama,
    jurusan: (rep.majors as unknown as { nama: string } | null)?.nama,
    angkatan: rep.angkatan,
    foto_url: rep.foto_url,
    profil_lengkap: Boolean(rep.bio && rep.foto_url),
    booth: booths,
    pengunjung_hari_ini: count ?? 0,
  });
});

// -----------------------------------------------------------------------------
// GET /alumni/sambutan
//
// Shown on first sign-in. Alumni never attend a committee briefing, so without
// this they arrive knowing neither where their table is nor who to ask.
// -----------------------------------------------------------------------------
app.get('/sambutan', async (c) => {
  const rep = await repSaya(c as never);
  const booths = await boothSaya(c.env, rep.university_id, rep.major_id);

  const { data: lo } = await db(c.env)
    .from('lo_assignments')
    .select('users!lo_assignments_lo_user_id_fkey(nama, email)')
    .eq('representative_id', rep.id);

  return ok(c, {
    nama: (rep.users as unknown as { nama: string } | null)?.nama,
    kampus: (rep.universities as unknown as { nama: string } | null)?.nama,
    jurusan: (rep.majors as unknown as { nama: string } | null)?.nama,
    booth: booths.map((b) => ({
      acara: (b.events as unknown as { nama: string } | null)?.nama,
      nama_tampilan: b.nama_tampilan,
      lokasi: b.lokasi,
    })),
    lo: (lo ?? []).map((l) => l.users),
    langkah: [
      'Lengkapi profil: foto, angkatan, dan satu kalimat perkenalan.',
      'Unggah materi kampus — link Google Drive paling gampang.',
      'Di hari-H, buka halaman utama dan tekan MULAI SCAN.',
    ],
  });
});

// -----------------------------------------------------------------------------
// GET /alumni/statistik
//
// Own booth only. No averages, no comparison, no ranking.
// -----------------------------------------------------------------------------
app.get('/statistik', async (c) => {
  const rep = await repSaya(c as never);

  if (await setting.modeHemat(c.env)) {
    return ok(c, null, { pesan: 'Statistik sementara dimatikan (Mode Hemat)' });
  }

  const booths = await boothSaya(c.env, rep.university_id, rep.major_id);
  const ids = booths.map((b) => b.id);
  if (!ids.length) return ok(c, { hari_ini: 0, total: 0, jam_ramai: [], asal_sekolah: [] });

  const { data: kunjungan } = await db(c.env)
    .from('booth_visits')
    .select('waktu_terima, participants(asal_sekolah, selected_attempt_id)')
    .in('booth_id', ids).eq('dibatalkan', false);

  const hariIni = new Date(); hariIni.setHours(0, 0, 0, 0);
  const semua = kunjungan ?? [];
  const hari = semua.filter((v) => new Date(v.waktu_terima) >= hariIni);

  const perJam = new Map<string, number>();
  for (const v of hari) {
    const jam = `${String(new Date(v.waktu_terima).getHours()).padStart(2, '0')}:00`;
    perJam.set(jam, (perJam.get(jam) ?? 0) + 1);
  }

  const perSekolah = new Map<string, number>();
  for (const v of semua) {
    const s = (v.participants as unknown as { asal_sekolah: string } | null)?.asal_sekolah;
    if (s) perSekolah.set(s, (perSekolah.get(s) ?? 0) + 1);
  }

  return ok(c, {
    booth: booths.map((b) => b.nama_tampilan),
    hari_ini: hari.length,
    total: semua.length,
    jam_ramai: [...perJam.entries()]
      .map(([jam, jumlah]) => ({ jam, jumlah }))
      .sort((a, b) => a.jam.localeCompare(b.jam)),
    asal_sekolah: [...perSekolah.entries()]
      .map(([sekolah, jumlah]) => ({ sekolah, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah).slice(0, 10),
  });
});

// -----------------------------------------------------------------------------
// GET /alumni/pengunjung
//
// Only participants who consented. No phone numbers, no email addresses —
// these are high-school students, and the consent they gave was for their
// *interests* to be visible, not their contact details.
// -----------------------------------------------------------------------------
app.get('/pengunjung', async (c) => {
  const rep = await repSaya(c as never);
  const booths = await boothSaya(c.env, rep.university_id, rep.major_id);
  const ids = booths.map((b) => b.id);
  if (!ids.length) return ok(c, [], { total: 0, disembunyikan: 0 });

  const { data } = await db(c.env)
    .from('booth_visits')
    .select(`
      id, waktu_terima, ditandai,
      participants!inner (
        id, asal_sekolah, kelas, target_jurusan, izin_bagi_data,
        users ( nama )
      )
    `)
    .in('booth_id', ids).eq('dibatalkan', false)
    .order('waktu_terima', { ascending: false });

  const semua = data ?? [];
  const boleh = semua.filter((v) =>
    (v.participants as unknown as { izin_bagi_data: boolean }).izin_bagi_data);

  return ok(c,
    boleh.map((v) => {
      const p = v.participants as unknown as {
        asal_sekolah: string; kelas: string; target_jurusan: string | null;
        users: { nama: string } | null;
      };
      return {
        visit_id: v.id,
        nama: p.users?.nama,
        asal_sekolah: p.asal_sekolah,
        kelas: p.kelas,
        minat_jurusan: p.target_jurusan,
        waktu: v.waktu_terima,
        ditandai: v.ditandai,
      };
    }),
    { total: boleh.length, disembunyikan: semua.length - boleh.length },
  );
});

// -----------------------------------------------------------------------------
// GET /alumni/ditandai
// -----------------------------------------------------------------------------
app.get('/ditandai', async (c) => {
  const p = c.get('pengguna');
  const { data } = await db(c.env)
    .from('booth_visits')
    .select('id, waktu_terima, catatan, participants!inner(asal_sekolah, kelas, target_jurusan, izin_bagi_data, users(nama))')
    .eq('representative_id', p.representativeId!)
    .eq('ditandai', true).eq('dibatalkan', false);

  return ok(c, (data ?? [])
    .filter((v) => (v.participants as unknown as { izin_bagi_data: boolean }).izin_bagi_data)
    .map((v) => {
      const x = v.participants as unknown as {
        asal_sekolah: string; kelas: string; target_jurusan: string | null;
        users: { nama: string } | null;
      };
      return {
        visit_id: v.id, nama: x.users?.nama,
        asal_sekolah: x.asal_sekolah, kelas: x.kelas,
        minat_jurusan: x.target_jurusan, catatan: v.catatan,
        waktu: v.waktu_terima,
      };
    }));
});

// -----------------------------------------------------------------------------
// GET /alumni/sertifikat
//
// The thing volunteers ask for most often, and that committees most often
// forget. Costs almost nothing here — it rides on the same PDF assembly the
// participant report already uses.
// -----------------------------------------------------------------------------
app.get('/sertifikat', async (c) => {
  const rep = await repSaya(c as never);
  const booths = await boothSaya(c.env, rep.university_id, rep.major_id);
  const ids = booths.map((b) => b.id);

  const { count } = ids.length
    ? await db(c.env).from('booth_visits')
        .select('id', { count: 'exact', head: true })
        .in('booth_id', ids).eq('dibatalkan', false)
    : { count: 0 };

  return ok(c, {
    nama: (rep.users as unknown as { nama: string } | null)?.nama,
    kampus: (rep.universities as unknown as { nama: string } | null)?.nama,
    jurusan: (rep.majors as unknown as { nama: string } | null)?.nama,
    booth_dijaga: booths.map((b) => b.nama_tampilan),
    jumlah_peserta_ditemui: count ?? 0,
    tanggal: new Date().toISOString().slice(0, 10),
    nomor_sertifikat: `CGTK/2027/ALM/${String(rep.id).padStart(3, '0')}`,
  });
});

// -----------------------------------------------------------------------------
// GET /alumni/rekap  — after the event
// -----------------------------------------------------------------------------
app.get('/rekap', async (c) => {
  const rep = await repSaya(c as never);
  const booths = await boothSaya(c.env, rep.university_id, rep.major_id);
  const ids = booths.map((b) => b.id);
  if (!ids.length) return ok(c, { total_ditemui: 0, per_booth: [], sekolah_teratas: [] });

  const { data } = await db(c.env)
    .from('booth_visits')
    .select('booth_id, participants(asal_sekolah, kampus_impian)')
    .in('booth_id', ids).eq('dibatalkan', false);

  const semua = data ?? [];
  const namaKampus = (rep.universities as unknown as { nama: string } | null)?.nama;

  const memilihKampusIni = semua.filter((v) =>
    (v.participants as unknown as { kampus_impian: string | null } | null)?.kampus_impian === namaKampus).length;

  const perBooth = booths.map((b) => ({
    booth: b.nama_tampilan,
    pengunjung: semua.filter((v) => v.booth_id === b.id).length,
  }));

  const sekolah = new Map<string, number>();
  for (const v of semua) {
    const s = (v.participants as unknown as { asal_sekolah: string } | null)?.asal_sekolah;
    if (s) sekolah.set(s, (sekolah.get(s) ?? 0) + 1);
  }

  return ok(c, {
    total_ditemui: semua.length,
    menjadikan_kampus_ini_pilihan: memilihKampusIni,
    per_booth: perBooth,
    sekolah_teratas: [...sekolah.entries()]
      .map(([nama, jumlah]) => ({ nama, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah).slice(0, 5),
  });
});

export default app;
