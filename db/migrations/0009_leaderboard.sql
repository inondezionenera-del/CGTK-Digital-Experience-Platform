-- =============================================================================
-- 0009 — Leaderboard, freezing and fairness checks
-- =============================================================================

-- -----------------------------------------------------------------------------
-- hitung_leaderboard
--
-- Ties are close to certain: 500 participants drawing on a small set of XP
-- sources will collide at positions 3 and 5. The tiebreakers are fixed here and
-- shown openly in the app, so nobody has to take the committee's word for it.
--
--   1. highest XP
--   2. whoever reached that total first
--   3. more booths visited
--   4. registered earlier
-- -----------------------------------------------------------------------------
create or replace function hitung_leaderboard(p_limit int default 50)
returns jsonb
language sql
stable
as $$
  with skor as (
    select
      p.id                                    as participant_id,
      u.nama,
      p.asal_sekolah,
      coalesce(sum(pt.xp) filter (where pt.dibatalkan = false), 0)::int as total_xp,
      max(pt.created_at) filter (where pt.dibatalkan = false)           as waktu_capai,
      (select count(*) from booth_visits bv
        where bv.participant_id = p.id and bv.dibatalkan = false)::int  as jumlah_booth,
      r.created_at                            as waktu_daftar
    from participants p
    join users u on u.id = p.user_id
    join registrations r on r.user_id = p.user_id
    left join point_transactions pt on pt.participant_id = p.id
    where r.status = 'LUNAS'
    group by p.id, u.nama, p.asal_sekolah, r.created_at
  ),
  berperingkat as (
    select *,
      row_number() over (
        order by total_xp desc,
                 waktu_capai asc nulls last,
                 jumlah_booth desc,
                 waktu_daftar asc
      ) as posisi
    from skor
  )
  select jsonb_build_object(
    'beku', false,
    'diperbarui_at', now(),
    'peringkat', coalesce(jsonb_agg(jsonb_build_object(
      'posisi', b.posisi,
      'participant_id', b.participant_id,
      'nama', b.nama,
      'asal_sekolah', b.asal_sekolah,
      'total_xp', b.total_xp,
      'level', level_peserta(b.total_xp),
      'jumlah_booth', b.jumlah_booth
    ) order by b.posisi), '[]'::jsonb),
    'aturan_pemutus_seri', jsonb_build_array(
      'XP tertinggi',
      'Yang lebih dulu mencapai XP tersebut',
      'Yang lebih banyak booth dikunjungi',
      'Yang lebih dulu mendaftar'
    )
  )
  from berperingkat b
  where b.posisi <= p_limit;
$$;

-- -----------------------------------------------------------------------------
-- bekukan_leaderboard
--
-- After this the standings are read from the snapshot, not recomputed. XP may
-- keep arriving; the board does not move.
-- -----------------------------------------------------------------------------
create or replace function bekukan_leaderboard(p_oleh uuid, p_jumlah_pemenang int default 3)
returns jsonb
language plpgsql
as $$
declare
  v_snapshot jsonb;
  v_jumlah   int;
  v_id       int;
begin
  if exists (select 1 from leaderboard_freeze where dibekukan_at is not null) then
    return jsonb_build_object('sukses', false, 'kode', 'SUDAH_DIBEKUKAN',
      'pesan', 'Papan peringkat sudah dibekukan sebelumnya');
  end if;

  v_snapshot := hitung_leaderboard(1000);
  select count(*)::int into v_jumlah
  from participants p join registrations r on r.user_id = p.user_id
  where r.status = 'LUNAS';

  insert into leaderboard_freeze (dibekukan_at, dibekukan_oleh, jumlah_pemenang, snapshot)
  values (now(), p_oleh, p_jumlah_pemenang, v_snapshot)
  returning id into v_id;

  perform catat_audit(p_oleh, 'BEKUKAN_LEADERBOARD', 'leaderboard_freeze', v_id::text,
    null, jsonb_build_object('jumlah_peserta', v_jumlah));

  return jsonb_build_object('sukses', true, 'data', jsonb_build_object(
    'dibekukan_at', now(),
    'jumlah_peserta', v_jumlah,
    'snapshot_tersimpan', true
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- sahkan_pemenang
--
-- A deliberate pause between freezing and announcing. Checking afterwards, on
-- stage, is too late.
-- -----------------------------------------------------------------------------
create or replace function sahkan_pemenang(
  p_oleh    uuid,
  p_jumlah  int default null,
  p_catatan text default null
) returns jsonb
language plpgsql
as $$
declare
  v_freeze leaderboard_freeze%rowtype;
begin
  select * into v_freeze from leaderboard_freeze
  where dibekukan_at is not null order by dibekukan_at desc limit 1;

  if not found then
    return jsonb_build_object('sukses', false, 'kode', 'BELUM_DIBEKUKAN',
      'pesan', 'Bekukan papan peringkat dulu sebelum mengesahkan pemenang');
  end if;

  if v_freeze.disahkan_at is not null then
    return jsonb_build_object('sukses', false, 'kode', 'SUDAH_DISAHKAN');
  end if;

  update leaderboard_freeze
  set disahkan_at = now(), disahkan_oleh = p_oleh,
      jumlah_pemenang = coalesce(p_jumlah, jumlah_pemenang),
      catatan = p_catatan
  where id = v_freeze.id;

  -- Exclusive backgrounds go to the top 15 at freeze time, and stay theirs.
  -- Tying them to live standings would make them blink in and out all day as
  -- people move around the table.
  insert into participant_cosmetics (participant_id, cosmetic_id, tipe)
  select (p ->> 'participant_id')::uuid, c.id, c.tipe
  from jsonb_array_elements(v_freeze.snapshot -> 'peringkat') p
  cross join cosmetics c
  where (p ->> 'posisi')::int <= 15
    and c.syarat_top15 = true and c.aktif = true
  on conflict do nothing;

  perform catat_audit(p_oleh, 'SAHKAN_PEMENANG', 'leaderboard_freeze',
    v_freeze.id::text, null, jsonb_build_object('jumlah_pemenang', coalesce(p_jumlah, v_freeze.jumlah_pemenang)));

  return jsonb_build_object('sukses', true, 'data', jsonb_build_object(
    'disahkan_at', now(),
    'jumlah_pemenang', coalesce(p_jumlah, v_freeze.jumlah_pemenang)
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- cek_kewajaran_xp
--
-- Flags only; it never punishes anyone. The committee decides.
--
-- The risk worth watching is not participants — it is an alumnus handing the
-- maximum to every friend who walks past.
-- -----------------------------------------------------------------------------
create or replace function cek_kewajaran_xp()
returns jsonb
language sql
stable
as $$
  with rata as (
    select avg(t)::numeric as rata_xp
    from (
      select total_xp(p.id) as t
      from participants p
      join registrations r on r.user_id = p.user_id
      where r.status = 'LUNAS'
    ) x
  ),
  peserta_aneh as (
    select u.nama, total_xp(p.id) as total_xp
    from participants p
    join users u on u.id = p.user_id
    join registrations r on r.user_id = p.user_id, rata
    where r.status = 'LUNAS'
      and rata.rata_xp > 0
      and total_xp(p.id) > rata.rata_xp * 2.5
    order by total_xp desc
    limit 20
  ),
  alumni_aneh as (
    select u.nama, un.nama as kampus,
           count(*)::int as total_scan,
           round(100.0 * count(*) filter (where bv.jenis = 'SANGAT_AKTIF') / count(*))::int as persen_maksimal
    from booth_visits bv
    join representatives rep on rep.id = bv.representative_id
    join users u on u.id = rep.user_id
    left join universities un on un.id = rep.university_id
    where bv.dibatalkan = false
    group by u.nama, un.nama
    having count(*) >= 10
       and count(*) filter (where bv.jenis = 'SANGAT_AKTIF') * 100 / count(*) >= 90
  ),
  luar_jam as (
    select u.nama as peserta, pt.created_at as waktu, pt.xp
    from point_transactions pt
    join participants p on p.id = pt.participant_id
    join users u on u.id = p.user_id
    where pt.dibatalkan = false
      and (extract(hour from pt.created_at at time zone 'Asia/Jakarta') < 6
        or extract(hour from pt.created_at at time zone 'Asia/Jakarta') >= 22)
    order by pt.created_at desc
    limit 20
  )
  select jsonb_build_object(
    'rata_rata_xp', (select round(rata_xp) from rata),
    'peserta_mencurigakan', coalesce((select jsonb_agg(to_jsonb(peserta_aneh)) from peserta_aneh), '[]'::jsonb),
    'alumni_mencurigakan', coalesce((select jsonb_agg(to_jsonb(alumni_aneh)) from alumni_aneh), '[]'::jsonb),
    'xp_di_luar_jam', coalesce((select jsonb_agg(to_jsonb(luar_jam)) from luar_jam), '[]'::jsonb),
    'catatan', 'Daftar ini hanya menandai, tidak menghukum. Panitia yang memutuskan.'
  );
$$;
