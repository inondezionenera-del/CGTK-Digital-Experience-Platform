import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError, pastikanSukses } from '../lib/errors';
import { ok, halaman, bacaPaginasi } from '../lib/respond';
import * as setting from '../lib/settings';
import { wajibLogin } from '../middleware/auth';
import { satu } from '../lib/relasi';
import { butuhIzin, wajibSuperAdmin } from '../middleware/rbac';

/**
 * Payments.
 *
 * The system never handles money. Administration collects it their own way —
 * cash at the counselling room, or through a form — keeps their own books, and
 * marks people settled here. What is stored is who pressed the button and when,
 * nothing about amounts.
 *
 * Two things this module is responsible for:
 *   1. Keeping the payment link out of the participant's page.
 *   2. Refusing to settle anyone whose profile is still incomplete.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// -----------------------------------------------------------------------------
// GET /payments/cara-bayar
//
// Note what is absent: the form URL. It is never serialised into a response,
// so it cannot be copied out of the page, the view-source, or the network tab
// before the participant has actually earned access to it.
// -----------------------------------------------------------------------------
app.get('/cara-bayar', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  if (!p.participantId) throw new AppError('TIDAK_BERHAK');

  const { data: reg } = await db(c.env)
    .from('registrations')
    .select('kode_registrasi, profil_lengkap, status')
    .eq('user_id', p.id)
    .maybeSingle();

  if (!reg) throw new AppError('TIDAK_DITEMUKAN');

  if (!reg.profil_lengkap) {
    const hasil = await rpc<{ data: { field_belum_diisi: string[] } }>(
      c.env, 'hitung_profil_lengkap', { p_participant_id: p.participantId },
    );
    return ok(c, {
      profil_lengkap: false,
      link_bayar: null,
      field_belum_diisi: hasil?.data?.field_belum_diisi ?? [],
      pesan: 'Lengkapi profilmu dulu untuk membuka cara pembayaran.',
    });
  }

  const [harga, petunjuk, batas, link] = await Promise.all([
    setting.teks(c.env, 'harga_tampil', ''),
    setting.teks(c.env, 'teks_petunjuk_bayar', ''),
    setting.teks(c.env, 'batas_akhir_pembayaran', ''),
    setting.teks(c.env, 'link_pembayaran', ''),
  ]);

  return ok(c, {
    profil_lengkap: true,
    kode_registrasi: reg.kode_registrasi,
    harga_tampil: harga || null,
    petunjuk: petunjuk || null,
    batas_akhir: batas || null,
    status: reg.status,
    // A flag, not an address. The button is rendered from this.
    form_tersedia: Boolean(link),
  });
});

// -----------------------------------------------------------------------------
// GET /payments/buka
//
// The redirect that keeps the form URL off the page. Every condition is checked
// here, server-side, before the address is ever revealed.
//
// Worth being straight about the limits: once the form opens, its address is
// visible in the participant's own address bar, and anyone can screenshot the
// form and send it on. No system prevents that.
//
// It does not matter much. The registration code is the real control — someone
// who never registered has no valid code, so Administration will not find them
// when marking payments and their QR is never issued. The layers here stop
// casual resharing, which is all they need to do.
// -----------------------------------------------------------------------------
app.get('/buka', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  if (!p.participantId) throw new AppError('TIDAK_BERHAK');

  const { data: reg } = await db(c.env)
    .from('registrations')
    .select('kode_registrasi, profil_lengkap, status')
    .eq('user_id', p.id)
    .maybeSingle();

  if (!reg) throw new AppError('TIDAK_DITEMUKAN');
  if (!reg.profil_lengkap) throw new AppError('PROFIL_BELUM_LENGKAP');
  if (reg.status === 'LUNAS') throw new AppError('SUDAH_LUNAS');

  const batas = await setting.teks(c.env, 'batas_akhir_pembayaran', '');
  if (batas) {
    const habis = new Date(batas);
    if (!Number.isNaN(habis.getTime()) && Date.now() > habis.getTime()) {
      throw new AppError('PENDAFTARAN_DITUTUP', undefined,
        'Batas akhir pembayaran sudah lewat. Hubungi panitia.');
    }
  }

  const link = await setting.teks(c.env, 'link_pembayaran', '');
  if (!link) throw new AppError('LINK_BELUM_DIATUR');

  // Prefilling the code turns sharing into a self-defeating act: a friend who
  // uses the forwarded link submits under the sharer's registration code.
  let tujuan = link;
  const entryId = await setting.teks(c.env, 'prefill_entry_id', '');
  if (entryId && link.includes('docs.google.com/forms')) {
    const u = new URL(link);
    u.searchParams.set('usp', 'pp_url');
    u.searchParams.set(entryId, reg.kode_registrasi);
    tujuan = u.toString();
  }

  return c.redirect(tujuan, 302);
});

// -----------------------------------------------------------------------------
// GET /payments/saya
// -----------------------------------------------------------------------------
app.get('/saya', wajibLogin, async (c) => {
  const p = c.get('pengguna');

  const { data } = await db(c.env)
    .from('registrations')
    .select('id, kode_registrasi, status, profil_lengkap, created_at, payments(ditandai_at, dibatalkan)')
    .eq('user_id', p.id)
    .maybeSingle();

  if (!data) throw new AppError('TIDAK_DITEMUKAN');

  const bayar = (data.payments as unknown as { ditandai_at: string; dibatalkan: boolean }[] | null)
    ?.find((x) => !x.dibatalkan);

  return ok(c, {
    kode_registrasi: data.kode_registrasi,
    status: data.status,
    profil_lengkap: data.profil_lengkap,
    ditandai_lunas_at: bayar?.ditandai_at ?? null,
  });
});

// -----------------------------------------------------------------------------
// GET /admin/payments/belum-lunas
//
// The working list for Administration: profile complete, payment not yet
// recorded. This is what they reconcile their own notes against.
// -----------------------------------------------------------------------------
app.get('/admin/belum-lunas', wajibLogin, butuhIzin('TANDAI_LUNAS'), async (c) => {
  const { hal, per, dari, sampai } = bacaPaginasi(c);
  const cari = (c.req.query('cari') ?? '').trim();

  let q = db(c.env)
    .from('registrations')
    .select('id, kode_registrasi, created_at, users!inner(nama, participants(asal_sekolah, kelas))', { count: 'exact' })
    .eq('status', 'MENUNGGU_PEMBAYARAN')
    .order('created_at', { ascending: true })
    .range(dari, sampai);

  if (cari) q = q.or(`kode_registrasi.ilike.%${cari}%`);

  const { data, count, error } = await q;
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  // Dirapikan jadi bentuk datar sebelum dikirim, bukan diteruskan apa adanya.
  //
  // Dua alasan. Pertama, bentuk mentah PostgREST untuk relasi bersarang susah
  // dipakai di layar dan berubah kalau select-nya disentuh sedikit saja.
  // Kedua, email ikut terbawa di versi sebelumnya padahal layar ini tidak
  // membutuhkannya: yang dikerjakan Administrasi di sini cuma menandai siapa
  // yang sudah membayar, dan pesertanya di bawah umur.
  //
  // satu(): relasi satu-ke-satu dikembalikan PostgREST sebagai objek kalau
  // kuncinya unik dan sebagai array kalau tidak. Menebaknya pernah membuat
  // tujuh endpoint menjawab 403 tanpa sebab yang kelihatan.
  // registrations TIDAK punya relasi langsung ke participants: keduanya
  // menunjuk users. Jadi jalurnya lewat users, dan participants dibuka satu
  // tingkat lebih dalam. Versi yang menyambung langsung dijawab PostgREST
  // dengan "Could not find a relationship between 'registrations' and
  // 'participants'".
  // Bentuk hasil embed bersarang PostgREST tidak bisa disimpulkan tipenya,
  // jadi dibentuk di sini sekali, bukan dengan cast tersebar di tiap baris.
  interface BarisMentah {
    id: string;
    kode_registrasi: string;
    status: string;
    profil_lengkap: boolean;
    created_at: string;
    users: unknown;
    payments: unknown;
  }

  const baris = ((data ?? []) as unknown as BarisMentah[]).map((r) => {
    const u = satu<{ nama: string; participants: unknown }>(r.users);
    const pt = satu<{ asal_sekolah: string; kelas: string }>(u?.participants);
    return {
      id: r.id,
      kode_registrasi: r.kode_registrasi,
      nama: u?.nama ?? 'Peserta',
      asal_sekolah: pt?.asal_sekolah ?? null,
      kelas: pt?.kelas ?? null,
      created_at: r.created_at,
    };
  });

  return halaman(c, baris, count ?? 0, hal, per);
});

// -----------------------------------------------------------------------------
// GET /admin/payments/peserta
//
// Satu daftar berisi SEMUA peserta, apa pun statusnya, untuk layar Pendaftaran
// & Pembayaran.
//
// Yang sudah ada cuma /admin/belum-lunas, dan itu sengaja hanya menampilkan
// yang menunggu dibayar. Akibatnya tidak ada satu tempat pun untuk menjawab
// pertanyaan paling sering ditanyakan panitia: siapa saja yang SUDAH membayar.
// Untuk mengetahuinya orang harus mengekspor CSV dan membukanya di Excel.
//
// Pembayaran di sistem ini MANUAL: panitia yang menandai, dan tabel payments
// mencatat siapa yang menandai, kapan, dan catatannya. Ketiganya ikut dikirim
// supaya setiap penandaan bisa ditelusuri dari layar, bukan dari log.
//
// Nomor telepon dan email TIDAK ikut. Pesertanya di bawah umur, dan layar ini
// tidak membutuhkan keduanya untuk mengerjakan tugasnya.
// -----------------------------------------------------------------------------
app.get('/admin/peserta', wajibLogin, butuhIzin('TANDAI_LUNAS'), async (c) => {
  const { hal, per, dari, sampai } = bacaPaginasi(c, 25);
  const status = (c.req.query('status') ?? '').trim().toUpperCase();
  const cari = (c.req.query('cari') ?? '').trim();

  let q = db(c.env)
    .from('registrations')
    .select(
      'id, kode_registrasi, status, profil_lengkap, created_at, ' +
      'users!inner(nama, participants(asal_sekolah, kelas)), ' +
      'payments(ditandai_at, catatan, dibatalkan, users:ditandai_oleh(nama))',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(dari, sampai);

  const STATUS_SAH = ['PROFIL_BELUM_LENGKAP', 'MENUNGGU_PEMBAYARAN', 'LUNAS', 'DIBATALKAN'];
  if (status && STATUS_SAH.includes(status)) q = q.eq('status', status);

  // Dicari lewat kode registrasi. Nama ada di tabel lain, dan menyaring lewat
  // relasi di PostgREST ikut membuang baris yang relasinya kosong.
  if (cari) q = q.ilike('kode_registrasi', `%${cari}%`);

  const { data, count, error } = await q;
  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });

  // Bentuk hasil embed bersarang PostgREST tidak bisa disimpulkan tipenya,
  // jadi dibentuk di sini sekali, bukan dengan cast tersebar di tiap baris.
  interface BarisMentah {
    id: string;
    kode_registrasi: string;
    status: string;
    profil_lengkap: boolean;
    created_at: string;
    users: unknown;
    payments: unknown;
  }

  const baris = ((data ?? []) as unknown as BarisMentah[]).map((r) => {
    const u = satu<{ nama: string; participants: unknown }>(r.users);
    const pt = satu<{ asal_sekolah: string; kelas: string }>(u?.participants);
    // payments bisa lebih dari satu kalau pernah dibatalkan lalu ditandai lagi.
    type Bayar = {
      ditandai_at?: string; catatan?: string; dibatalkan?: boolean; users?: unknown;
    };
    const bayarSemua = (Array.isArray(r.payments) ? r.payments : [r.payments])
      .filter(Boolean) as Bayar[];
    const b = bayarSemua.find((x) => !x.dibatalkan) ?? bayarSemua[0];

    return {
      id: r.id,
      kode_registrasi: r.kode_registrasi,
      nama: u?.nama ?? 'Peserta',
      asal_sekolah: pt?.asal_sekolah ?? null,
      kelas: pt?.kelas ?? null,
      status: r.status,
      profil_lengkap: r.profil_lengkap,
      daftar_at: r.created_at,
      bayar: b
        ? {
            ditandai_at: b.ditandai_at ?? null,
            ditandai_oleh: satu<{ nama: string }>(b.users)?.nama ?? null,
            catatan: b.catatan ?? null,
            dibatalkan: Boolean(b.dibatalkan),
          }
        : null,
    };
  });

  return halaman(c, baris, count ?? 0, hal, per);
});

// -----------------------------------------------------------------------------
// GET /admin/payments/hitungan
//
// Jumlah per status, dihitung di server dengan count head. Dipakai kartu angka
// di atas daftar supaya panitia tahu keadaan keseluruhan tanpa membuka tiap
// saringan satu per satu.
// -----------------------------------------------------------------------------
app.get('/admin/hitungan', wajibLogin, butuhIzin('TANDAI_LUNAS'), async (c) => {
  const d = db(c.env);
  const H = { count: 'exact' as const, head: true };

  const [semua, belumLengkap, menunggu, lunas, batal] = await Promise.all([
    d.from('registrations').select('*', H),
    d.from('registrations').select('*', H).eq('status', 'PROFIL_BELUM_LENGKAP'),
    d.from('registrations').select('*', H).eq('status', 'MENUNGGU_PEMBAYARAN'),
    d.from('registrations').select('*', H).eq('status', 'LUNAS'),
    d.from('registrations').select('*', H).eq('status', 'DIBATALKAN'),
  ]);

  const n = (r: { count: number | null }) => r.count ?? 0;
  return ok(c, {
    total: n(semua),
    profil_belum_lengkap: n(belumLengkap),
    menunggu_pembayaran: n(menunggu),
    lunas: n(lunas),
    dibatalkan: n(batal),
  });
});

// -----------------------------------------------------------------------------
// POST /admin/payments/tandai-lunas
// -----------------------------------------------------------------------------
const skemaTandai = z.object({
  kode_registrasi: z.string().min(4),
  catatan: z.string().max(500).optional(),
});

app.post('/admin/tandai-lunas', wajibLogin, butuhIzin('TANDAI_LUNAS'), async (c) => {
  const p = c.get('pengguna');
  const body = skemaTandai.parse(await c.req.json());

  const hasil = await rpc<{ sukses: boolean; kode?: string; pesan?: string; data?: unknown }>(
    c.env, 'tandai_lunas', {
      p_kode_registrasi: body.kode_registrasi,
      p_oleh: p.id,
      p_catatan: body.catatan ?? null,
    },
  );

  pastikanSukses(hasil);
  return ok(c, hasil.data);
});

// -----------------------------------------------------------------------------
// POST /admin/payments/tandai-lunas-massal
//
// Still manual — Administration decides who is settled, one code at a time.
// The difference is that they paste thirty codes from their notes instead of
// running the same search five hundred times.
//
// Results come back per code. A bare count would be useless: the failures are
// the interesting part, and they are almost always a participant who mistyped
// their code on the payment form.
// -----------------------------------------------------------------------------
const skemaMassal = z.object({
  kode_registrasi: z.array(z.string().min(4)).min(1).max(200),
  catatan: z.string().max(500).optional(),
});

app.post('/admin/tandai-lunas-massal', wajibLogin, butuhIzin('TANDAI_LUNAS'), async (c) => {
  const p = c.get('pengguna');
  const body = skemaMassal.parse(await c.req.json());

  const rincian: {
    kode: string; status: 'LUNAS' | 'GAGAL'; nama?: string; alasan?: string; pesan?: string;
  }[] = [];

  for (const kode of body.kode_registrasi) {
    const hasil = await rpc<{
      sukses: boolean; kode?: string; pesan?: string; data?: { nama?: string };
    }>(c.env, 'tandai_lunas', {
      p_kode_registrasi: kode,
      p_oleh: p.id,
      p_catatan: body.catatan ?? null,
    });

    if (hasil?.sukses) {
      rincian.push({ kode, status: 'LUNAS', nama: hasil.data?.nama });
    } else {
      rincian.push({ kode, status: 'GAGAL', alasan: hasil?.kode, pesan: hasil?.pesan });
    }
  }

  const berhasil = rincian.filter((r) => r.status === 'LUNAS').length;

  return ok(c, {
    berhasil,
    gagal: rincian.length - berhasil,
    rincian,
    // Ready to paste straight back in after the codes are corrected.
    kode_gagal: rincian.filter((r) => r.status === 'GAGAL').map((r) => r.kode),
  });
});

// -----------------------------------------------------------------------------
// POST /admin/payments/batal/:id
//
// Super Admin only, and it revokes the QR. If that happens on the day, the
// participant cannot get in — so it should never be one click away from the
// person doing routine data entry.
// -----------------------------------------------------------------------------
const skemaBatal = z.object({ alasan: z.string().min(3).max(500) });

app.post('/admin/batal/:id', wajibLogin, wajibSuperAdmin, async (c) => {
  const p = c.get('pengguna');
  const body = skemaBatal.parse(await c.req.json());

  const hasil = await rpc<{ sukses: boolean; kode?: string; data?: unknown }>(
    c.env, 'batal_lunas', {
      p_registration_id: c.req.param('id'),
      p_oleh: p.id,
      p_alasan: body.alasan,
    },
  );

  pastikanSukses(hasil);
  return ok(c, hasil.data);
});

export default app;
