#!/usr/bin/env node
/**
 * Menyiapkan bahan untuk uji beban.
 *
 *   node loadtest/siapkan.mjs            buat 200 akun uji
 *   node loadtest/siapkan.mjs 50         buat 50 saja
 *   node loadtest/siapkan.mjs --bersihkan  hapus semua akun uji
 *
 * Kenapa perlu penyiap sendiri, bukan langsung k6:
 *
 * Skrip k6 di dokumen mengirim `isi_qr: 'CGTK1.uji1.tandatangan'` tanpa header
 * Authorization. Dua-duanya ditolak sebelum menyentuh apa pun yang berat:
 * tanpa token jadi 401, dan tanda tangan QR karangan jadi QR_TIDAK_VALID. Yang
 * terukur cuma jalur penolakan, dan jalur penolakan memang selalu cepat. Uji
 * beban seperti itu selalu lulus dan tidak berarti apa-apa.
 *
 * Jadi berkas ini membuat bahan yang sungguhan:
 *   - akun di public.users beserta peran PESERTA
 *   - baris participants dengan qr_token yang ditandatangani QR_SIGNING_SECRET
 *   - registrations berstatus LUNAS, supaya scan tidak ditolak karena belum bayar
 *   - access token HS256 yang ditandatangani SUPABASE_JWT_SECRET
 *
 * Token terakhir itu dibuat sendiri, bukan lewat Google. Boleh, karena middleware
 * auth memang memverifikasinya dengan SUPABASE_JWT_SECRET, persis seperti token
 * asli dari Supabase. Yang diuji memang bagian kita, bukan login Google.
 *
 * Hasilnya ditulis ke loadtest/token-uji.json dan loadtest/qr-uji.json. Dua
 * berkas itu masuk .gitignore karena isinya token yang sah.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(HERE, '..');

const args = process.argv.slice(2);
const BERSIHKAN = args.includes('--bersihkan');
const JUMLAH = Number(args.find((a) => /^\d+$/.test(a)) ?? 200);

const PENANDA = 'ujibeban';
const EMAIL = (i) => `${PENANDA}-${i}@contoh.invalid`;

for (const nama of ['.dev.vars', '.env']) {
  const p = path.join(AKAR, nama);
  if (!fs.existsSync(p)) continue;
  for (const baris of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const { DATABASE_URL, SUPABASE_JWT_SECRET, QR_SIGNING_SECRET } = process.env;

for (const [nama, nilai] of Object.entries({
  DATABASE_URL,
  SUPABASE_JWT_SECRET,
  QR_SIGNING_SECRET,
})) {
  if (!nilai) {
    console.error(`\n  ${nama} belum ada di .dev.vars.\n`);
    process.exit(1);
  }
}

if (DATABASE_URL.includes(':6543')) {
  console.error('\n  DATABASE_URL memakai port 6543. Pakai 5432.\n');
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Tanda tangan, sama persis dengan src/lib/qr.ts dan src/middleware/auth.ts.
// Kalau salah satu dari dua berkas itu berubah, berkas ini harus ikut berubah.
// -----------------------------------------------------------------------------
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function susunQr(token) {
  // Yang ditandatangani adalah `CGTK1.<token>`, BUKAN token saja. Lihat
  // tandaTangan() di src/lib/qr.ts. Kalau bagian ini salah, semua scan dijawab
  // QR_TIDAK_VALID dengan alasan TANDA_TANGAN, dan uji bebannya cuma mengukur
  // kecepatan menolak.
  const sig = crypto
    .createHmac('sha256', QR_SIGNING_SECRET)
    .update(`CGTK1.${token}`)
    .digest('hex')
    .slice(0, 12);
  return `CGTK1.${token}.${sig}`;
}

function susunJwt(sub, email) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const klaim = b64url(
    JSON.stringify({
      sub,
      email,
      // Cukup untuk satu sesi uji, dan tetap kedaluwarsa supaya token yang
      // tercecer di berkas tidak berguna selamanya.
      exp: Math.floor(Date.now() / 1000) + 6 * 3600,
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  const sig = crypto
    .createHmac('sha256', SUPABASE_JWT_SECRET)
    .update(`${header}.${klaim}`)
    .digest();
  return `${header}.${klaim}.${b64url(sig)}`;
}

const sql = postgres(DATABASE_URL, { max: 4, onnotice: () => {} });

async function bersihkan() {
  // Tidak cukup `delete from users`. Sebagian yang mengacu ke users dipasang
  // NO ACTION dengan sengaja, supaya orang yang pernah memindai QR atau
  // memverifikasi pembayaran tidak bisa dihapus dan menghilangkan jejaknya:
  //
  //   attendances.scanned_by          point_transactions.diberikan_oleh
  //   payments.ditandai_oleh          payments.dibatalkan_oleh
  //   sync_conflicts.dilaporkan_oleh  leaderboard_freeze.dibekukan_oleh
  //   announcements.dibuat_oleh       settings.diubah_oleh
  //
  // Bagus untuk audit, tapi artinya pembersihan harus urut dari ujung. Kalau
  // tidak, penghapusannya gagal separuh jalan dan meninggalkan akun uji yang
  // lebih susah dibersihkan daripada sebelumnya.
  const uji = sql`select id from users where email like ${PENANDA + '%'}`;

  const langkah = [
    ['attendances', sql`delete from attendances where user_id in (${uji}) or scanned_by in (${uji})`],
    ['point_transactions', sql`
      delete from point_transactions
      where diberikan_oleh in (${uji})
         or participant_id in (select id from participants where user_id in (${uji}))`],
    ['booth_visits', sql`
      delete from booth_visits
      where participant_id in (select id from participants where user_id in (${uji}))`],
    ['booth_checkins', sql`
      delete from booth_checkins
      where participant_id in (select id from participants where user_id in (${uji}))`],
    ['payments', sql`
      delete from payments
      where ditandai_oleh in (${uji}) or dibatalkan_oleh in (${uji})
         or registration_id in (select id from registrations where user_id in (${uji}))`],
    ['sync_conflicts', sql`delete from sync_conflicts where dilaporkan_oleh in (${uji})`],
    ['announcements', sql`delete from announcements where dibuat_oleh in (${uji})`],
    ['leaderboard_freeze', sql`
      delete from leaderboard_freeze
      where dibekukan_oleh in (${uji}) or disahkan_oleh in (${uji})`],
    ['settings.diubah_oleh', sql`update settings set diubah_oleh = null where diubah_oleh in (${uji})`],
    ['representatives', sql`delete from representatives where user_id in (${uji})`],
    ['registrations', sql`delete from registrations where user_id in (${uji})`],
    ['participants', sql`delete from participants where user_id in (${uji})`],
  ];

  for (const [nama, kueri] of langkah) {
    try {
      await kueri;
    } catch (e) {
      console.log(`  gagal membersihkan ${nama}: ${e.message}`);
    }
  }

  const hapus = await sql`
    delete from users where email like ${PENANDA + '%'} returning id
  `;
  console.log(`  ${hapus.length} akun uji dihapus.`);

  for (const f of ['token-uji.json', 'qr-uji.json', 'token-peran.json', 'hasil.json']) {
    const p = path.join(HERE, f);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`  ${f} dibuang.`);
    }
  }
}

async function siapkan() {
  const [peran] = await sql`select id from roles where kode = 'PESERTA' limit 1`;
  if (!peran) {
    throw new Error("Peran PESERTA belum ada. Jalankan npm run db:push dulu.");
  }

  const [sesi] = await sql`
    select id from sessions where status = 'ACTIVE' order by id limit 1
  `;
  const [booth] = await sql`
    select id from booths where status = 'ACTIVE' order by id limit 1
  `;

  if (!sesi || !booth) {
    console.log('  Peringatan: belum ada sesi atau booth berstatus ACTIVE.');
    console.log('  Jalankan npm run db:contoh dulu, kalau tidak skenario scan');
    console.log('  akan ditolak karena sesinya tertutup, bukan karena beban.');
  }

  const token = [];
  const qr = [];

  for (let i = 0; i < JUMLAH; i++) {
    const email = EMAIL(i);

    const [pengguna] = await sql`
      insert into users (email, nama, role_id, status)
      values (${email}, ${'Uji Beban ' + i}, ${peran.id}, 'AKTIF')
      on conflict (email) do update set nama = excluded.nama
      returning id
    `;

    const qrToken = crypto.randomBytes(16).toString('hex');

    const [peserta] = await sql`
      insert into participants (user_id, asal_sekolah, kelas, qr_token, qr_terbit_at)
      values (${pengguna.id}, 'SMAN 1 Pamekasan', 'XII IPA 1', ${qrToken}, now())
      on conflict (user_id) do update
        set qr_token = excluded.qr_token, qr_terbit_at = now()
      returning id, qr_token
    `;

    // Status LUNAS supaya scan presensi tidak ditolak karena belum bayar. Yang
    // diuji ketahanan terhadap beban, bukan aturan pembayaran.
    //
    // Tabelnya mengacu ke user_id, bukan participant_id. Sengaja begitu supaya
    // nanti alumni dan panitia juga bisa punya baris di sini tanpa membongkar
    // tabel, karena mereka user tapi bukan peserta.
    await sql`
      insert into registrations (user_id, kode_registrasi, profil_lengkap, profil_lengkap_at, status)
      values (${pengguna.id}, ${'UJI' + String(i).padStart(5, '0')}, true, now(), 'LUNAS')
      on conflict (user_id) do update
        set status = 'LUNAS', profil_lengkap = true
    `;

    token.push(susunJwt(pengguna.id, email));
    qr.push(susunQr(peserta.qr_token));

    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${JUMLAH} ...`);
  }

  // -------------------------------------------------------------------------
  // Akun per peran.
  //
  // Token peserta TIDAK bisa dipakai untuk skenario scan. Peserta cuma punya
  // izin LIHAT_DASHBOARD dan IKUT_KUIS, jadi POST /attendance/scan dijawab 403
  // dan uji bebannya melaporkan 100% gagal padahal servernya sehat. Yang
  // memindai di lapangan itu panitia, jadi yang dipakai harus tokennya panitia.
  // -------------------------------------------------------------------------
  const peranTambahan = [
    ['pemindai', 'DIV_ADMINISTRASI', 'Panitia Pemindai Uji'],
    ['admin', 'SUPER_ADMIN', 'Super Admin Uji'],
    ['alumni', 'ALUMNI', 'Alumni Uji'],
  ];

  const tokenPeran = {};

  for (const [kunci, kodePeran, nama] of peranTambahan) {
    const [r] = await sql`select id from roles where kode = ${kodePeran} limit 1`;
    if (!r) {
      console.log(`  Peringatan: peran ${kodePeran} tidak ada, ${kunci} dilewati.`);
      continue;
    }

    const email = `${PENANDA}-${kunci}@contoh.invalid`;
    const [u] = await sql`
      insert into users (email, nama, role_id, status)
      values (${email}, ${nama}, ${r.id}, 'AKTIF')
      on conflict (email) do update set nama = excluded.nama, role_id = excluded.role_id
      returning id
    `;

    // Alumni butuh baris representatives yang AKTIF, kalau tidak wajibAlumni
    // menolaknya dan skenario booth ikut merah tanpa sebab yang jelas.
    if (kodePeran === 'ALUMNI') {
      const [kampus] = await sql`select id from universities order by id limit 1`;
      const [jur] = await sql`select id from majors order by id limit 1`;
      await sql`
        insert into representatives (user_id, email_undangan, university_id, major_id, angkatan, status)
        values (${u.id}, ${email}, ${kampus?.id ?? null}, ${jur?.id ?? null}, 2023, 'AKTIF')
        on conflict (user_id) do update set status = 'AKTIF'
      `;
    }

    tokenPeran[kunci] = susunJwt(u.id, email);
  }

  fs.writeFileSync(
    path.join(HERE, 'token-peran.json'),
    JSON.stringify(tokenPeran, null, 2),
  );

  fs.writeFileSync(path.join(HERE, 'token-uji.json'), JSON.stringify(token, null, 2));
  fs.writeFileSync(
    path.join(HERE, 'qr-uji.json'),
    JSON.stringify(
      { session_id: sesi?.id ?? null, booth_id: booth?.id ?? null, qr },
      null,
      2,
    ),
  );

  console.log(`\n  ${JUMLAH} akun uji siap.`);
  console.log(`  token-uji.json  ${token.length} token peserta, berlaku 6 jam`);
  console.log(`  token-peran.json ${Object.keys(tokenPeran).join(', ')}`);
  console.log(`  qr-uji.json     ${qr.length} QR, session_id ${sesi?.id ?? '-'}, booth_id ${booth?.id ?? '-'}`);
  console.log('\n  Keduanya sudah ada di .gitignore. Jangan dikirim ke siapa pun.');
  console.log('  Setelah tes selesai:  node loadtest/siapkan.mjs --bersihkan\n');
}

try {
  if (BERSIHKAN) await bersihkan();
  else await siapkan();
} catch (e) {
  console.error(`\n  Gagal: ${e.message}\n`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
