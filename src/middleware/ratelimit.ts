import type { MiddlewareHandler } from 'hono';
import type { Env, Variables } from '../env';
import { AppError } from '../lib/errors';

/**
 * Rate limiting.
 *
 * The scanner runs in "fast mode" — under a second per participant. A frontend
 * bug that re-reads the same QR without a cooldown could fire hundreds of
 * requests a second from one phone and burn through the free tier on the
 * morning of the event. This is the backstop for that.
 *
 * Uses a fixed window in KV. Approximate at the boundaries, which is fine for
 * what it guards against. Without a KV binding it does nothing rather than
 * failing closed — losing rate limiting is survivable, refusing every scan is
 * not.
 */

export interface OpsiBatas {
  /** Requests allowed inside the window. */
  maks: number;
  /** Window length in seconds. */
  jendela: number;
  /** Bucket name, so different routes do not share a counter. */
  nama: string;
  /** Binding pembatas laju bawaan Cloudflare untuk bucket ini. */
  binding: 'BATAS_UMUM' | 'BATAS_SCAN' | 'BATAS_AUTH' | 'BATAS_CEK' | 'BATAS_SYNC';
}

export function batasi(opsi: OpsiBatas): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const pengguna = c.get('pengguna');

    // Identitas: id pengguna dulu, alamat IP sebagai cadangan.
    //
    // Urutan middleware yang menentukan ini benar atau tidak. loginOpsional
    // dipasang global SEBELUM pembatas di app.ts; tanpa itu pengguna belum ada
    // di context dan semua orang di satu WiFi berbagi satu jatah.
    const identitas =
      pengguna?.id ??
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for') ??
      'anon';

    // Pembatas bawaan Cloudflare, kalau tersedia.
    const bawaan = c.env[opsi.binding];
    if (bawaan) {
      const { success } = await bawaan.limit({ key: `${opsi.nama}:${identitas}` });
      if (!success) {
        c.header('Retry-After', String(opsi.jendela));
        throw new AppError('TERLALU_SERING', { batas: opsi.maks, jendela_detik: opsi.jendela });
      }
      return next();
    }

    // Cadangan: hitungan sendiri di KV.
    //
    // DISIMPAN tapi TIDAK bisa diandalkan, dan itu ditulis di sini supaya tidak
    // ada yang mengira pagar ini rapat. Hasil baca KV di-cache di edge paling
    // cepat 60 detik, sama panjang dengan jendelanya, jadi hitungannya nyaris
    // selalu terbaca nol dan hampir tidak pernah menolak siapa pun. Dia cuma
    // berguna kalau binding bawaan hilang, dan lebih baik ada daripada tidak
    // ada sama sekali.
    const kv = c.env.RATE_LIMIT;
    if (!kv) return next();

    const bucket = Math.floor(Date.now() / (opsi.jendela * 1000));
    const kunci = `rl:${opsi.nama}:${identitas}:${bucket}`;
    const sekarang = Number((await kv.get(kunci)) ?? 0);

    if (sekarang >= opsi.maks) {
      c.header('Retry-After', String(opsi.jendela));
      throw new AppError('TERLALU_SERING', { batas: opsi.maks, jendela_detik: opsi.jendela });
    }

    try {
      await kv.put(kunci, String(sekarang + 1), { expirationTtl: opsi.jendela + 10 });
    } catch (e) {
      // Kehilangan pembatas laju masih bisa ditanggung; menolak setiap scan
      // tidak. Jadi kegagalannya dicatat, bukan dilempar.
      console.error('rate limit gagal menulis', {
        nama: opsi.nama,
        pesan: e instanceof Error ? e.message : String(e),
      });
    }

    await next();
  };
}

/** Limits from the API contract. */
export const BATAS = {
  // 60, bukan 10.
  //
  // Bucket ini dipakai POST /auth/sinkron, dan itu BUKAN percobaan login:
  // tidak ada kata sandi yang bisa ditebak di sini. Yang masuk ke sana sudah
  // membawa JWT yang terbit dari Google lewat Supabase, dan endpoint-nya cuma
  // menukar token itu dengan identitas serta daftar izin.
  //
  // Frontend memanggilnya tiap kali aplikasi dimuat, jadi me-refresh beberapa
  // kali atau membuka beberapa tab sudah cukup menembus 10. Diuji di browser:
  // membuka tiga halaman lalu me-refresh masing-masing sekali sudah membuat
  // /auth/sinkron dijawab 429, dan akibatnya pengguna tidak bisa masuk sama
  // sekali.
  auth:      { nama: 'auth',   maks: 60,  jendela: 60, binding: 'BATAS_AUTH' },
  // 60, bukan 30. Satu pemindai di pintu masuk yang lancar bisa melewati 30
  // peserta dalam satu menit, dan pagar yang menolak panitia yang bekerja
  // dengan benar lebih merugikan daripada pagar yang sedikit longgar.
  scan:      { nama: 'scan',   maks: 60,  jendela: 60, binding: 'BATAS_SCAN' },
  sync:      { nama: 'sync',   maks: 5,   jendela: 60, binding: 'BATAS_SYNC' },
  cekStatus: { nama: 'cek',    maks: 10,  jendela: 60, binding: 'BATAS_CEK' },
  // 240, bukan 120.
  //
  // Sekarang kuncinya per pengguna, bukan per alamat IP, jadi angka ini jatah
  // satu orang. Satu halaman di aplikasi ini memanggil dua sampai empat
  // endpoint, dashboard panitia menyegarkan diri tiap menit, dan pengumuman
  // ditanya tiap tiga puluh detik. Panitia yang berpindah belasan layar dalam
  // satu menit di hari acara sudah cukup untuk menembus 120, dan sudah
  // terjadi waktu menguji lewat browser.
  umum:      { nama: 'umum',   maks: 240, jendela: 60, binding: 'BATAS_UMUM' },
} as const;
