-- =============================================================================
-- 0012 — Perbaikan: generate_token() tidak bisa melihat pgcrypto
-- =============================================================================
--
-- APA YANG RUSAK
--
-- 0011 memaku `search_path = public, pg_temp` pada setiap fungsi. Maksudnya
-- benar: pada fungsi SECURITY DEFINER, schema yang diletakkan lebih awal di
-- path bisa membajak nama tabel, dan itu cara klasik fitur ini disalahgunakan.
--
-- Tapi di Supabase, pgcrypto tidak dipasang di `public`. Dia dipasang di schema
-- `extensions`:
--
--   pgcrypto   -> extensions
--   uuid-ossp  -> extensions
--   pg_trgm    -> public
--
-- Jadi begitu 0011 dijalankan, `generate_token()` kehilangan penglihatan
-- terhadap `gen_random_bytes()` dan langsung mati:
--
--   ERROR: function gen_random_bytes(integer) does not exist
--
-- KENAPA INI BERBAHAYA
--
-- generate_token() dipakai dua tempat, dan dua-duanya baru terpakai pada hari
-- acara, bukan waktu ngoding:
--
--   1. db/migrations/0005, kolom booths.qr_token_booth punya default
--      generate_token(16). Artinya SATU BOOTH PUN TIDAK BISA DIBUAT.
--
--   2. db/migrations/0008 baris 230, waktu pembayaran ditandai lunas:
--        if v_part.qr_token is null then v_token := generate_token(16);
--      Artinya QR IDENTITAS PESERTA TIDAK BISA DITERBITKAN. Peserta sudah
--      bayar, statusnya LUNAS, tapi QR-nya tidak pernah muncul, dan tidak ada
--      seorang pun bisa dipindai di pintu masuk.
--
-- Nomor 2 itu yang paling gawat. Tidak kelihatan sama sekali sampai ada orang
-- pertama yang benar-benar dinyatakan lunas.
--
-- Ditemukan waktu menjalankan db/manual/data-contoh.sql pertama kali. Tidak
-- akan pernah ketemu lewat `npm test`, karena tidak ada satu tes pun yang
-- menyentuh database.
--
-- CARA MEMPERBAIKI
--
-- `extensions` ditambahkan ke search_path, DI BELAKANG `public`. Urutannya
-- disengaja: public tetap diperiksa lebih dulu, jadi tabel kita tidak bisa
-- dibajak nama dari extensions. Dan `extensions` sendiri milik supabase_admin,
-- tidak bisa ditulisi anon maupun authenticated, jadi tidak ada yang bisa
-- menaruh fungsi palsu di sana.
--
-- Pemakaiannya juga ditulis lengkap dengan nama schema di badan fungsi, supaya
-- tetap jalan walaupun suatu saat search_path-nya dipatok ulang oleh orang lain.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tulis ulang generate_token dengan pemanggilan yang lengkap nama schema.
--
-- Dicari dulu di mana pgcrypto sebenarnya dipasang, bukan diasumsikan
-- `extensions`, karena kalau nanti ada yang memasangnya di public, versi yang
-- menuliskan `extensions.` mati justru karena kebalikan dari masalah ini.
-- -----------------------------------------------------------------------------
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'gen_random_bytes'
  limit 1;

  if v_schema is null then
    raise exception 'gen_random_bytes tidak ditemukan. pgcrypto belum terpasang?';
  end if;

  execute format($f$
    create or replace function generate_token(bytes int default 24)
    returns text
    language sql
    as $body$
      select encode(%I.gen_random_bytes(bytes), 'hex');
    $body$;
  $f$, v_schema);

  execute format(
    'alter function generate_token(int) set search_path = public, %I, pg_temp',
    v_schema
  );

  raise notice 'generate_token diperbaiki, pgcrypto ada di schema %', v_schema;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Buktikan dia benar-benar hidup.
--
-- Kalau bagian ini gagal, migration berhenti di sini, bukan lolos lalu
-- meninggalkan masalah yang sama untuk ditemukan lagi di hari acara.
-- -----------------------------------------------------------------------------
do $$
declare
  v_token text;
begin
  v_token := generate_token(16);

  if v_token is null or length(v_token) <> 32 then
    raise exception 'generate_token(16) mestinya 32 karakter hex, dapatnya: %',
      coalesce(v_token, 'null');
  end if;

  if v_token !~ '^[0-9a-f]{32}$' then
    raise exception 'generate_token(16) menghasilkan yang bukan hex: %', v_token;
  end if;

  -- Dua pemanggilan tidak boleh sama. Ini identitas peserta, jadi acaknya harus
  -- betulan acak.
  if generate_token(16) = generate_token(16) then
    raise exception 'generate_token menghasilkan nilai yang sama dua kali';
  end if;

  raise notice 'generate_token terbukti jalan';
end $$;

-- -----------------------------------------------------------------------------
-- 3. Jaga supaya tidak rusak lagi.
--
-- Loop di 0011 memaku search_path setiap fungsi ke `public, pg_temp`. Kalau
-- 0011 dijalankan ulang tanpa perbaikan, masalah yang sama kembali. Berkas 0011
-- sudah ikut diperbaiki, tapi blok di bawah ini menambal fungsi mana pun yang
-- badannya memanggil pgcrypto, supaya tidak bergantung pada urutan orang
-- menjalankan berkas.
-- -----------------------------------------------------------------------------
do $$
declare
  v_schema text;
  f record;
begin
  select n.nspname into v_schema
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'gen_random_bytes' limit 1;

  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )
      and pg_get_functiondef(p.oid) ~* '(gen_random_bytes|\mdigest\(|\mcrypt\(|\mhmac\()'
  loop
    execute format('alter function %s set search_path = public, %I, pg_temp',
                   f.sig, v_schema);
    raise notice 'search_path diperluas untuk %', f.sig;
  end loop;
end $$;
