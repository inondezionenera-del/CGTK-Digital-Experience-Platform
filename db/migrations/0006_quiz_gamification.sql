-- =============================================================================
-- 0006 — Quiz and gamification
--
-- Ownership note: everything in this file is read by Danar's modules, but only
-- point_transactions is written by the scanner code. Danar never writes to the
-- ledger directly — he calls tambah_xp().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- quiz
-- -----------------------------------------------------------------------------
create table quiz_questions (
  id          serial primary key,
  teks        text not null,
  urutan      int not null default 0,
  aktif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table quiz_options (
  id           serial primary key,
  question_id  int not null references quiz_questions(id) on delete cascade,
  teks         text not null,
  -- Weight spread across several fields of study, e.g.
  --   {"Teknik & Rekayasa": 3, "Sains": 1}
  bobot        jsonb not null default '{}'::jsonb,
  urutan       int not null default 0
);

create index quiz_options_question_idx on quiz_options (question_id);

comment on column quiz_options.bobot is
  'Never sent to the browser. Leaking the weights lets participants reverse
   engineer which answers produce which result.';

create table quiz_attempts (
  id                bigserial primary key,
  participant_id    uuid not null references participants(id) on delete cascade,
  nomor_percobaan   int  not null check (nomor_percobaan between 1 and 3),

  jawaban           jsonb not null default '[]'::jsonb,
  skor              jsonb not null default '{}'::jsonb,
  hasil_rumpun      text,
  hasil_jurusan     jsonb not null default '[]'::jsonb,
  hasil_kampus      jsonb not null default '[]'::jsonb,

  selesai_at        timestamptz,
  created_at        timestamptz not null default now(),

  constraint quiz_attempts_sekali_per_nomor unique (participant_id, nomor_percobaan)
);

create index quiz_attempts_participant_idx on quiz_attempts (participant_id);

-- Deferred foreign key from 0002
alter table participants
  add constraint participants_selected_attempt_fk
    foreign key (selected_attempt_id) references quiz_attempts(id) on delete set null;

-- -----------------------------------------------------------------------------
-- activities
-- -----------------------------------------------------------------------------
create table activities (
  id           serial primary key,
  kode         text not null unique,
  nama         text not null,
  xp_default   int  not null default 0 check (xp_default >= 0),
  -- Separates fixed XP (attendance) from adjustable XP (booth engagement).
  bisa_diubah  boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger activities_set_updated_at
  before update on activities
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- point_transactions — the XP ledger
--
-- Append-only. Corrections are new rows with negative XP, never edits or
-- deletes. With prizes on the line, the history has to be defensible.
-- -----------------------------------------------------------------------------
create table point_transactions (
  id               bigserial primary key,
  participant_id   uuid not null references participants(id) on delete cascade,
  activity_id      int  not null references activities(id),

  xp               int  not null,   -- may be negative (reversal)
  sumber_tipe      text not null
                     check (sumber_tipe in ('ATTENDANCE','BOOTH_VISIT','QUIZ','MISSION','KOREKSI')),
  sumber_id        bigint,

  diberikan_oleh   uuid references users(id),
  dibatalkan       boolean not null default false,
  catatan          text,

  created_at       timestamptz not null default now()
);

-- Carries the leaderboard. Also the tiebreaker: who reached a score first.
create index point_transactions_participant_idx
  on point_transactions (participant_id, created_at);
create index point_transactions_sumber_idx on point_transactions (sumber_tipe, sumber_id);
create index point_transactions_aktif_idx  on point_transactions (participant_id)
  where dibatalkan = false;

-- -----------------------------------------------------------------------------
-- levels
--
-- Levels are derived from total XP at display time, never stored on the
-- participant. Storing them lets XP and level drift apart — cancel a booth
-- visit and the level would silently stay too high.
-- -----------------------------------------------------------------------------
create table levels (
  id           serial primary key,
  nomor        int not null unique,
  nama         text not null,
  xp_minimum   int not null check (xp_minimum >= 0),
  ikon_url     text,
  created_at   timestamptz not null default now()
);

create index levels_xp_idx on levels (xp_minimum desc);

-- -----------------------------------------------------------------------------
-- achievements
-- -----------------------------------------------------------------------------
create table achievements (
  id          serial primary key,
  kode        text not null unique,
  nama        text not null,
  deskripsi   text,
  ikon_url    text,
  syarat      jsonb not null default '{}'::jsonb,
  aktif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table participant_achievements (
  participant_id  uuid not null references participants(id) on delete cascade,
  achievement_id  int  not null references achievements(id) on delete cascade,
  earned_at       timestamptz not null default now(),
  primary key (participant_id, achievement_id)
);

-- -----------------------------------------------------------------------------
-- missions
-- -----------------------------------------------------------------------------
create table missions (
  id          serial primary key,
  nama        text not null,
  deskripsi   text,
  tipe        text not null default 'MANUAL'
                check (tipe in ('MANUAL','OTOMATIS_KUIS')),
  target      jsonb not null default '{}'::jsonb,
  xp          int not null default 0 check (xp >= 0),
  event_id    int references events(id) on delete set null,
  aktif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create index missions_tipe_idx  on missions (tipe) where aktif = true;
create index missions_event_idx on missions (event_id);

create table participant_missions (
  participant_id  uuid not null references participants(id) on delete cascade,
  mission_id      int  not null references missions(id) on delete cascade,
  status          text not null default 'BELUM' check (status in ('BELUM','SELESAI')),
  progress        int  not null default 0,
  selesai_at      timestamptz,
  primary key (participant_id, mission_id)
);

create index participant_missions_status_idx
  on participant_missions (participant_id, status);

-- -----------------------------------------------------------------------------
-- cosmetics
--
-- Earned only. Never purchased, never sponsored. If they could be bought the
-- signal disappears — the whole point is that a cosmetic proves someone
-- actually walked the floor.
-- -----------------------------------------------------------------------------
create table cosmetics (
  id             serial primary key,
  tipe           text not null
                   check (tipe in ('BACKGROUND','WARNA_NAMA','LAGU','BINGKAI')),
  nama           text not null,
  aset_url       text,
  nilai          text,
  syarat_level   int references levels(nomor),
  syarat_top15   boolean not null default false,
  aktif          boolean not null default true,
  created_at     timestamptz not null default now()
);

create index cosmetics_tipe_idx on cosmetics (tipe) where aktif = true;

create table participant_cosmetics (
  participant_id  uuid not null references participants(id) on delete cascade,
  cosmetic_id     int  not null references cosmetics(id) on delete cascade,
  tipe            text not null,
  terbuka_at      timestamptz not null default now(),
  dipakai         boolean not null default false,
  primary key (participant_id, cosmetic_id)
);

-- One active cosmetic per type.
create unique index participant_cosmetics_satu_aktif_idx
  on participant_cosmetics (participant_id, tipe)
  where dipakai = true;

-- -----------------------------------------------------------------------------
-- leaderboard_freeze
--
-- Freezing matters because there are prizes. Left running, people scramble for
-- scans during the closing ceremony and the winner can change while the names
-- are being read out.
-- -----------------------------------------------------------------------------
create table leaderboard_freeze (
  id                serial primary key,
  dibekukan_at      timestamptz,
  dibekukan_oleh    uuid references users(id),
  disahkan_at       timestamptz,
  disahkan_oleh     uuid references users(id),
  jumlah_pemenang   int not null default 3 check (jumlah_pemenang > 0),
  catatan           text,
  snapshot          jsonb,
  created_at        timestamptz not null default now()
);
