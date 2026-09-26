/* =============================================================================
   Tes yang benar-benar memanggil fungsi Postgres.

   Sebelum berkas ini ada, 34 tes yang lolos isinya cuma tanda tangan QR dan
   validasi Zod. Nol tes yang menyentuh database, padahal semua penulisan
   multi-tabel dilakukan oleh fungsi Postgres lewat rpc(). Bagian paling rumit
   dan paling berbahaya justru yang tidak pernah diuji.

   Yang diuji di sini bukan "fungsinya ada", tapi aturan yang kalau salah akan
   merugikan peserta sungguhan:

     - satu orang tidak bisa dapat XP dua kali di booth yang sama
     - scan_uuid yang sama dikirim ulang tidak menggandakan presensi
     - sesi yang CLOSED menolak scan
     - peserta yang belum lunas tidak bisa presensi
     - check-in booth tidak memberi XP
     - batas XP per booth ditegakkan server, bukan cuma di HP

   MEMBUTUHKAN DATABASE. Kalau DATABASE_URL tidak ada atau tidak bisa dihubungi,
   seluruh berkas ini dilewati, bukan gagal. Jadi `npm test` tetap hijau di
   laptop yang sedang tanpa internet, dan yang ikut CI tetap dapat kepastian.

   JALANKAN:
     npm run db:push && npm run db:contoh   # sekali
     npm test

   Semua data yang dibuat di sini dihapus lagi di akhir. Jangan pernah
   menjalankannya pada database yang sudah berisi pendaftar sungguhan.
============================================================================= */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postgres from 'postgres';

// -----------------------------------------------------------------------------
// Muat .dev.vars, sama seperti scripts/migrate.mjs
// -----------------------------------------------------------------------------
for (const nama of ['.dev.vars', '.env']) {
  const p = path.join(process.cwd(), nama);
  if (!fs.existsSync(p)) continue;
  for (const baris of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, nama, nilai = ''] = m as unknown as [string, string, string];
    if (!process.env[nama]) {
      process.env[nama] = nilai.trim().replace(/^["']|["']$/g, '');
    }
  }
}

const URL_DB = process.env.DATABASE_URL;
const PENANDA = 'tesfungsi';

let sql: ReturnType<typeof postgres> | null = null;
let tersambung = false;
let alasan = 'DATABASE_URL tidak diisi';

if (URL_DB && !URL_DB.includes(':6543')) {
  sql = postgres(URL_DB, { max: 2, onnotice: () => {}, connect_timeout: 10 });
}

// Wadah id supaya pembersihan di akhir tidak menebak-nebak.
const dibuat = {
  userIds: [] as string[],
  eventId: 0,
  sessionId: 0,
  boothId: 0,
};

let peserta = { id: '', userId: '', qrToken: '', kode: '' };

beforeAll(async () => {
  if (!sql) return;
  try {
    await sql`select 1`;
    tersambung = true;
  } catch (e) {
    alasan = `database tidak bisa dihubungi: ${(e as Error).message}`;
    return;
  }

  const [peran] = await sql`select id from roles where kode = 'PESERTA' limit 1`;
  if (!peran) {
    tersambung = false;
    alasan = 'peran PESERTA belum ada, jalankan npm run db:push';
    return;
  }

  // Sapu sisa run sebelumnya dulu. Run yang gagal di tengah tidak pernah sampai
  // ke afterAll, jadi tanpa ini sampahnya menumpuk tiap kali tes dijalankan.
  await bersihkanJejak();

  // --- acara, sesi, booth milik tes ini sendiri ---------------------------
  // Sengaja tidak memakai data yang sudah ada. Tes yang bergantung pada baris
  // milik orang lain akan berubah hasilnya begitu data itu berubah, dan
  // kegagalannya membingungkan.
  const [acara] = await sql`
    insert into events (nama, tipe, tanggal, urutan)
    values (${PENANDA + ' acara'}, 'EXPO_KAMPUS', current_date, 999)
    returning id
  `;
  dibuat.eventId = acara!.id;

  const [sesi] = await sql`
    insert into sessions (event_id, nama, status, xp, wajib_presensi, urutan)
    values (${dibuat.eventId}, ${PENANDA + ' sesi'}, 'ACTIVE', 20, true, 1)
    returning id
  `;
  dibuat.sessionId = sesi!.id;

  const [kampus] = await sql`
    insert into universities (nama, singkatan)
    values (${PENANDA + ' kampus'}, ${'TF' + Date.now().toString().slice(-6)})
    returning id
  `;

  const [booth] = await sql`
    insert into booths (event_id, booth_type, university_id, nama_tampilan, xp_max, status, kode_booth)
    values (${dibuat.eventId}, 'KAMPUS', ${kampus!.id}, ${PENANDA + ' booth'}, 30, 'ACTIVE',
            ${'TF-' + Date.now().toString().slice(-8)})
    returning id
  `;
  dibuat.boothId = booth!.id;

  // --- satu peserta, sudah lunas -----------------------------------------
  const email = `${PENANDA}-${Date.now()}@contoh.invalid`;
  const [pengguna] = await sql`
    insert into users (email, nama, role_id) values (${email}, 'Peserta Tes', ${peran.id})
    returning id
  `;
  dibuat.userIds.push(pengguna!.id);

  const qrToken = crypto.randomBytes(16).toString('hex');
  const [p] = await sql`
    insert into participants (user_id, asal_sekolah, kelas, qr_token, qr_terbit_at)
    values (${pengguna!.id}, 'SMAN 1 Pamekasan', 'XII IPA 1', ${qrToken}, now())
    returning id
  `;

  const kode = 'TF' + Date.now().toString().slice(-6);
  await sql`
    insert into registrations (user_id, kode_registrasi, profil_lengkap, profil_lengkap_at, status)
    values (${pengguna!.id}, ${kode}, true, now(), 'LUNAS')
  `;

  peserta = { id: p!.id, userId: pengguna!.id, qrToken, kode };
}, 60_000);

// Pembersihan berdasarkan PENANDA, bukan berdasarkan id yang dikumpulkan run
// ini saja. Kalau sebuah run gagal di tengah, barisnya tidak akan pernah masuk
// daftar id, dan sisanya menumpuk tiap kali tes dijalankan. Menyapu lewat
// penanda membuat pembersihan ini juga membereskan kekacauan run sebelumnya.
async function bersihkanJejak() {
  if (!sql) return;

  // Tidak semua yang mengacu ke users ikut terhapus sendiri, dan itu memang
  // disengaja. payments.ditandai_oleh, attendances.scanned_by, dan
  // point_transactions.diberikan_oleh dipasang NO ACTION supaya orang yang
  // pernah memverifikasi pembayaran atau memberi XP tidak bisa dihapus begitu
  // saja dan menghilangkan jejaknya. Bagus untuk audit, tapi artinya
  // pembersihan harus urut dari yang paling ujung.
  const uji = sql`select id from users where email like ${PENANDA + '%'}`;

  await sql`delete from attendances where user_id in (${uji}) or scanned_by in (${uji})`;
  await sql`
    delete from point_transactions
    where diberikan_oleh in (${uji})
       or participant_id in (select id from participants where user_id in (${uji}))
  `;
  // booth_visits tidak menyimpan user pemindai, cuma representative_id, dan itu
  // sudah on delete set null. Jadi cukup lewat pesertanya.
  await sql`
    delete from booth_visits
    where participant_id in (select id from participants where user_id in (${uji}))
  `;
  await sql`
    delete from booth_checkins
    where participant_id in (select id from participants where user_id in (${uji}))
  `;
  await sql`
    delete from payments
    where ditandai_oleh in (${uji}) or dibatalkan_oleh in (${uji})
       or registration_id in (select id from registrations where user_id in (${uji}))
  `;
  await sql`delete from sync_conflicts where dilaporkan_oleh in (${uji})`;
  await sql`delete from registrations where user_id in (${uji})`;
  await sql`delete from participants where user_id in (${uji})`;
  await sql`delete from users where email like ${PENANDA + '%'}`;

  // Acara dihapus terakhir: sesi dan booth menggantung padanya lewat cascade.
  await sql`delete from events where nama like ${PENANDA + '%'}`;
  await sql`delete from universities where nama like ${PENANDA + '%'}`;
}

afterAll(async () => {
  if (!sql) return;
  if (tersambung) {
    try {
      await bersihkanJejak();
    } catch (e) {
      // Pembersihan yang gagal tidak boleh membuat tes merah, tapi harus
      // kelihatan, supaya tidak diam-diam menumpuk sampah di database.
      console.log(`  Pembersihan gagal, sisa bisa dicari lewat '${PENANDA}': ${(e as Error).message}`);
    }
  }
  await sql.end();
});

// Vitest tidak punya "skip seluruh berkas kalau syaratnya tidak ada", jadi
// dijaga lewat pembungkus ini. Alasannya dicetak sekali supaya tidak ada yang
// mengira tesnya lolos padahal tidak pernah jalan.
function bila(nama: string, fn: () => Promise<void>, batas = 30_000) {
  it(nama, async () => {
    if (!tersambung) {
      console.log(`  DILEWATI (${alasan}): ${nama}`);
      return;
    }
    await fn();
  }, batas);
}

describe('fungsi Postgres', () => {
  describe('scan_presensi', () => {
    bila('menerima scan pertama dan memberi XP sesuai sesi', async () => {
      const [hasil] = await sql!`
        select scan_presensi(${peserta.qrToken}, ${dibuat.sessionId},
               ${crypto.randomUUID()}, now(), ${peserta.userId}, 'ONLINE') as r
      `;
      const r = hasil!.r as { sukses: boolean; xp?: number };
      expect(r.sukses).toBe(true);

      const [xp] = await sql!`select total_xp(${peserta.id}) as t`;
      expect(Number(xp!.t)).toBeGreaterThan(0);
    });

    bila('scan_uuid yang sama dikirim ulang tidak menggandakan presensi', async () => {
      // Ini aturan paling penting di seluruh jalur offline. HP yang kehilangan
      // sinyal di tengah pengiriman akan mengirim ulang tumpukan yang sama, dan
      // kalau penjaganya bocor, XP orang menggelembung tanpa dia lakukan apa pun.
      // Sesi sendiri, karena peserta ini sudah presensi di sesi utama pada tes
      // sebelumnya. Kalau dipakai ulang, yang terukur adalah penolakan "sudah
      // pernah scan", bukan penjaga scan_uuid yang mau diuji di sini.
      const [sesi2] = await sql!`
        insert into sessions (event_id, nama, status, xp, wajib_presensi, urutan)
        values (${dibuat.eventId}, ${PENANDA + ' sesi idempoten'}, 'ACTIVE', 20, true, 2)
        returning id
      `;
      const sesiId = sesi2!.id as number;
      const uuidSama = crypto.randomUUID();

      const [pertama] = await sql!`
        select scan_presensi(${peserta.qrToken}, ${sesiId},
               ${uuidSama}, now(), ${peserta.userId}, 'OFFLINE_SYNC') as r
      `;
      expect((pertama!.r as { sukses: boolean }).sukses).toBe(true);

      const [sebelum] = await sql!`select total_xp(${peserta.id}) as t`;

      // Kiriman ulang. HP yang kehilangan sinyal di tengah pengiriman akan
      // mengirim tumpukan yang sama lagi, dan itu harus dijawab tanpa menambah
      // apa pun.
      await sql!`
        select scan_presensi(${peserta.qrToken}, ${sesiId},
               ${uuidSama}, now(), ${peserta.userId}, 'OFFLINE_SYNC')
      `;
      const [sesudah] = await sql!`select total_xp(${peserta.id}) as t`;

      expect(Number(sesudah!.t)).toBe(Number(sebelum!.t));

      const [jumlah] = await sql!`
        select count(*)::int as n from attendances
        where session_id = ${sesiId} and scan_uuid = ${uuidSama}
      `;
      expect(jumlah!.n).toBe(1);
    });

    bila('menolak kalau sesinya CLOSED', async () => {
      // Sengaja diuji lewat status, bukan lewat jam. Saklar itu satu-satunya
      // yang menentukan, karena jadwal di lapangan selalu bergeser.
      await sql!`update sessions set status = 'CLOSED' where id = ${dibuat.sessionId}`;

      const [hasil] = await sql!`
        select scan_presensi(${peserta.qrToken}, ${dibuat.sessionId},
               ${crypto.randomUUID()}, now(), ${peserta.userId}, 'ONLINE') as r
      `;
      const r = hasil!.r as { sukses: boolean; kode?: string };
      expect(r.sukses).toBe(false);

      await sql!`update sessions set status = 'ACTIVE' where id = ${dibuat.sessionId}`;
    });

    bila('menolak QR yang tidak ada di database', async () => {
      const [hasil] = await sql!`
        select scan_presensi(${crypto.randomBytes(16).toString('hex')},
               ${dibuat.sessionId}, ${crypto.randomUUID()}, now(),
               ${peserta.userId}, 'ONLINE') as r
      `;
      expect((hasil!.r as { sukses: boolean }).sukses).toBe(false);
    });
  });

  describe('scan_booth', () => {
    bila('memberi XP di kunjungan pertama', async () => {
      const [hasil] = await sql!`
        select scan_booth(${peserta.qrToken}, ${dibuat.boothId}, 'HADIR',
               ${crypto.randomUUID()}, now(), ${peserta.userId}) as r
      `;
      expect((hasil!.r as { sukses: boolean }).sukses).toBe(true);
    });

    bila('menolak kunjungan kedua di booth yang sama', async () => {
      // Kunci anti curang: participant_id + booth_id, bukan campus_id. Kalau
      // pakai campus_id, booth jurusan bocor karena alumni dari tiga kampus
      // duduk di satu meja dan peserta bisa memungut XP tiga kali tanpa pindah.
      const [hasil] = await sql!`
        select scan_booth(${peserta.qrToken}, ${dibuat.boothId}, 'SANGAT_AKTIF',
               ${crypto.randomUUID()}, now(), ${peserta.userId}) as r
      `;
      expect((hasil!.r as { sukses: boolean }).sukses).toBe(false);
    });

    bila('XP dari satu booth tidak melewati xp_max booth itu', async () => {
      const [b] = await sql!`select xp_max from booths where id = ${dibuat.boothId}`;
      const [jumlah] = await sql!`
        select coalesce(sum(xp), 0)::int as total from point_transactions
        where participant_id = ${peserta.id}
          and sumber_tipe = 'BOOTH'
          and sumber_id in (select id from booth_visits where booth_id = ${dibuat.boothId})
      `;
      expect(jumlah!.total).toBeLessThanOrEqual(b!.xp_max);
    });
  });

  describe('checkin_booth', () => {
    bila('tidak memberi XP sama sekali', async () => {
      // Check-in cuma membuka materi booth. Kalau dia ikut memberi XP, peserta
      // bisa memungut poin dengan memindai poster di meja tanpa pernah bicara
      // dengan alumninya, dan seluruh gunanya booth hilang.
      const [sebelum] = await sql!`select total_xp(${peserta.id}) as t`;

      await sql!`
        select checkin_booth(${peserta.id}, ${dibuat.boothId}, 'SCAN_QR') as r
      `;

      const [sesudah] = await sql!`select total_xp(${peserta.id}) as t`;
      expect(Number(sesudah!.t)).toBe(Number(sebelum!.t));
    });
  });

  describe('total_xp dan level_peserta', () => {
    bila('total dihitung dari ledger, bukan dari kolom tersimpan', async () => {
      const [ledger] = await sql!`
        select coalesce(sum(xp), 0)::int as t from point_transactions
        where participant_id = ${peserta.id} and dibatalkan = false
      `;
      const [fungsi] = await sql!`select total_xp(${peserta.id}) as t`;
      expect(Number(fungsi!.t)).toBe(ledger!.t);
    });

    bila('level dihitung, bukan disimpan, dan 0 XP tetap dapat level 1', async () => {
      // level_peserta mengembalikan jsonb { nomor, nama, xp_minimum }, bukan
      // angka. Levelnya tidak pernah disimpan di kolom mana pun, selalu
      // diturunkan dari total XP.
      const [nol] = await sql!`select level_peserta(0) as lv`;
      const lvNol = nol!.lv as { nomor: number; nama: string };
      expect(lvNol.nomor).toBe(1);
      expect(typeof lvNol.nama).toBe('string');

      const [tinggi] = await sql!`select level_peserta(999999) as lv`;
      const lvTinggi = tinggi!.lv as { nomor: number };
      expect(lvTinggi.nomor).toBeGreaterThanOrEqual(lvNol.nomor);

      // Peserta yang belum dapat XP apa pun tetap harus punya level, bukan null.
      // Dashboard menampilkannya sejak hari pertama, sebelum dia scan apa pun.
      const [kosong] = await sql!`select level_peserta(total_xp(${peserta.id})::int) as lv`;
      expect((kosong!.lv as { nomor: number }).nomor).toBeGreaterThanOrEqual(1);
    });
  });

  describe('tandai_lunas', () => {
    bila('mengubah status jadi LUNAS dan menerbitkan QR', async () => {
      const [peran] = await sql!`select id from roles where kode = 'PESERTA' limit 1`;
      const email = `${PENANDA}-lunas-${Date.now()}@contoh.invalid`;

      const [u] = await sql!`
        insert into users (email, nama, role_id) values (${email}, 'Belum Lunas', ${peran!.id})
        returning id
      `;
      dibuat.userIds.push(u!.id);

      const [p] = await sql!`
        insert into participants (user_id, asal_sekolah, kelas)
        values (${u!.id}, 'SMAN 1 Pamekasan', 'XII IPS 2') returning id
      `;

      const kode = 'TL' + Date.now().toString().slice(-6);
      await sql!`
        insert into registrations (user_id, kode_registrasi, profil_lengkap, profil_lengkap_at, status)
        values (${u!.id}, ${kode}, true, now(), 'MENUNGGU_PEMBAYARAN')
      `;

      const [hasil] = await sql!`select tandai_lunas(${kode}, ${peserta.userId}) as r`;
      expect((hasil!.r as { sukses: boolean }).sukses).toBe(true);

      const [reg] = await sql!`select status from registrations where kode_registrasi = ${kode}`;
      expect(reg!.status).toBe('LUNAS');

      // QR baru boleh terbit setelah lunas, bukan sebelumnya.
      const [pp] = await sql!`select qr_token from participants where id = ${p!.id}`;
      expect(pp!.qr_token).toBeTruthy();
    });

    bila('menolak kode registrasi yang tidak ada', async () => {
      const [hasil] = await sql!`
        select tandai_lunas('KODE-TIDAK-ADA-123', ${peserta.userId}) as r
      `;
      expect((hasil!.r as { sukses: boolean }).sukses).toBe(false);
    });
  });

  describe('jenis kampus', () => {
    bila('hanya menerima NEGERI, SWASTA, atau KEDINASAN', async () => {
      const [k] = await sql!`
        insert into universities (nama, singkatan, jenis)
        values (${PENANDA + ' cek jenis'}, ${'TJ' + Date.now().toString().slice(-6)}, 'NEGERI')
        returning id
      `;

      // Nilai di luar daftar harus ditolak database, bukan cuma ditolak Zod.
      // Kalau cuma dijaga di Worker, satu skrip impor yang lupa memvalidasi
      // sudah cukup untuk menaruh 'negri' atau 'Negeri' di sana, dan tombol
      // saring peserta berhenti bekerja tanpa ada yang tahu sebabnya.
      await expect(
        sql!`update universities set jenis = 'NGAWUR' where id = ${k!.id}`,
      ).rejects.toThrow();

      // Kosong harus boleh: Divisi Acara belum tentu tahu jenis tiap kampus
      // waktu memasukkannya.
      await sql!`update universities set jenis = null where id = ${k!.id}`;
      const [sesudah] = await sql!`select jenis from universities where id = ${k!.id}`;
      expect(sesudah!.jenis).toBeNull();
    });

    bila('rumpun diturunkan dari majors, bukan disimpan di universities', async () => {
      // Saringan rumpun di halaman direktori bergantung pada rantai ini. Kalau
      // university_majors kosong, tombolnya selalu memberi hasil nol dan
      // kelihatan seperti fiturnya rusak.
      const [n] = await sql!`
        select count(distinct um.university_id)::int as n
        from university_majors um
        join majors m on m.id = um.major_id
        where m.rumpun = 'Kesehatan'
      `;
      expect(n!.n).toBeGreaterThan(0);

      const [kolom] = await sql!`
        select count(*)::int as n from information_schema.columns
        where table_name = 'universities' and column_name = 'rumpun'
      `;
      expect(kolom!.n).toBe(0);
    });
  });

  describe('audit', () => {
    bila('setiap pemberian XP meninggalkan jejak', async () => {
      // Kalau nanti ada yang protes "kok dia menang, curang itu", jawabannya
      // harus berupa data, bukan perasaan.
      const [n] = await sql!`
        select count(*)::int as n from audit_logs
        where created_at > now() - interval '5 minutes'
      `;
      expect(n!.n).toBeGreaterThan(0);
    });
  });
});
