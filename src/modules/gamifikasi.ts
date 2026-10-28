import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError, pastikanSukses } from '../lib/errors';
import { ok, dibuat } from '../lib/respond';
import * as setting from '../lib/settings';
import { wajibLogin } from '../middleware/auth';
import { butuhIzin } from '../middleware/rbac';

/**
 * Kuis minat bakat, misi, achievement, dan papan peringkat.
 *
 * Kenapa ini di Worker dan bukan di layanan Python Danar.
 *
 * Rencana awalnya modul ini miliknya, dan Worker cuma meneruskan lewat
 * src/modules/proxy.ts. Dua hal membuat rencana itu tidak bisa dipakai di hari
 * acara:
 *
 *   1. Layanan Python butuh deployment sendiri di Vercel. Selama belum ada,
 *      PYTHON_API_URL kosong dan /quiz, /missions, /achievements, /leaderboard
 *      semuanya menjawab 503. Itu lima layar peserta yang mati sekaligus, dan
 *      yang paling dipakai anak-anak: kuis dan papan peringkat.
 *
 *   2. Bentuk jawabannya tidak cocok. Frontend membaca amplop { sukses, data },
 *      sedangkan FastAPI mengembalikan array atau objek telanjang, dan proxy
 *      meneruskannya apa adanya. Jadi kalaupun layanannya hidup, setiap
 *      panggilan gamifikasi dari frontend menghasilkan undefined, bukan error
 *      yang kelihatan.
 *
 * Modul ini menjawab di awalan yang sama dengan amplop yang sama seperti
 * endpoint lain, jadi frontend tidak perlu tahu apa pun soal ini. /levels,
 * /cosmetics, dan /reports tetap diteruskan ke proxy; tidak ada halaman yang
 * memanggilnya sekarang.
 *
 * Satu hal yang TIDAK boleh berubah di sini: quiz_options.bobot adalah kunci
 * jawaban dan tidak pernah ikut keluar. Opsinya dipetakan satu per satu, bukan
 * di-select dengan tanda bintang, supaya kolom baru yang ditambahkan nanti
 * tidak ikut terkirim tanpa ada yang sadar.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Peserta hanya boleh membaca datanya sendiri; peran lain butuh izin. */
function pesertaSendiri(
  c: { get: (k: 'pengguna') => Variables['pengguna'] },
  diminta: string,
): string {
  const p = c.get('pengguna');
  const milik = p.participantId;

  if (!milik) throw new AppError('BUKAN_PESERTA');

  // Frontend tidak punya participant_id: yang dia kirim di path adalah id akun.
  // Jadi path tidak dipercaya sebagai identitas, cuma diperiksa supaya
  // permintaan ke data orang lain tetap ditolak dengan jelas.
  if (diminta && diminta !== milik && diminta !== p.id) {
    if (!p.izin.includes('LIHAT_ANALITIK') && p.peran !== 'SUPER_ADMIN') {
      throw new AppError('TIDAK_BERHAK', undefined, 'Itu bukan datamu.');
    }
    return diminta;
  }

  return milik;
}

// =============================================================================
// KUIS
// =============================================================================

interface BarisOpsi {
  id: number;
  question_id: number;
  teks: string;
  urutan: number;
}

app.get('/quiz/soal', wajibLogin, async (c) => {
  const { data: soal, error } = await db(c.env)
    .from('quiz_questions')
    .select('id, teks, urutan')
    .eq('aktif', true)
    .order('urutan');
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  const daftar = soal ?? [];
  if (daftar.length === 0) return ok(c, []);

  // bobot sengaja tidak ikut di-select.
  const { data: opsi, error: e2 } = await db(c.env)
    .from('quiz_options')
    .select('id, question_id, teks, urutan')
    .in('question_id', daftar.map((s) => s.id))
    .order('urutan');
  if (e2) throw new AppError('ERROR_SERVER', { pesan: e2.message });

  const perSoal = new Map<number, { id: number; teks: string }[]>();
  for (const o of (opsi ?? []) as BarisOpsi[]) {
    const isi = perSoal.get(o.question_id) ?? [];
    isi.push({ id: o.id, teks: o.teks });
    perSoal.set(o.question_id, isi);
  }

  return ok(c, daftar.map((s) => ({
    id: s.id,
    teks: s.teks,
    urutan: s.urutan,
    options: perSoal.get(s.id) ?? [],
  })));
});

app.post('/quiz/mulai', wajibLogin, async (c) => {
  const pid = pesertaSendiri(c, '');

  const maks = await setting.angka(c.env, 'max_percobaan_kuis', 3);

  const { count, error } = await db(c.env)
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('participant_id', pid);
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  const sudah = count ?? 0;
  if (sudah >= maks) {
    throw new AppError('KUIS_HABIS', { maks, sudah },
      `Kuis cuma bisa dikerjakan ${maks} kali, dan kesempatanmu sudah habis.`);
  }

  // Percobaan yang sudah dibuat tapi belum diselesaikan dipakai ulang. Tanpa
  // ini, peserta yang menutup tab di tengah kuis kehilangan satu kesempatan
  // dari tiga tanpa pernah melihat hasilnya.
  const { data: belumSelesai } = await db(c.env)
    .from('quiz_attempts')
    .select('id')
    .eq('participant_id', pid)
    .is('selesai_at', null)
    .order('id', { ascending: false })
    .limit(1);

  const lama = (belumSelesai ?? [])[0];
  if (lama) return ok(c, { id: lama.id, dilanjutkan: true });

  const { data, error: e2 } = await db(c.env)
    .from('quiz_attempts')
    .insert({
      participant_id: pid,
      nomor_percobaan: sudah + 1,
      jawaban: [],
      skor: {},
      hasil_jurusan: [],
      hasil_kampus: [],
    })
    .select('id')
    .single();
  if (e2) throw new AppError('ERROR_SERVER', { pesan: e2.message });

  return dibuat(c, { id: data!.id, dilanjutkan: false });
});

const skemaSelesai = z.object({
  attempt_id: z.coerce.number().int().positive(),
  answers: z.array(z.object({
    question_id: z.coerce.number().int().positive(),
    option_id: z.coerce.number().int().positive(),
  })).min(1),
});

app.post('/quiz/selesai', wajibLogin, async (c) => {
  const pid = pesertaSendiri(c, '');

  const badan = skemaSelesai.safeParse(await c.req.json().catch(() => ({})));
  if (!badan.success) {
    throw new AppError('DATA_TIDAK_VALID', { masalah: badan.error.issues });
  }
  const { attempt_id, answers } = badan.data;

  const { data: percobaan, error } = await db(c.env)
    .from('quiz_attempts')
    .select('id, participant_id, selesai_at')
    .eq('id', attempt_id)
    .maybeSingle();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!percobaan) throw new AppError('TIDAK_DITEMUKAN');

  // Dicocokkan dengan peserta pemilik token, bukan dengan apa pun dari badan
  // permintaan. attempt_id itu angka berurutan; tanpa pemeriksaan ini siapa
  // pun bisa menyelesaikan kuis orang lain dan mengambil XP-nya.
  if (percobaan.participant_id !== pid) {
    throw new AppError('TIDAK_BERHAK', undefined, 'Itu bukan percobaanmu.');
  }
  if (percobaan.selesai_at) {
    throw new AppError('SUDAH_AMBIL_POIN', undefined, 'Percobaan ini sudah selesai.');
  }

  // --- hitung skor per rumpun ---------------------------------------------
  const { data: opsi, error: e2 } = await db(c.env)
    .from('quiz_options')
    .select('id, bobot')
    .in('id', answers.map((a) => a.option_id));
  if (e2) throw new AppError('ERROR_SERVER', { pesan: e2.message });

  const skor: Record<string, number> = {};
  for (const o of (opsi ?? []) as { id: number; bobot: Record<string, number> }[]) {
    for (const [rumpun, nilai] of Object.entries(o.bobot ?? {})) {
      skor[rumpun] = (skor[rumpun] ?? 0) + Number(nilai ?? 0);
    }
  }

  const urut = Object.entries(skor).sort((a, b) => b[1] - a[1]);
  const rumpun = urut[0]?.[0] ?? 'Umum';

  // --- jurusan yang cocok --------------------------------------------------
  const { data: jurusan } = await db(c.env)
    .from('majors')
    .select('id, nama')
    .eq('aktif', true)
    .eq('rumpun', rumpun)
    .order('nama')
    .limit(5);

  // --- kampus yang cocok DAN benar-benar hadir -----------------------------
  //
  // Disaring ke kampus yang boothnya tidak DRAFT. Merekomendasikan kampus yang
  // tidak membuka meja cuma membuat peserta berkeliling mencari yang tidak ada,
  // dan itu kekecewaan yang terjadi di lapangan, bukan di layar.
  let kampus: { id: number; nama: string; singkatan: string }[] = [];
  const idJurusan = (jurusan ?? []).map((j) => j.id);

  if (idJurusan.length > 0) {
    const { data: pasangan } = await db(c.env)
      .from('university_majors')
      .select('university_id')
      .in('major_id', idJurusan);

    const idKampus = [...new Set((pasangan ?? []).map((p) => p.university_id))];

    if (idKampus.length > 0) {
      const { data: booth } = await db(c.env)
        .from('booths')
        .select('university_id')
        .in('university_id', idKampus)
        .neq('status', 'DRAFT');

      const hadir = [...new Set(
        (booth ?? []).map((b) => b.university_id).filter((x): x is number => x !== null),
      )];

      if (hadir.length > 0) {
        const { data } = await db(c.env)
          .from('universities')
          .select('id, nama, singkatan')
          .in('id', hadir)
          .eq('aktif', true)
          .order('nama')
          .limit(5);
        kampus = data ?? [];
      }
    }
  }

  const { error: e3 } = await db(c.env)
    .from('quiz_attempts')
    .update({
      jawaban: answers,
      skor,
      hasil_rumpun: rumpun,
      hasil_jurusan: jurusan ?? [],
      hasil_kampus: kampus,
      selesai_at: new Date().toISOString(),
    })
    .eq('id', attempt_id)
    // Dipasang lagi di WHERE, bukan cuma diperiksa di atas: dua permintaan yang
    // datang bersamaan tidak boleh dua-duanya lolos dan memberi XP dua kali.
    .is('selesai_at', null);
  if (e3) throw new AppError('ERROR_SERVER', { pesan: e3.message });

  // --- XP ------------------------------------------------------------------
  // Lewat fungsi database, bukan insert langsung ke point_transactions. Fungsi
  // itu satu-satunya penulis buku besar XP: dia yang menegakkan batas harian
  // dan mencatat sumbernya. XP yang gagal diberikan tidak membatalkan hasil
  // kuisnya; peserta tetap berhak melihat jurusan yang cocok untuknya.
  let xpDidapat = 0;
  try {
    await rpc(c.env, 'tambah_xp', {
      p_participant_id: pid,
      p_activity_kode: 'SELESAI_KUIS',
      // 'QUIZ', bukan 'KUIS'. point_transactions_sumber_tipe_check hanya
      // menerima ATTENDANCE, BOOTH_VISIT, QUIZ, MISSION, KOREKSI. Nilai yang
      // salah membuat tambah_xp gagal, dan karena kegagalannya sengaja tidak
      // membatalkan hasil kuis, akibatnya cuma XP yang diam-diam nol.
      p_sumber_tipe: 'QUIZ',
      p_sumber_id: attempt_id,
      p_xp_override: null,
      p_diberikan_oleh: null,
      p_catatan: `rumpun ${rumpun}`,
    });
    const { data: aktivitas } = await db(c.env)
      .from('activities')
      .select('xp_default')
      .eq('kode', 'SELESAI_KUIS')
      .maybeSingle();
    xpDidapat = aktivitas?.xp_default ?? 0;
  } catch (e) {
    console.error('tambah_xp setelah kuis gagal', {
      participant_id: pid,
      pesan: e instanceof Error ? e.message : String(e),
    });
  }

  return ok(c, {
    attempt_id,
    hasil_rumpun: rumpun,
    skor,
    hasil_jurusan: jurusan ?? [],
    hasil_kampus: kampus,
    xp_didapat: xpDidapat,
  });
});

// =============================================================================
// MISI
// =============================================================================

app.get('/missions/saya/:pid', wajibLogin, async (c) => {
  const pid = pesertaSendiri(c, c.req.param('pid'));

  const { data: misi, error } = await db(c.env)
    .from('missions')
    .select('id, nama, deskripsi, tipe, xp, event_id')
    .eq('aktif', true)
    .order('id');
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  const { data: kemajuan } = await db(c.env)
    .from('participant_missions')
    .select('mission_id, status, progress')
    .eq('participant_id', pid);

  const peta = new Map(
    (kemajuan ?? []).map((k) => [k.mission_id, k]),
  );

  return ok(c, (misi ?? []).map((m) => {
    const k = peta.get(m.id);
    return {
      id: m.id,
      nama: m.nama,
      deskripsi: m.deskripsi,
      tipe: m.tipe,
      xp: m.xp ?? 0,
      event_id: m.event_id,
      status: k?.status ?? 'BELUM',
      progress: k?.progress ?? 0,
    };
  }));
});

const skemaMisiSelesai = z.object({
  mission_id: z.coerce.number().int().positive(),
});

app.post('/missions/selesai', wajibLogin, async (c) => {
  const pid = pesertaSendiri(c, '');

  const badan = skemaMisiSelesai.safeParse(await c.req.json().catch(() => ({})));
  if (!badan.success) throw new AppError('DATA_TIDAK_VALID');
  const { mission_id } = badan.data;

  const { data: misi } = await db(c.env)
    .from('missions')
    .select('id, xp, aktif')
    .eq('id', mission_id)
    .maybeSingle();
  if (!misi || !misi.aktif) throw new AppError('TIDAK_DITEMUKAN');

  const { data: ada } = await db(c.env)
    .from('participant_missions')
    .select('status')
    .eq('participant_id', pid)
    .eq('mission_id', mission_id)
    .maybeSingle();

  // Sudah selesai: jawab tenang, jangan beri XP lagi, jangan anggap kesalahan.
  // HP yang mengirim ulang permintaan yang sama tidak boleh jadi XP dobel.
  if (ada?.status === 'SELESAI') {
    return ok(c, { status: 'SUDAH_SELESAI', xp_didapat: 0 });
  }

  const { error } = await db(c.env)
    .from('participant_missions')
    .upsert({
      participant_id: pid,
      mission_id,
      status: 'SELESAI',
      progress: 100,
      selesai_at: new Date().toISOString(),
    }, { onConflict: 'participant_id,mission_id' });
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  let xp = 0;
  try {
    await rpc(c.env, 'tambah_xp', {
      p_participant_id: pid,
      p_activity_kode: 'SELESAI_MISI',
      p_sumber_tipe: 'MISSION',
      p_sumber_id: mission_id,
      p_xp_override: misi.xp ?? null,
      p_diberikan_oleh: null,
      p_catatan: null,
    });
    xp = misi.xp ?? 0;
  } catch (e) {
    console.error('tambah_xp setelah misi gagal', {
      participant_id: pid, mission_id,
      pesan: e instanceof Error ? e.message : String(e),
    });
  }

  return ok(c, { status: 'SELESAI', xp_didapat: xp });
});

// =============================================================================
// ACHIEVEMENT
// =============================================================================

app.get('/achievements/saya/:pid', wajibLogin, async (c) => {
  const pid = pesertaSendiri(c, c.req.param('pid'));

  const { data: semua, error } = await db(c.env)
    .from('achievements')
    .select('id, kode, nama, deskripsi, ikon_url, syarat')
    .eq('aktif', true)
    .order('id');
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  const { data: didapat } = await db(c.env)
    .from('participant_achievements')
    .select('achievement_id, earned_at')
    .eq('participant_id', pid);

  const peta = new Map((didapat ?? []).map((d) => [d.achievement_id, d.earned_at]));

  // Yang belum didapat tetap dikirim, lengkap dengan syaratnya. Badge yang
  // disembunyikan sampai didapat tidak memotivasi siapa pun.
  return ok(c, (semua ?? []).map((a) => ({
    id: a.id,
    kode: a.kode,
    nama: a.nama,
    deskripsi: a.deskripsi,
    ikon_url: a.ikon_url,
    syarat: a.syarat,
    didapat: peta.has(a.id),
    earned_at: peta.get(a.id) ?? null,
  })));
});

// =============================================================================
// PAPAN PERINGKAT
// =============================================================================

interface BarisPeringkat {
  posisi: number;
  participant_id: string;
  nama: string;
  asal_sekolah?: string;
  total_xp: number;
  level?: unknown;
  jumlah_booth?: number;
}

app.get('/leaderboard', wajibLogin, async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50) || 50, 1), 200);

  // Pembekuan diperiksa di sini, bukan di dalam fungsi database. Fungsi
  // hitung_leaderboard selalu menulis 'beku', false dan tidak pernah membaca
  // tabel leaderboard_freeze; kalau dipercaya begitu saja, papan peringkat
  // tetap bergerak sesudah dibekukan dan pemenang yang diumumkan bisa berbeda
  // dari yang disahkan.
  const { data: freeze } = await db(c.env)
    .from('leaderboard_freeze')
    .select('dibekukan_at, snapshot')
    .order('dibekukan_at', { ascending: false })
    .limit(1);

  const beku = (freeze ?? [])[0];

  const mentah: BarisPeringkat[] = beku
    ? ((beku.snapshot?.peringkat ?? []) as BarisPeringkat[]).slice(0, limit)
    : (((await rpc<{ peringkat?: BarisPeringkat[] }>(
        c.env, 'hitung_leaderboard', { p_limit: limit },
      ))?.peringkat) ?? []);

  // asal_sekolah TIDAK diteruskan. Pesertanya di bawah umur, papan peringkat
  // ini terbuka untuk semua peserta, dan nama sekolah tidak dibutuhkan untuk
  // menampilkan urutan.
  return ok(c, {
    beku: Boolean(beku),
    dibekukan_at: beku?.dibekukan_at ?? null,
    baris: mentah.map((b, i) => ({
      peringkat: b.posisi ?? i + 1,
      participant_id: String(b.participant_id),
      nama: b.nama || 'Peserta',
      total_xp: Number(b.total_xp ?? 0),
    })),
  });
});

// =============================================================================
// KOSMETIK
//
// Hadiah yang tidak memberi keuntungan apa pun selain tampilan: warna nama,
// bingkai foto, latar paspor. Sebelumnya diteruskan ke layanan Python dan
// menjawab 503, padahal tabelnya sudah terisi tiga belas baris dan skemanya
// lengkap sampai kolom dipakai.
//
// Dua jalan terbuka, dan keduanya berbeda sifatnya:
//
//   syarat_level   terbuka sendiri begitu XP-nya cukup. Dihitung saat diminta,
//                  tidak disimpan, supaya tidak ada yang perlu menyinkronkan.
//   syarat_top15   diberikan sekali saat pemenang disahkan, dan ditulis ke
//                  participant_cosmetics supaya TETAP miliknya. Mengikatnya ke
//                  peringkat langsung akan membuat kosmetiknya berkedip hilang
//                  dan muncul sepanjang hari saat orang bergeser di papan.
//
// Yang terkunci tetap dikirim lengkap dengan syaratnya. Itu satu-satunya
// alasan orang mengejarnya; menyembunyikannya sampai terbuka membuatnya tidak
// berguna sebagai dorongan.
// =============================================================================

interface BarisKosmetik {
  id: number;
  tipe: string;
  nama: string;
  aset_url: string | null;
  nilai: string | null;
  syarat_level: number | null;
  syarat_top15: boolean;
}

app.get('/cosmetics', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  const pid = p.participantId;
  if (!pid) throw new AppError('BUKAN_PESERTA');

  const { data: semua, error } = await db(c.env)
    .from('cosmetics')
    .select('id, tipe, nama, aset_url, nilai, syarat_level, syarat_top15')
    .eq('aktif', true)
    .order('tipe')
    .order('syarat_level', { nullsFirst: true });
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  const { data: milik } = await db(c.env)
    .from('participant_cosmetics')
    .select('cosmetic_id, dipakai')
    .eq('participant_id', pid);

  const petaMilik = new Map((milik ?? []).map((m) => [m.cosmetic_id, m.dipakai]));

  const { data: xp } = await db(c.env).rpc('total_xp', { p_participant_id: pid });
  const { data: level } = await db(c.env).rpc('level_peserta', { p_total_xp: xp ?? 0 });
  const nomorLevel = (level as { nomor?: number } | null)?.nomor ?? 1;

  return ok(c, {
    level: nomorLevel,
    total_xp: xp ?? 0,
    daftar: ((semua ?? []) as BarisKosmetik[]).map((k) => {
      const diberikan = petaMilik.has(k.id);
      const cukupLevel = k.syarat_level !== null && nomorLevel >= k.syarat_level;
      return {
        id: k.id,
        tipe: k.tipe,
        nama: k.nama,
        aset_url: k.aset_url,
        nilai: k.nilai,
        syarat_level: k.syarat_level,
        syarat_top15: k.syarat_top15,
        terbuka: diberikan || cukupLevel,
        dipakai: petaMilik.get(k.id) === true,
      };
    }),
  });
});

const skemaPakai = z.object({
  cosmetic_id: z.coerce.number().int().positive(),
});

app.post('/cosmetics/pakai', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  const pid = p.participantId;
  if (!pid) throw new AppError('BUKAN_PESERTA');

  const badan = skemaPakai.safeParse(await c.req.json().catch(() => ({})));
  if (!badan.success) throw new AppError('DATA_TIDAK_VALID');

  const { data: k } = await db(c.env)
    .from('cosmetics')
    .select('id, tipe, syarat_level, syarat_top15, aktif')
    .eq('id', badan.data.cosmetic_id)
    .maybeSingle();
  if (!k || !k.aktif) throw new AppError('TIDAK_DITEMUKAN');

  // Syaratnya diperiksa DI SINI, bukan cuma di layar. Tanpa ini siapa pun
  // bisa memakai kosmetik juara dengan satu permintaan buatan sendiri, dan
  // satu-satunya hadiah lima belas besar kehilangan artinya.
  const { data: punya } = await db(c.env)
    .from('participant_cosmetics')
    .select('cosmetic_id')
    .eq('participant_id', pid)
    .eq('cosmetic_id', k.id)
    .maybeSingle();

  if (!punya) {
    if (k.syarat_top15) {
      throw new AppError('TIDAK_BERHAK', undefined,
        'Kosmetik ini cuma untuk lima belas besar.');
    }
    const { data: xp } = await db(c.env).rpc('total_xp', { p_participant_id: pid });
    const { data: level } = await db(c.env).rpc('level_peserta', { p_total_xp: xp ?? 0 });
    const nomor = (level as { nomor?: number } | null)?.nomor ?? 1;
    if (k.syarat_level !== null && nomor < k.syarat_level) {
      throw new AppError('TIDAK_BERHAK', undefined,
        `Terbuka di level ${k.syarat_level}. Level kamu sekarang ${nomor}.`);
    }
  }

  // Satu yang dipakai per tipe. Dimatikan dulu semuanya di tipe yang sama,
  // baru yang dipilih dinyalakan; dua warna nama sekaligus tidak punya arti.
  await db(c.env)
    .from('participant_cosmetics')
    .update({ dipakai: false })
    .eq('participant_id', pid)
    .eq('tipe', k.tipe);

  const { error } = await db(c.env)
    .from('participant_cosmetics')
    .upsert({
      participant_id: pid,
      cosmetic_id: k.id,
      tipe: k.tipe,
      dipakai: true,
      terbuka_at: new Date().toISOString(),
    }, { onConflict: 'participant_id,cosmetic_id' });

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  return ok(c, { cosmetic_id: k.id, tipe: k.tipe, dipakai: true });
});

// =============================================================================
// PEMBEKUAN DAN PENGESAHAN PEMENANG
//
// Fungsi databasenya sudah ada sejak migration 0009 dan sudah benar, tapi
// selama ini TIDAK ADA satu pun endpoint yang memanggilnya. Artinya papan
// peringkat tidak pernah bisa dibekukan dan pemenang tidak pernah bisa
// disahkan, kecuali ada yang membuka psql di tengah acara.
//
// Dua langkah, bukan satu, dan itu disengaja di rancangan aslinya:
//
//   1. Bekukan. Urutan berhenti bergerak dan disimpan sebagai snapshot. XP
//      boleh terus masuk, papan tidak ikut berubah.
//   2. Sahkan. Panitia memeriksa snapshot itu dulu, baru mengesahkan. Memeriksa
//      sesudah nama diumumkan di atas panggung sudah terlambat.
//
// Izinnya juga berbeda: membekukan boleh Divisi Acara, mengesahkan hanya Super
// Admin. Yang mengumumkan pemenang menanggung akibatnya kalau salah.
// =============================================================================

/**
 * GET /leaderboard/admin/status
 *
 * Supaya layar admin tahu harus menampilkan tombol yang mana tanpa menebak.
 */
app.get('/leaderboard/admin/status', wajibLogin, butuhIzin('BEKUKAN_LEADERBOARD'), async (c) => {
  const { data, error } = await db(c.env)
    .from('leaderboard_freeze')
    .select('id, dibekukan_at, disahkan_at, jumlah_pemenang, catatan, snapshot')
    .order('dibekukan_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  const snapshot = (data?.snapshot ?? null) as { peringkat?: BarisPeringkat[] } | null;

  return ok(c, {
    beku: Boolean(data?.dibekukan_at),
    dibekukan_at: data?.dibekukan_at ?? null,
    disahkan: Boolean(data?.disahkan_at),
    disahkan_at: data?.disahkan_at ?? null,
    jumlah_pemenang: data?.jumlah_pemenang ?? null,
    catatan: data?.catatan ?? null,
    // Nama pemenang ikut dikirim supaya panitia bisa memeriksanya SEBELUM
    // mengesahkan. asal_sekolah tidak diteruskan, sama seperti papan publik.
    pemenang: (snapshot?.peringkat ?? [])
      .slice(0, data?.jumlah_pemenang ?? 3)
      .map((b, i) => ({
        peringkat: b.posisi ?? i + 1,
        participant_id: String(b.participant_id),
        nama: b.nama || 'Peserta',
        total_xp: Number(b.total_xp ?? 0),
      })),
  });
});

const skemaBekukan = z.object({
  jumlah_pemenang: z.coerce.number().int().min(1).max(50).optional(),
});

app.post('/leaderboard/admin/bekukan', wajibLogin, butuhIzin('BEKUKAN_LEADERBOARD'), async (c) => {
  const p = c.get('pengguna');
  const badan = skemaBekukan.safeParse(await c.req.json().catch(() => ({})));
  if (!badan.success) throw new AppError('DATA_TIDAK_VALID');

  const jumlah =
    badan.data.jumlah_pemenang ?? (await setting.angka(c.env, 'jumlah_pemenang', 3));

  const hasil = await rpc<{ sukses: boolean; kode?: string; pesan?: string; data?: unknown }>(
    c.env, 'bekukan_leaderboard', { p_oleh: p.id, p_jumlah_pemenang: jumlah },
  );

  pastikanSukses(hasil);
  return ok(c, hasil.data);
});

const skemaSahkan = z.object({
  jumlah_pemenang: z.coerce.number().int().min(1).max(50).optional(),
  catatan: z.string().max(500).optional(),
});

app.post('/leaderboard/admin/sahkan', wajibLogin, butuhIzin('SAHKAN_PEMENANG'), async (c) => {
  const p = c.get('pengguna');
  const badan = skemaSahkan.safeParse(await c.req.json().catch(() => ({})));
  if (!badan.success) throw new AppError('DATA_TIDAK_VALID');

  const hasil = await rpc<{ sukses: boolean; kode?: string; pesan?: string; data?: unknown }>(
    c.env, 'sahkan_pemenang', {
      p_oleh: p.id,
      p_jumlah: badan.data.jumlah_pemenang ?? null,
      p_catatan: badan.data.catatan ?? null,
    },
  );

  pastikanSukses(hasil);
  return ok(c, hasil.data);
});

export default app;
