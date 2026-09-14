-- =============================================================================
-- 0005 — Campuses, majors, booths, visits and materials
--
-- The anti-farming rule lives here. Getting it wrong is the single most
-- expensive mistake in this schema, so the reasoning is spelled out inline.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- universities / majors
-- -----------------------------------------------------------------------------
create table universities (
  id           serial primary key,
  nama         text not null,
  singkatan    text not null,
  logo_url     text,
  kota         text,
  akreditasi   text,
  website      text,
  warna_khas   text,
  aktif        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index universities_nama_idx on universities using gin (nama gin_trgm_ops);

create trigger universities_set_updated_at
  before update on universities
  for each row execute function set_updated_at();

create table majors (
  id             serial primary key,
  nama           text not null,
  rumpun         text not null,
  deskripsi      text,
  prospek_kerja  text,
  aktif          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index majors_rumpun_idx on majors (rumpun);
create index majors_nama_idx   on majors using gin (nama gin_trgm_ops);

create trigger majors_set_updated_at
  before update on majors
  for each row execute function set_updated_at();

-- Which campus offers which major. Without this the quiz can recommend majors
-- but not campuses — and participants need both, because Event 2 is organised
-- by campus and Event 3 by major.
create table university_majors (
  university_id  int not null references universities(id) on delete cascade,
  major_id       int not null references majors(id) on delete cascade,
  primary key (university_id, major_id)
);

create index university_majors_major_idx on university_majors (major_id);

-- Deferred foreign keys from 0002
alter table representatives
  add constraint representatives_university_fk
    foreign key (university_id) references universities(id) on delete set null,
  add constraint representatives_major_fk
    foreign key (major_id) references majors(id) on delete set null;

create index representatives_university_idx on representatives (university_id);
create index representatives_major_idx      on representatives (major_id);

-- -----------------------------------------------------------------------------
-- booths
--
-- One table holds both shapes of booth:
--   Event 2 (EXPO_KAMPUS)  — booth = campus.  "Booth ITB", staffed by ITB alumni.
--   Event 3 (EXPO_JURUSAN) — booth = major.   "Booth Informatics", staffed by
--                            alumni from ITB, ITS and UB sitting together.
-- -----------------------------------------------------------------------------
create table booths (
  id               serial primary key,
  event_id         int  not null references events(id) on delete cascade,
  booth_type       text not null check (booth_type in ('KAMPUS','JURUSAN')),
  university_id    int  references universities(id) on delete cascade,
  major_id         int  references majors(id) on delete cascade,

  nama_tampilan    text not null,
  lokasi           text,
  deskripsi        text,
  xp_max           int  not null default 30 check (xp_max >= 0),
  status           text not null default 'DRAFT'
                     check (status in ('DRAFT','ACTIVE','CLOSED')),

  -- Printed on the poster taped to the booth table. Participants scan the QR
  -- (or type the short code) to unlock the slides the alumni are about to
  -- present. This grants no XP — see booth_checkins below.
  kode_booth       text not null unique,
  qr_token_booth   text not null unique default generate_token(16),

  urutan           int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- A campus booth needs a campus and nothing else; a major booth needs a
  -- major and nothing else. Half-filled rows are rejected outright.
  constraint booths_target_konsisten check (
    (booth_type = 'KAMPUS'  and university_id is not null and major_id is null) or
    (booth_type = 'JURUSAN' and major_id is not null and university_id is null)
  )
);

create index booths_event_idx  on booths (event_id);
create index booths_type_idx   on booths (booth_type);
create index booths_status_idx on booths (status);
create index booths_kode_idx   on booths (kode_booth);
create index booths_qr_idx     on booths (qr_token_booth);
create index booths_univ_idx   on booths (university_id);
create index booths_major_idx  on booths (major_id);

create trigger booths_set_updated_at
  before update on booths
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- booth_visits
--
-- WHY THE UNIQUE KEY IS (participant_id, booth_id) AND NOT (participant_id,
-- university_id):
--
-- During Event 3 a single table labelled "Booth Informatics" is staffed by
-- alumni from three different campuses. Keyed on campus, one participant could
-- collect XP three times without moving:
--
--     ITB alumnus scans Budi  -> +30 XP  accepted
--     ITS alumnus scans Budi  -> +30 XP  accepted
--     UB  alumnus scans Budi  -> +30 XP  accepted
--
-- Keyed on booth, the second and third are rejected. The scanning alumnus's
-- campus is still recorded, so alumni statistics and the final report lose
-- nothing.
-- -----------------------------------------------------------------------------
create table booth_visits (
  id                  bigserial primary key,
  participant_id      uuid not null references participants(id) on delete cascade,
  booth_id            int  not null references booths(id) on delete cascade,

  -- Kept for reporting even though XP is granted once per booth.
  university_id       int  references universities(id) on delete set null,
  major_id            int  references majors(id) on delete set null,
  representative_id   int  references representatives(id) on delete set null,

  jenis               text not null
                        check (jenis in ('HADIR','AKTIF','SANGAT_AKTIF')),
  xp_diberikan        int  not null check (xp_diberikan >= 0),

  scan_uuid           uuid not null unique,
  ditandai            boolean not null default false,
  catatan             text,

  dibatalkan          boolean not null default false,
  dibatalkan_at       timestamptz,

  waktu_scan          timestamptz not null,
  waktu_terima        timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

-- The anti-farming rule. Partial index so a cancelled visit frees the slot —
-- an alumnus who taps the wrong button must be able to scan that person again.
create unique index booth_visits_sekali_per_booth_idx
  on booth_visits (participant_id, booth_id)
  where dibatalkan = false;

create index booth_visits_booth_idx    on booth_visits (booth_id);
create index booth_visits_participant_idx on booth_visits (participant_id);
create index booth_visits_univ_idx     on booth_visits (university_id);
create index booth_visits_rep_idx      on booth_visits (representative_id);
create index booth_visits_ditandai_idx on booth_visits (representative_id)
  where ditandai = true;

-- -----------------------------------------------------------------------------
-- booth_checkins
--
-- Participants mark their own arrival to unlock the presentation material.
-- Alumni still scan them once, at the end, for XP — their workload is unchanged.
--
-- This deliberately grants NO XP. If it did, photographing the poster and
-- sharing it would hand points to people who never showed up. Because the only
-- thing it unlocks is reading material, a leaked poster costs nothing.
-- -----------------------------------------------------------------------------
create table booth_checkins (
  id              bigserial primary key,
  participant_id  uuid not null references participants(id) on delete cascade,
  booth_id        int  not null references booths(id) on delete cascade,
  cara            text not null check (cara in ('SCAN_QR','KETIK_KODE')),
  waktu           timestamptz not null default now(),

  constraint booth_checkins_sekali unique (participant_id, booth_id)
);

create index booth_checkins_booth_idx on booth_checkins (booth_id);

comment on table booth_checkins is
  'Unlocks DI_BOOTH materials. Never touches point_transactions. The gap
   between this table and booth_visits shows how many people walked past a
   booth without actually talking to anyone.';

-- -----------------------------------------------------------------------------
-- materials
--
-- Attaches to a campus (profile, brochure) or to a booth (the slides being
-- presented). Two visibility levels only.
-- -----------------------------------------------------------------------------
create table materials (
  id                 serial primary key,
  university_id      int references universities(id) on delete cascade,
  booth_id           int references booths(id) on delete cascade,
  representative_id  int references representatives(id) on delete set null,

  judul              text not null,
  tipe               text not null check (tipe in ('FILE','LINK')),
  url                text not null,
  akses              text not null default 'PUBLIK'
                       check (akses in ('PUBLIK','DI_BOOTH')),
  ukuran_kb          int,
  urutan             int not null default 0,
  aktif              boolean not null default true,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint materials_punya_induk check (
    university_id is not null or booth_id is not null
  ),

  -- Storage is 1 GB in total. A handful of 40 MB slide decks would eat it, so
  -- uploads are capped and PowerPoint is refused at the API layer.
  constraint materials_ukuran_wajar check (
    ukuran_kb is null or ukuran_kb <= 10240
  )
);

create index materials_university_idx on materials (university_id) where aktif = true;
create index materials_booth_idx      on materials (booth_id) where aktif = true;
create index materials_akses_idx      on materials (akses);

create trigger materials_set_updated_at
  before update on materials
  for each row execute function set_updated_at();
