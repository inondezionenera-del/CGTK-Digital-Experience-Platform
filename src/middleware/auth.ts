import type { MiddlewareHandler } from 'hono';
import type { Env, Pengguna, Variables } from '../env';
import { AppError } from '../lib/errors';
import { satu } from '../lib/relasi';
import { db } from '../lib/db';

/**
 * Authentication.
 *
 * Token diverifikasi di sini dengan WebCrypto, bukan dengan menanyakannya ke
 * Supabase tiap permintaan: pada lima belas scan per detik di pintu masuk,
 * satu perjalanan bolak-balik per scan adalah lima belas yang sia-sia.
 *
 * DUA ALGORITMA, dan ini sebabnya login Google pernah gagal total.
 *
 * Dulu di sini cuma ada HS256 dengan SUPABASE_JWT_SECRET. Tapi proyek Supabase
 * ini sudah memakai kunci penanda tangan asimetris: endpoint
 * /auth/v1/.well-known/jwks.json miliknya memuat satu kunci ES256. Artinya
 * token yang benar-benar diterbitkan Supabase untuk orang yang login lewat
 * Google ditandatangani ES256, dan verifikasi HMAC terhadapnya SELALU gagal.
 *
 * Akibatnya persis seperti yang dilaporkan: orang menyelesaikan login Google,
 * kembali ke aplikasi, /auth/sinkron menolak tokennya, identitasnya tidak
 * pernah terisi, dan dia terlempar balik ke halaman masuk.
 *
 * Ini tidak pernah ketahuan dari pengujian karena semua token uji dibuat
 * sendiri dengan HS256 memakai SUPABASE_JWT_SECRET, jadi jalur yang diuji
 * bukan jalur yang dipakai orang sungguhan.
 *
 * HS256 TETAP didukung. Supabase masih menerima rahasia lama untuk sebagian
 * token, skrip loadtest memakainya, dan mematikannya tidak memberi keamanan
 * tambahan apa pun.
 *
 * `sub` di dalam token adalah UUID yang sama dengan public.users.id: baris
 * aplikasinya dibuat dengan id auth saat pertama kali masuk, jadi tidak perlu
 * tabel pemetaan terpisah.
 */

const enc = new TextEncoder();

function dariBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

interface Klaim {
  sub: string;
  email?: string;
  exp: number;
  [k: string]: unknown;
}

interface KunciJwk {
  kid?: string;
  kty?: string;
  alg?: string;
  crv?: string;
  [k: string]: unknown;
}

/**
 * Kunci publik Supabase, disimpan selama isolate hidup.
 *
 * Isinya kunci PUBLIK, bukan data pengguna, jadi aman dipakai bersama antar
 * permintaan di satu isolate. Disegarkan kalau ada kid yang tidak dikenal,
 * supaya perputaran kunci di Supabase tidak membuat semua orang gagal masuk
 * sampai ada yang men-deploy ulang.
 */
let jwksTersimpan: { kunci: Map<string, CryptoKey>; waktu: number } | null = null;
const JWKS_UMUR_MS = 10 * 60 * 1000;

async function ambilJwks(env: Env, paksa = false): Promise<Map<string, CryptoKey>> {
  const tersimpan = jwksTersimpan;
  if (!paksa && tersimpan && Date.now() - tersimpan.waktu < JWKS_UMUR_MS) {
    return tersimpan.kunci;
  }

  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new AppError('ERROR_SERVER', { pesan: 'Gagal mengambil kunci Supabase' });

  const { keys } = (await r.json()) as { keys?: KunciJwk[] };
  const peta = new Map<string, CryptoKey>();

  for (const k of keys ?? []) {
    if (!k.kid) continue;
    try {
      const algoritma =
        k.kty === 'EC'
          ? { name: 'ECDSA', namedCurve: (k.crv as string) ?? 'P-256' }
          : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
      peta.set(k.kid, await crypto.subtle.importKey('jwk', k as JsonWebKey, algoritma, false, ['verify']));
    } catch {
      // Satu kunci yang tidak bisa dibaca tidak boleh menjatuhkan sisanya.
    }
  }

  jwksTersimpan = { kunci: peta, waktu: Date.now() };
  return peta;
}

export async function verifikasiToken(token: string, env: Env): Promise<Klaim> {
  const bagian = token.split('.');
  if (bagian.length !== 3) throw new AppError('TOKEN_KEDALUWARSA');

  const [header, payload, signature] = bagian as [string, string, string];

  let kepala: { alg?: string; kid?: string };
  try {
    kepala = JSON.parse(new TextDecoder().decode(dariBase64Url(header)));
  } catch {
    throw new AppError('TOKEN_KEDALUWARSA');
  }

  const data = enc.encode(`${header}.${payload}`);
  const tandaTangan = dariBase64Url(signature);
  let cocok = false;

  if (kepala.alg === 'HS256') {
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(env.SUPABASE_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify'],
    );
    cocok = await crypto.subtle.verify('HMAC', key, tandaTangan, data);
  } else if (kepala.alg === 'ES256' || kepala.alg === 'RS256') {
    if (!kepala.kid) throw new AppError('TOKEN_KEDALUWARSA');

    // Dicoba dengan kunci yang tersimpan dulu; kalau kid-nya belum dikenal,
    // JWKS diambil ulang sekali. Perputaran kunci di Supabase tidak boleh
    // membuat semua orang gagal masuk sampai ada yang men-deploy ulang.
    let kunci = (await ambilJwks(env)).get(kepala.kid);
    if (!kunci) kunci = (await ambilJwks(env, true)).get(kepala.kid);
    if (!kunci) throw new AppError('TOKEN_KEDALUWARSA');

    const algoritma =
      kepala.alg === 'ES256'
        ? { name: 'ECDSA', hash: 'SHA-256' }
        : { name: 'RSASSA-PKCS1-v1_5' };
    cocok = await crypto.subtle.verify(algoritma, kunci, tandaTangan, data);
  } else {
    // Algoritma yang tidak dikenal ditolak, termasuk 'none'. Menerima apa pun
    // yang disebutkan token itu sendiri adalah cara klasik melewati verifikasi.
    throw new AppError('TOKEN_KEDALUWARSA');
  }

  if (!cocok) throw new AppError('TOKEN_KEDALUWARSA');

  const klaim = JSON.parse(new TextDecoder().decode(dariBase64Url(payload))) as Klaim;
  if (!klaim.sub) throw new AppError('TOKEN_KEDALUWARSA');
  if (klaim.exp && klaim.exp * 1000 < Date.now()) throw new AppError('TOKEN_KEDALUWARSA');

  return klaim;
}

async function muatPengguna(env: Env, userId: string): Promise<Pengguna> {
  const { data, error } = await db(env)
    .from('users')
    .select(`
      id, email, nama, status,
      roles!inner ( kode, role_permissions ( permissions ( kode ) ) ),
      participants ( id ),
      representatives ( id )
    `)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new AppError('ERROR_SERVER', { pesan: error.message });
  if (!data) throw new AppError('TIDAK_LOGIN');
  if (data.status !== 'AKTIF') throw new AppError('AKUN_DINONAKTIFKAN');

  const peran = (data.roles as unknown as { kode: string }).kode;

  const izin = ((data.roles as unknown as {
    role_permissions?: { permissions?: { kode: string } }[];
  }).role_permissions ?? [])
    .map((rp) => rp.permissions?.kode)
    .filter((k): k is string => Boolean(k));

  // participants.user_id dan representatives.user_id dua-duanya UNIQUE, jadi
  // PostgREST menempelkannya sebagai objek, bukan array. Dibaca lewat satu()
  // supaya tetap benar kalau bentuknya berubah.
  return {
    id: data.id,
    email: data.email,
    nama: data.nama,
    peran,
    izin,
    participantId: satu<{ id: string }>(data.participants)?.id,
    representativeId: satu<{ id: number }>(data.representatives)?.id,
  };
}

/** Rejects anonymous callers. */
export const wajibLogin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> =
  async (c, next) => {
    // Sudah dimuat loginOpsional yang dipasang global di app.ts? Pakai itu.
    //
    // Tanpa ini, tiap permintaan ke endpoint yang butuh login memverifikasi
    // JWT dua kali dan mengambil baris pengguna dua kali dari database: sekali
    // di middleware global, sekali di sini. Dua kali kerja untuk jawaban yang
    // sama persis, di tiap permintaan, sepanjang hari acara.
    if (c.get('pengguna')) {
      await next();
      return;
    }

    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new AppError('TIDAK_LOGIN');

    // Sampai di sini berarti tokennya ADA tapi loginOpsional tidak berhasil
    // memakainya. Diverifikasi ulang supaya yang keluar pesan yang tepat,
    // misalnya TOKEN_KEDALUWARSA, bukan TIDAK_LOGIN yang menyesatkan.
    const klaim = await verifikasiToken(token, c.env);
    c.set('pengguna', await muatPengguna(c.env, klaim.sub));
    await next();
  };

/** Attaches the caller when a token is present, but lets anonymous through. */
export const loginOpsional: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> =
  async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) {
      try {
        const klaim = await verifikasiToken(token, c.env);
        c.set('pengguna', await muatPengguna(c.env, klaim.sub));
      } catch {
        // An invalid token on a public route is simply ignored.
      }
    }
    await next();
  };
