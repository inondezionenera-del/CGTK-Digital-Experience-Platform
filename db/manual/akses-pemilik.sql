-- =============================================================================
-- Akses empat sisi untuk akun pemilik proyek.
--
--   node scripts/jalankan-sql.mjs db/manual/akses-pemilik.sql
--
-- BUKAN migration, dan memang tidak boleh jadi migration: ini tindakan sekali
-- jalan terhadap satu akun tertentu. Kalau dicatat di _migrations, dia akan
-- ikut terpasang lagi setiap kali database dibangun ulang, termasuk di
-- database yang isinya berbeda.
--
-- Idempoten. Dijalankan dua kali tidak menduplikasi apa pun.
--
-- -----------------------------------------------------------------------------
-- KENAPA TIDAK ADA TABEL user_roles.
--
-- users.role_id satu kolom, satu peran. Godaan pertamanya adalah mengubahnya
-- jadi banyak-ke-banyak. Itu tidak dilakukan, dan bukan karena malas.
--
-- Sistem ini sebenarnya SUDAH berbasis kapabilitas untuk dua dari empat sisi:
--
--   wajibLunas   cuma memeriksa ada baris participants dan registrasinya
--                LUNAS. Tidak pernah melihat peran.
--   wajibAlumni  cuma memeriksa ada baris representatives yang user_id-nya
--                orang itu. Tidak pernah melihat peran.
--   butuhIzin    inilah satu-satunya yang membaca peran, lewat daftar izin.
--
-- Jadi satu akun bisa menjadi peserta, alumni, panitia, dan admin sekaligus
-- hanya dengan MEMILIKI barisnya, tanpa satu baris pun skema berubah. Yang
-- perlu diubah cuma perannya, dan itu untuk izin administrasi.
--
-- Mengubah role_id jadi banyak-ke-banyak berarti menyentuh setiap jalur
-- otorisasi di aplikasi beberapa jam sebelum acara, untuk hasil yang sudah
-- bisa dicapai tanpa itu. Risikonya jelas, manfaatnya nol.
-- -----------------------------------------------------------------------------

begin;

-- Email ditulis di sini, bukan diterima dari permintaan web. Tidak ada jalan
-- dari formulir mana pun menuju berkas ini.
create temporary table target on commit drop as
select 'inondezionenera@gmail.com'::text as email;

do $$
declare
  v_user     users%rowtype;
  v_peran_id int;
  v_lama     text;
  v_rep_id   int;
  v_email    text;
begin
  select email into v_email from target;

  select * into v_user from users where lower(email) = v_email;
  if not found then
    raise exception 'Akun % belum ada. Dia harus masuk lewat Google sekali dulu supaya barisnya dibuat.', v_email;
  end if;

  -- ---------------------------------------------------------------------
  -- 1. Peran: SUPER_ADMIN, untuk sisi panitia dan admin.
  -- ---------------------------------------------------------------------
  select kode into v_lama from roles where id = v_user.role_id;
  select id into v_peran_id from roles where kode = 'SUPER_ADMIN';

  if v_peran_id is null then
    raise exception 'Peran SUPER_ADMIN belum ada. Seed 0010 belum dijalankan.';
  end if;

  if v_user.role_id is distinct from v_peran_id then
    update users set role_id = v_peran_id where id = v_user.id;

    perform catat_audit(
      v_user.id, 'UBAH_PERAN_PEMILIK', 'users', v_user.id::text,
      jsonb_build_object('peran', v_lama),
      jsonb_build_object('peran', 'SUPER_ADMIN',
        'alasan', 'akses pengelola proyek, dijalankan lewat db/manual/akses-pemilik.sql')
    );
    raise notice 'peran: % -> SUPER_ADMIN', v_lama;
  else
    raise notice 'peran: sudah SUPER_ADMIN, dibiarkan';
  end if;

  -- ---------------------------------------------------------------------
  -- 2. Sisi alumni: satu baris representatives yang tersambung ke akun ini.
  --
  -- university_id dan major_id SENGAJA dibiarkan kosong. Dua kolom itu boleh
  -- null, dan mengisinya di sini berarti mengarang afiliasi kampus untuk
  -- orang yang belum tentu punya. Isinya diperbaiki sendiri lewat halaman
  -- Undang Alumni, yang memang sudah bisa menyuntingnya.
  -- ---------------------------------------------------------------------
  select id into v_rep_id from representatives where user_id = v_user.id;

  if v_rep_id is null then
    -- Mungkin sudah pernah diundang lewat email tapi belum tersambung.
    select id into v_rep_id from representatives
    where lower(email_undangan) = v_email and user_id is null;

    if v_rep_id is not null then
      update representatives
      set user_id = v_user.id, status = 'AKTIF'
      where id = v_rep_id;
      raise notice 'alumni: undangan yang sudah ada disambungkan (id %)', v_rep_id;
    else
      insert into representatives (user_id, email_undangan, status, bio)
      values (v_user.id, v_email, 'AKTIF',
        'Akun pengelola proyek. Kampus dan jurusan belum diisi; perbaiki lewat halaman Undang Alumni.')
      returning id into v_rep_id;
      raise notice 'alumni: baris baru dibuat (id %)', v_rep_id;
    end if;

    perform catat_audit(
      v_user.id, 'TAMBAH_AKSES_ALUMNI_PEMILIK', 'representatives', v_rep_id::text,
      null,
      jsonb_build_object('user_id', v_user.id, 'status', 'AKTIF',
        'alasan', 'akses pengelola proyek, dijalankan lewat db/manual/akses-pemilik.sql')
    );
  else
    update representatives set status = 'AKTIF'
    where id = v_rep_id and status <> 'AKTIF';
    raise notice 'alumni: sudah tersambung (id %), dibiarkan', v_rep_id;
  end if;

  -- ---------------------------------------------------------------------
  -- 3. Sisi peserta: TIDAK disentuh di sini, dengan sengaja.
  --
  -- Barisnya sudah ada, tapi registrasinya masih MENUNGGU_PEMBAYARAN, dan
  -- fitur peserta yang terkunci (QR, paspor, kuis) butuh status LUNAS.
  --
  -- Menandai lunas dari skrip berarti menulis status pembayaran tanpa jejak
  -- siapa yang menandai dan kapan. Tabel payments ada justru supaya setiap
  -- penandaan bisa ditelusuri. Jadi langkah itu ditinggalkan untuk dikerjakan
  -- dari halaman Tandai Lunas, yang mencatatnya dengan benar.
  -- ---------------------------------------------------------------------
  raise notice 'peserta: baris participants sudah ada, status pembayaran TIDAK diubah dari sini';
end
$$;

commit;

-- Hasil akhirnya, untuk diperiksa dengan mata.
select
  u.email,
  r.kode                                           as peran,
  (p.id is not null)                               as punya_baris_peserta,
  coalesce(reg.status, 'belum mendaftar')          as status_pendaftaran,
  (rep.id is not null)                             as punya_akses_alumni,
  rep.status                                       as status_alumni
from users u
join roles r on r.id = u.role_id
left join participants p    on p.user_id = u.id
left join registrations reg on reg.user_id = u.id
left join representatives rep on rep.user_id = u.id
where lower(u.email) = 'inondezionenera@gmail.com';
