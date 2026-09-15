import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env';
import { db, rpc } from '../lib/db';
import { AppError, pastikanSukses } from '../lib/errors';
import { ok } from '../lib/respond';
import * as setting from '../lib/settings';
import { wajibLogin, loginOpsional } from '../middleware/auth';
import { butuhIzin, wajibSuperAdmin } from '../middleware/rbac';

/**
 * Leaderboard.
 *
 * The rest of the gamification modules belong to Danar and live in his Python
 * service. This one stays here for two reasons: it is the heaviest query in the
 * system and the one everybody opens at once, and there is real prize money
 * behind it. Splitting the read path across two services on the day of the
 * event would mean two things that can be slow while five hundred people are
 * watching the same screen.
 *
 * The ranking itself is a Postgres function (`hitung_leaderboard`), so Danar
 * can call exactly the same logic from his side whenever he needs it — there is
 * only ever one definition of who is winning.
 */

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Cached in the isolate, not per request.
 *
 * Without this, 300 dashboards open at once means 300 full scans of the XP
 * ledger. With it the query runs a handful of times a minute no matter how many
 * people are looking — which is the whole reason the free tier survives the day.
 *
 * A Worker isolate is per-region and short-lived, so this is a best-effort
 * cache rather than a shared one. That is fine: the worst case is a few extra
 * queries, and the data here is public.
 */
let simpanan: { isi: unknown; sampai: number; limit: number } | null = null;

async function detikCache(env: Env): Promise<number> {
  // Economy mode stretches it to five minutes instead of switching it off. A
  // stale board is survivable; a database that cannot answer a scan is not.
  return (await setting.modeHemat(env)) ? 300 : 15;
}

interface Peringkat {
  posisi: number;
  participant_id: string;
  nama: string;
  asal_sekolah: string;
  total_xp: number;
  level: unknown;
  jumlah_booth: number;
}

interface HasilLeaderboard {
  beku: boolean;
  diperbarui_at: string;
  peringkat: Peringkat[];
  aturan_pemutus_seri: string[];
}

/** Frozen standings win over a live count — that is the point of freezing. */
async function ambilPapan(env: Env, limit: number): Promise<HasilLeaderboard & { beku: boolean }> {
  const { data: beku } = await db(env)
    .from('leaderboard_freeze')
    .select('dibekukan_at, snapshot')
    .not('dibekukan_at', 'is', null)
    .order('dibekukan_at', { ascending: false })
    .limit(1).maybeSingle();

  if (beku?.snapshot) {
    const snap = beku.snapshot as HasilLeaderboard;
    return {
      ...snap,
      beku: true,
      diperbarui_at: beku.dibekukan_at as string,
      peringkat: snap.peringkat.slice(0, limit),
    };
  }

  const hidup = await rpc<HasilLeaderboard>(env, 'hitung_leaderboard', { p_limit: limit });
  return { ...hidup, beku: false };
}

// -----------------------------------------------------------------------------
// GET /leaderboard
// -----------------------------------------------------------------------------
app.get('/', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 50), 1), 100);
  const ttl = await detikCache(c.env);

  if (simpanan && simpanan.limit >= limit && simpanan.sampai > Date.now()) {
    const isi = simpanan.isi as HasilLeaderboard;
    return ok(c, { ...isi, peringkat: isi.peringkat.slice(0, limit) },
      { cache_detik: ttl, dari_cache: true });
  }

  // Always fetch the larger page so a request for 10 can be served from the
  // same cache entry as a request for 50.
  const isi = await ambilPapan(c.env, 100);
  simpanan = { isi, sampai: Date.now() + ttl * 1000, limit: 100 };

  return ok(c, { ...isi, peringkat: isi.peringkat.slice(0, limit) },
    { cache_detik: ttl, dari_cache: false });
});

// -----------------------------------------------------------------------------
// GET /leaderboard/saya
//
// Answered from the full board rather than by counting one person, so the
// position shown to a participant can never disagree with the list they are
// looking at.
// -----------------------------------------------------------------------------
app.get('/saya', wajibLogin, async (c) => {
  const p = c.get('pengguna');
  if (!p.participantId) throw new AppError('BUKAN_PESERTA');

  const papan = await ambilPapan(c.env, 1000);
  const i = papan.peringkat.findIndex((r) => r.participant_id === p.participantId);

  if (i === -1) {
    return ok(c, {
      terdaftar: false,
      pesan: 'Kamu belum punya XP. Hadiri sesi atau kunjungi booth untuk mulai naik.',
    });
  }

  const saya = papan.peringkat[i]!;
  return ok(c, {
    terdaftar: true,
    beku: papan.beku,
    posisi: saya.posisi,
    total_xp: saya.total_xp,
    level: saya.level,
    jumlah_booth: saya.jumlah_booth,
    dari: papan.peringkat.length,
    // What actually moves people: the gap to the person immediately ahead.
    di_atas_saya: i > 0
      ? {
          posisi: papan.peringkat[i - 1]!.posisi,
          nama: papan.peringkat[i - 1]!.nama,
          selisih_xp: papan.peringkat[i - 1]!.total_xp - saya.total_xp,
        }
      : null,
  });
});

// -----------------------------------------------------------------------------
// GET /leaderboard/pemenang
//
// Empty until a Super Admin has confirmed. Announcing from a live board is how
// the winner changes while somebody is already walking to the stage.
// -----------------------------------------------------------------------------
app.get('/pemenang', loginOpsional, async (c) => {
  const { data } = await db(c.env)
    .from('leaderboard_freeze')
    .select('dibekukan_at, disahkan_at, jumlah_pemenang, snapshot')
    .not('disahkan_at', 'is', null)
    .order('disahkan_at', { ascending: false })
    .limit(1).maybeSingle();

  if (!data) {
    return ok(c, {
      disahkan: false,
      pemenang: [],
      pesan: 'Pemenang belum diumumkan.',
    });
  }

  const snap = data.snapshot as HasilLeaderboard;
  const jumlah = (data.jumlah_pemenang as number) ?? 3;

  return ok(c, {
    disahkan: true,
    disahkan_at: data.disahkan_at,
    dibekukan_at: data.dibekukan_at,
    jumlah_pemenang: jumlah,
    pemenang: snap.peringkat.slice(0, jumlah).map((r) => ({
      posisi: r.posisi, nama: r.nama, asal_sekolah: r.asal_sekolah,
      total_xp: r.total_xp, level: r.level,
    })),
    aturan_pemutus_seri: snap.aturan_pemutus_seri,
  });
});

// =============================================================================
// ADMIN
// =============================================================================

/**
 * GET /leaderboard/admin/pratinjau
 *
 * The top ten with a breakdown of where each person's XP came from. Meant to be
 * read before pressing the confirm button, not after a protest.
 */
app.get('/admin/pratinjau', wajibLogin, wajibSuperAdmin, async (c) => {
  const papan = await ambilPapan(c.env, 10);

  const rincian = [];
  for (const r of papan.peringkat) {
    const { data } = await db(c.env)
      .from('point_transactions')
      .select('xp, keterangan, created_at, dibatalkan, activities(kode, nama)')
      .eq('participant_id', r.participant_id)
      .order('created_at');

    rincian.push({
      ...r,
      transaksi: (data ?? []).map((t) => ({
        xp: t.xp,
        kegiatan: (t.activities as unknown as { nama: string } | null)?.nama ?? t.keterangan,
        waktu: t.created_at,
        dibatalkan: t.dibatalkan,
      })),
    });
  }

  return ok(c, { beku: papan.beku, peringkat: rincian });
});

app.post('/admin/bekukan', wajibLogin, butuhIzin('BEKUKAN_LEADERBOARD'), async (c) => {
  const p = c.get('pengguna');
  const body = z.object({ jumlah_pemenang: z.coerce.number().int().min(1).max(50).optional() })
    .parse(await c.req.json().catch(() => ({})));

  const hasil = await rpc<{ sukses: boolean; kode?: string; pesan?: string; data?: unknown }>(
    c.env, 'bekukan_leaderboard',
    { p_oleh: p.id, p_jumlah_pemenang: body.jumlah_pemenang ?? 3 },
  );
  pastikanSukses(hasil);

  // The board is frozen; whatever is cached is now wrong.
  simpanan = null;

  return ok(c, hasil.data);
});

app.post('/admin/sahkan', wajibLogin, wajibSuperAdmin, async (c) => {
  const p = c.get('pengguna');
  const body = z.object({
    jumlah_pemenang: z.coerce.number().int().min(1).max(50).optional(),
    catatan: z.string().max(500).optional(),
  }).parse(await c.req.json().catch(() => ({})));

  const hasil = await rpc<{ sukses: boolean; kode?: string; pesan?: string; data?: unknown }>(
    c.env, 'sahkan_pemenang',
    { p_oleh: p.id, p_jumlah: body.jumlah_pemenang ?? null, p_catatan: body.catatan ?? null },
  );
  pastikanSukses(hasil);

  return ok(c, hasil.data);
});

export default app;
