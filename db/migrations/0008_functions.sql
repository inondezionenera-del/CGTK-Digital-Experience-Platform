-- =============================================================================
-- 0008 — Business logic that must be atomic
--
-- These live in the database rather than in the Worker because each one touches
-- several tables at once. A gate scan writes an attendance row, an XP ledger
-- row and an audit row; over HTTP that is three separate calls, and a dropped
-- connection between them leaves XP granted for a check-in that never happened.
--
-- Every function returns jsonb of the shape:
--   { "sukses": bool, "kode": text, "pesan": text, "data": {...} }
-- so the API layer can map it straight onto an HTTP response.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- catat_audit — internal helper
-- -----------------------------------------------------------------------------
create or replace function catat_audit(
  p_user_id    uuid,
  p_aksi       text,
  p_tabel      text default null,
  p_record_id  text default null,
  p_sebelum    jsonb default null,
  p_sesudah    jsonb default null
) returns void
language sql
as $$
  insert into audit_logs (user_id, aksi, tabel, record_id, sebelum, sesudah)
  values (p_user_id, p_aksi, p_tabel, p_record_id, p_sebelum, p_sesudah);
$$;

-- -----------------------------------------------------------------------------
-- ambil_setting — reads a setting with a fallback
-- -----------------------------------------------------------------------------
create or replace function ambil_setting(p_kunci text, p_default text default null)
returns text
language sql
stable
as $$
  select coalesce((select nilai from settings where kunci = p_kunci), p_default);
$$;

-- -----------------------------------------------------------------------------
-- tambah_xp
--
-- The only sanctioned way to write to the ledger. Danar's quiz and mission code
-- calls this rather than inserting directly, which keeps a single writer for
-- the table and removes the biggest source of merge conflicts between us.
-- -----------------------------------------------------------------------------
create or replace function tambah_xp(
  p_participant_id  uuid,
  p_activity_kode   text,
  p_sumber_tipe     text,
  p_sumber_id       bigint default null,
  p_xp_override     int default null,
  p_diberikan_oleh  uuid default null,
  p_catatan         text default null
) returns bigint
language plpgsql
as $$
declare
  v_activity_id int;
  v_xp          int;
  v_id          bigint;
begin
  select id, xp_default into v_activity_id, v_xp
  from activities where kode = p_activity_kode;

  if v_activity_id is null then
    raise exception 'Unknown activity code: %', p_activity_kode
      using errcode = 'P0002';
  end if;

  -- An override is only honoured for activities flagged as adjustable.
  if p_xp_override is not null then
    if exists (select 1 from activities where id = v_activity_id and bisa_diubah) then
      v_xp := p_xp_override;
    end if;
  end if;

  insert into point_transactions
    (participant_id, activity_id, xp, sumber_tipe, sumber_id, diberikan_oleh, catatan)
  values
    (p_participant_id, v_activity_id, v_xp, p_sumber_tipe, p_sumber_id, p_diberikan_oleh, p_catatan)
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- total_xp / level_peserta
--
-- Level is computed, never stored. Cancel a booth visit and the level follows
-- automatically.
-- -----------------------------------------------------------------------------
create or replace function total_xp(p_participant_id uuid)
returns int
language sql
stable
as $$
  select coalesce(sum(xp), 0)::int
  from point_transactions
  where participant_id = p_participant_id and dibatalkan = false;
$$;

create or replace function level_peserta(p_total_xp int)
returns jsonb
language sql
stable
as $$
  select coalesce(
    (select jsonb_build_object('nomor', nomor, 'nama', nama, 'xp_minimum', xp_minimum)
     from levels where xp_minimum <= p_total_xp
     order by xp_minimum desc limit 1),
    '{"nomor":1,"nama":"Pencari Arah","xp_minimum":0}'::jsonb
  );
$$;

-- -----------------------------------------------------------------------------
-- hitung_profil_lengkap
--
-- Administration's condition: payment instructions stay hidden until every
-- required question is answered. Recomputed whenever a profile is saved.
-- -----------------------------------------------------------------------------
create or replace function hitung_profil_lengkap(p_participant_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_p        participants%rowtype;
  v_kurang   text[] := '{}';
  v_field    record;
  v_lengkap  boolean;
begin
  select * into v_p from participants where id = p_participant_id;
  if not found then
    return jsonb_build_object('sukses', false, 'kode', 'PESERTA_TIDAK_DITEMUKAN');
  end if;

  -- Built-in required fields
  if coalesce(trim(v_p.asal_sekolah), '') = '' then v_kurang := v_kurang || 'asal_sekolah'; end if;
  if coalesce(trim(v_p.kelas), '')        = '' then v_kurang := v_kurang || 'kelas'; end if;

  -- Admin-defined required fields
  for v_field in
    select kunci, label from form_fields where aktif = true and wajib = true
  loop
    if v_p.extra_fields -> v_field.kunci is null
       or v_p.extra_fields ->> v_field.kunci = ''
       or v_p.extra_fields ->> v_field.kunci = 'null'
    then
      v_kurang := v_kurang || v_field.kunci;
    end if;
  end loop;

  v_lengkap := array_length(v_kurang, 1) is null;

  update registrations
  set profil_lengkap    = v_lengkap,
      profil_lengkap_at = case
                            when v_lengkap and profil_lengkap_at is null then now()
                            when not v_lengkap then null
                            else profil_lengkap_at
                          end,
      status = case
                 when status in ('PROFIL_BELUM_LENGKAP','MENUNGGU_PEMBAYARAN')
                   then case when v_lengkap then 'MENUNGGU_PEMBAYARAN' else 'PROFIL_BELUM_LENGKAP' end
                 else status
               end
  where user_id = v_p.user_id;

  return jsonb_build_object(
    'sukses', true,
    'data', jsonb_build_object(
      'profil_lengkap', v_lengkap,
      'field_belum_diisi', to_jsonb(v_kurang)
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- tandai_lunas
--
-- Administration decides; the system never marks anyone settled on its own.
-- -----------------------------------------------------------------------------
create or replace function tandai_lunas(
  p_kode_registrasi  text,
  p_oleh             uuid,
  p_catatan          text default null
) returns jsonb
language plpgsql
as $$
declare
  v_reg    registrations%rowtype;
  v_user   users%rowtype;
  v_part   participants%rowtype;
  v_token  text;
begin
  select * into v_reg from registrations
  where upper(kode_registrasi) = upper(trim(p_kode_registrasi));

  if not found then
    return jsonb_build_object('sukses', false, 'kode', 'KODE_TIDAK_DITEMUKAN',
      'pesan', 'Kode registrasi tidak ditemukan');
  end if;

  if v_reg.status = 'LUNAS' then
    return jsonb_build_object('sukses', false, 'kode', 'SUDAH_LUNAS',
      'pesan', 'Pendaftaran ini sudah ditandai lunas');
  end if;

  -- Guards against a settled registration with a half-finished record, which
  -- is what leaves holes in the final report.
  if not v_reg.profil_lengkap then
    return jsonb_build_object('sukses', false, 'kode', 'PROFIL_BELUM_LENGKAP',
      'pesan', 'Peserta belum melengkapi profilnya');
  end if;

  select * into v_user from users where id = v_reg.user_id;
  select * into v_part from participants where user_id = v_reg.user_id;

  update registrations set status = 'LUNAS' where id = v_reg.id;

  insert into payments (registration_id, ditandai_oleh, catatan)
  values (v_reg.id, p_oleh, p_catatan);

  -- Issue the QR identity now, not at registration time.
  if v_part.qr_token is null then
    v_token := generate_token(16);
    update participants
    set qr_token = v_token, qr_terbit_at = now()
    where id = v_part.id;
  else
    v_token := v_part.qr_token;
  end if;

  perform catat_audit(p_oleh, 'TANDAI_LUNAS', 'registrations', v_reg.id::text,
    jsonb_build_object('status', v_reg.status),
    jsonb_build_object('status', 'LUNAS', 'kode_registrasi', v_reg.kode_registrasi));

  return jsonb_build_object('sukses', true, 'data', jsonb_build_object(
    'nama', v_user.nama,
    'asal_sekolah', v_part.asal_sekolah,
    'kode_registrasi', v_reg.kode_registrasi,
    'status', 'LUNAS',
    'qr_diterbitkan', true
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- batal_lunas — Super Admin only, and it revokes the QR
-- -----------------------------------------------------------------------------
create or replace function batal_lunas(
  p_registration_id uuid,
  p_oleh            uuid,
  p_alasan          text
) returns jsonb
language plpgsql
as $$
declare
  v_reg registrations%rowtype;
begin
  if coalesce(trim(p_alasan), '') = '' then
    return jsonb_build_object('sukses', false, 'kode', 'ALASAN_WAJIB',
      'pesan', 'Alasan pembatalan wajib diisi');
  end if;

  select * into v_reg from registrations where id = p_registration_id;
  if not found then
    return jsonb_build_object('sukses', false, 'kode', 'TIDAK_DITEMUKAN');
  end if;

  update payments
  set dibatalkan = true, dibatalkan_oleh = p_oleh,
      dibatalkan_at = now(), alasan_pembatalan = p_alasan
  where registration_id = p_registration_id and dibatalkan = false;

  update registrations set status = 'MENUNGGU_PEMBAYARAN' where id = p_registration_id;

  -- Revoking the QR is the point: without it the participant can still walk in.
  update participants
  set qr_token = null, qr_terbit_at = null
  where user_id = v_reg.user_id;

  perform catat_audit(p_oleh, 'BATAL_LUNAS', 'registrations', p_registration_id::text,
    jsonb_build_object('status', 'LUNAS'),
    jsonb_build_object('status', 'MENUNGGU_PEMBAYARAN', 'alasan', p_alasan));

  return jsonb_build_object('sukses', true, 'data',
    jsonb_build_object('status', 'MENUNGGU_PEMBAYARAN', 'qr_dicabut', true));
end;
$$;

-- -----------------------------------------------------------------------------
-- scan_presensi
--
-- One transaction: verify, record attendance, grant XP, log. Six failure paths,
-- each with a message the field staff can act on without calling anyone.
-- -----------------------------------------------------------------------------
create or replace function scan_presensi(
  p_qr_token    text,
  p_session_id  int,
  p_scan_uuid   uuid,
  p_waktu_scan  timestamptz,
  p_oleh        uuid,
  p_sumber      text default 'ONLINE'
) returns jsonb
language plpgsql
as $$
declare
  v_part     participants%rowtype;
  v_user     users%rowtype;
  v_sesi     sessions%rowtype;
  v_reg      registrations%rowtype;
  v_att_id   bigint;
  v_ada      attendances%rowtype;
begin
  -- Replay of an already-accepted scan. Answered as success on purpose: the
  -- phone that resent it did nothing wrong, and an error would make it retry
  -- forever.
  select * into v_ada from attendances where scan_uuid = p_scan_uuid;
  if found then
    select * into v_user from users where id = v_ada.user_id;
    return jsonb_build_object('sukses', true, 'kode', 'SUDAH_TERKIRIM',
      'data', jsonb_build_object('nama', v_user.nama, 'sudah_pernah', true));
  end if;

  select * into v_part from participants where qr_token = p_qr_token;
  if not found then
    return jsonb_build_object('sukses', false, 'kode', 'QR_TIDAK_DIKENAL',
      'pesan', 'QR tidak terdaftar di sistem');
  end if;

  select * into v_user from users where id = v_part.user_id;
  select * into v_reg  from registrations where user_id = v_part.user_id;

  if v_reg.status <> 'LUNAS' then
    return jsonb_build_object('sukses', false, 'kode', 'BELUM_BAYAR',
      'pesan', v_user.nama || ' belum menyelesaikan pembayaran');
  end if;

  select * into v_sesi from sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('sukses', false, 'kode', 'SESI_TIDAK_DITEMUKAN');
  end if;

  -- Clock time is never consulted. Only the switch the Events division holds.
  if v_sesi.status <> 'ACTIVE' then
    return jsonb_build_object('sukses', false, 'kode', 'SESI_DITUTUP',
      'pesan', 'Sesi belum dibuka atau sudah ditutup');
  end if;

  begin
    insert into attendances
      (user_id, session_id, scan_uuid, waktu_scan, scanned_by, sumber)
    values
      (v_part.user_id, p_session_id, p_scan_uuid, p_waktu_scan, p_oleh, p_sumber)
    returning id into v_att_id;
  exception when unique_violation then
    return jsonb_build_object('sukses', false, 'kode', 'SUDAH_SCAN',
      'pesan', v_user.nama || ' sudah presensi di sesi ini');
  end;

  perform tambah_xp(v_part.id, 'PRESENSI_SESI', 'ATTENDANCE', v_att_id,
                    v_sesi.xp, p_oleh, null);

  return jsonb_build_object('sukses', true, 'data', jsonb_build_object(
    'nama', v_user.nama,
    'asal_sekolah', v_part.asal_sekolah,
    'kelas', v_part.kelas,
    'sesi', v_sesi.nama,
    'xp_didapat', v_sesi.xp,
    'waktu', p_waktu_scan
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- booth_untuk_alumni
--
-- Alumni are never asked which booth they are on. Their campus and major are
-- already known, and the active event decides which of the two applies.
-- -----------------------------------------------------------------------------
create or replace function booth_untuk_alumni(p_user_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_rep    representatives%rowtype;
  v_event  events%rowtype;
  v_booth  booths%rowtype;
begin
  select * into v_rep from representatives where user_id = p_user_id;
  if not found then
    return jsonb_build_object('sukses', false, 'kode', 'BUKAN_ALUMNI');
  end if;

  select e.* into v_event
  from events e
  where e.aktif = true
    and exists (select 1 from booths b where b.event_id = e.id and b.status = 'ACTIVE')
  order by e.urutan
  limit 1;

  if not found then
    return jsonb_build_object('sukses', true, 'data', null,
      'pesan', 'Belum ada booth yang aktif saat ini');
  end if;

  if v_event.tipe = 'EXPO_KAMPUS' then
    select * into v_booth from booths
    where event_id = v_event.id and booth_type = 'KAMPUS'
      and university_id = v_rep.university_id;
  elsif v_event.tipe = 'EXPO_JURUSAN' then
    select * into v_booth from booths
    where event_id = v_event.id and booth_type = 'JURUSAN'
      and major_id = v_rep.major_id;
  else
    return jsonb_build_object('sukses', true, 'data', null,
      'pesan', 'Acara yang berlangsung tidak memakai booth');
  end if;

  if not found then
    return jsonb_build_object('sukses', true, 'data', null,
      'pesan', 'Booth untuk kamu belum dibuat di acara ini');
  end if;

  return jsonb_build_object('sukses', true, 'data', jsonb_build_object(
    'booth', to_jsonb(v_booth) - 'qr_token_booth',
    'acara', jsonb_build_object('id', v_event.id, 'nama', v_event.nama, 'tipe', v_event.tipe),
    'representative_id', v_rep.id,
    'opsi_xp', jsonb_build_array(
      jsonb_build_object('jenis','HADIR','label','👋 Hadir',
        'xp', ambil_setting('xp_booth_hadir','10')::int),
      jsonb_build_object('jenis','AKTIF','label','💬 Aktif',
        'xp', ambil_setting('xp_booth_aktif','20')::int),
      jsonb_build_object('jenis','SANGAT_AKTIF','label','🌟 Sangat Aktif',
        'xp', ambil_setting('xp_booth_sangat_aktif','30')::int)
    )
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- scan_booth
--
-- The anti-farming path. The XP ceiling is re-checked here, on the server: a
-- limit enforced only in the phone app is no limit at all.
-- -----------------------------------------------------------------------------
create or replace function scan_booth(
  p_qr_token    text,
  p_booth_id    int,
  p_jenis       text,
  p_scan_uuid   uuid,
  p_waktu_scan  timestamptz,
  p_oleh        uuid,
  p_ditandai    boolean default false,
  p_catatan     text default null
) returns jsonb
language plpgsql
as $$
declare
  v_part      participants%rowtype;
  v_user      users%rowtype;
  v_reg       registrations%rowtype;
  v_booth     booths%rowtype;
  v_rep       representatives%rowtype;
  v_xp        int;
  v_xp_max    int;
  v_visit_id  bigint;
  v_lama      record;
  v_ada       booth_visits%rowtype;
  v_total     int;
begin
  select * into v_ada from booth_visits where scan_uuid = p_scan_uuid;
  if found then
    return jsonb_build_object('sukses', true, 'kode', 'SUDAH_TERKIRIM',
      'data', jsonb_build_object('sudah_pernah', true));
  end if;

  select * into v_booth from booths where id = p_booth_id;
  if not found then
    return jsonb_build_object('sukses', false, 'kode', 'BOOTH_TIDAK_DITEMUKAN');
  end if;

  if v_booth.status <> 'ACTIVE' then
    return jsonb_build_object('sukses', false, 'kode', 'BOOTH_DITUTUP',
      'pesan', 'Booth sudah ditutup');
  end if;

  select * into v_part from participants where qr_token = p_qr_token;
  if not found then
    return jsonb_build_object('sukses', false, 'kode', 'QR_TIDAK_DIKENAL',
      'pesan', 'QR tidak terdaftar di sistem');
  end if;

  select * into v_user from users where id = v_part.user_id;
  select * into v_reg  from registrations where user_id = v_part.user_id;

  if v_reg.status <> 'LUNAS' then
    return jsonb_build_object('sukses', false, 'kode', 'BELUM_BAYAR',
      'pesan', v_user.nama || ' belum menyelesaikan pembayaran');
  end if;

  select * into v_rep from representatives where user_id = p_oleh;

  -- Already collected here. The message names the campus of the alumnus who
  -- served them first, otherwise the person holding the phone assumes a bug.
  select bv.waktu_terima, u.nama as kampus into v_lama
  from booth_visits bv
  left join universities u on u.id = bv.university_id
  where bv.participant_id = v_part.id
    and bv.booth_id = p_booth_id
    and bv.dibatalkan = false
  limit 1;

  if found then
    return jsonb_build_object('sukses', false, 'kode', 'SUDAH_AMBIL_POIN',
      'pesan', v_user.nama || ' sudah mengambil poin di ' || v_booth.nama_tampilan || '!',
      'data', jsonb_build_object(
        'waktu_sebelumnya', v_lama.waktu_terima,
        'oleh_alumni_dari', v_lama.kampus
      ));
  end if;

  v_xp := case p_jenis
            when 'HADIR'        then ambil_setting('xp_booth_hadir','10')::int
            when 'AKTIF'        then ambil_setting('xp_booth_aktif','20')::int
            when 'SANGAT_AKTIF' then ambil_setting('xp_booth_sangat_aktif','30')::int
            else 0
          end;

  v_xp_max := least(v_booth.xp_max, ambil_setting('xp_booth_max','30')::int);
  if v_xp > v_xp_max then
    v_xp := v_xp_max;
  end if;

  begin
    insert into booth_visits (
      participant_id, booth_id, university_id, major_id, representative_id,
      jenis, xp_diberikan, scan_uuid, ditandai, catatan, waktu_scan
    ) values (
      v_part.id, p_booth_id,
      coalesce(v_booth.university_id, v_rep.university_id),
      coalesce(v_booth.major_id, v_rep.major_id),
      v_rep.id, p_jenis, v_xp, p_scan_uuid, p_ditandai, p_catatan, p_waktu_scan
    ) returning id into v_visit_id;
  exception when unique_violation then
    return jsonb_build_object('sukses', false, 'kode', 'SUDAH_AMBIL_POIN',
      'pesan', v_user.nama || ' sudah mengambil poin di booth ini!');
  end;

  perform tambah_xp(v_part.id, 'KUNJUNGAN_BOOTH', 'BOOTH_VISIT', v_visit_id,
                    v_xp, p_oleh, null);

  -- Being scanned also unlocks the booth material, for participants who never
  -- got round to scanning the poster.
  insert into booth_checkins (participant_id, booth_id, cara)
  values (v_part.id, p_booth_id, 'SCAN_QR')
  on conflict (participant_id, booth_id) do nothing;

  select count(*)::int into v_total
  from booth_visits
  where booth_id = p_booth_id and dibatalkan = false
    and waktu_terima::date = current_date;

  return jsonb_build_object('sukses', true, 'data', jsonb_build_object(
    'visit_id', v_visit_id,
    'nama', v_user.nama,
    'asal_sekolah', v_part.asal_sekolah,
    'booth', v_booth.nama_tampilan,
    'jenis', p_jenis,
    'xp_diberikan', v_xp,
    'total_pengunjung_hari_ini', v_total
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- batal_scan_booth
--
-- No time limit, by design. Alumni usually notice a mis-tap two or three
-- participants later; a countdown would send them looking for a committee
-- member instead.
-- -----------------------------------------------------------------------------
create or replace function batal_scan_booth(p_visit_id bigint, p_oleh uuid)
returns jsonb
language plpgsql
as $$
declare
  v_visit booth_visits%rowtype;
  v_user  users%rowtype;
begin
  select * into v_visit from booth_visits where id = p_visit_id;
  if not found then
    return jsonb_build_object('sukses', false, 'kode', 'TIDAK_DITEMUKAN');
  end if;

  if v_visit.dibatalkan then
    return jsonb_build_object('sukses', false, 'kode', 'SUDAH_DIBATALKAN');
  end if;

  update booth_visits
  set dibatalkan = true, dibatalkan_at = now()
  where id = p_visit_id;

  -- Reversal is a new row, never an edit. The history has to stay readable.
  update point_transactions set dibatalkan = true
  where sumber_tipe = 'BOOTH_VISIT' and sumber_id = p_visit_id;

  perform tambah_xp(v_visit.participant_id, 'KUNJUNGAN_BOOTH', 'KOREKSI',
                    p_visit_id, -v_visit.xp_diberikan, p_oleh,
                    'Pembatalan scan booth');

  select u.* into v_user
  from users u join participants p on p.user_id = u.id
  where p.id = v_visit.participant_id;

  perform catat_audit(p_oleh, 'BATAL_SCAN_BOOTH', 'booth_visits', p_visit_id::text,
    jsonb_build_object('xp', v_visit.xp_diberikan), null);

  return jsonb_build_object('sukses', true, 'data', jsonb_build_object(
    'dibatalkan', true,
    'xp_ditarik', v_visit.xp_diberikan,
    'peserta', v_user.nama
  ));
end;
$$;

-- -----------------------------------------------------------------------------
-- checkin_booth — unlocks material, grants no XP
-- -----------------------------------------------------------------------------
create or replace function checkin_booth(
  p_participant_id uuid,
  p_booth_id       int,
  p_cara           text
) returns jsonb
language plpgsql
as $$
declare
  v_booth  booths%rowtype;
  v_baru   boolean := true;
  v_materi jsonb;
begin
  select * into v_booth from booths where id = p_booth_id;
  if not found then
    return jsonb_build_object('sukses', false, 'kode', 'BOOTH_TIDAK_DITEMUKAN');
  end if;

  if v_booth.status = 'DRAFT' then
    return jsonb_build_object('sukses', false, 'kode', 'BOOTH_BELUM_DIBUKA',
      'pesan', 'Booth ini belum dibuka panitia');
  end if;

  insert into booth_checkins (participant_id, booth_id, cara)
  values (p_participant_id, p_booth_id, p_cara)
  on conflict (participant_id, booth_id) do nothing;

  if not found then v_baru := false; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'judul', judul, 'tipe', tipe, 'url', url, 'akses', akses
         ) order by urutan), '[]'::jsonb)
  into v_materi
  from materials
  where booth_id = p_booth_id and aktif = true;

  return jsonb_build_object('sukses', true, 'data', jsonb_build_object(
    'booth', jsonb_build_object(
      'id', v_booth.id,
      'nama_tampilan', v_booth.nama_tampilan,
      'lokasi', v_booth.lokasi,
      'booth_type', v_booth.booth_type
    ),
    'materi_terbuka', v_materi,
    'sudah_pernah', not v_baru,
    'pesan', 'Materi ' || v_booth.nama_tampilan || ' sudah terbuka. Selamat menyimak!'
  ));
end;
$$;
