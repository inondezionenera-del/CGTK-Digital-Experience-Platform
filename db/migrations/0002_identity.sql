-- =============================================================================
-- 0002 — Identity, roles and permissions
--
-- One account table for everyone: participants, committee, alumni, admins.
-- This is what makes the "single login portal" work.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- roles
-- -----------------------------------------------------------------------------
create table roles (
  id          serial primary key,
  kode        text not null unique,
  nama        text not null,
  urutan      int  not null default 0,
  created_at  timestamptz not null default now()
);

comment on table roles is 'Seven roles. A person holds exactly one — no dual roles.';

-- -----------------------------------------------------------------------------
-- permissions
--
-- Permission-based rather than role-based on purpose. The Events division may
-- set XP but must not touch payments; Administration may mark payments but must
-- not move the schedule. A single "admin" role cannot express that.
-- -----------------------------------------------------------------------------
create table permissions (
  id          serial primary key,
  kode        text not null unique,
  nama        text not null,
  kelompok    text not null default 'umum',
  created_at  timestamptz not null default now()
);

create table role_permissions (
  role_id        int not null references roles(id) on delete cascade,
  permission_id  int not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
create table users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  google_id       text unique,
  nama            text not null,
  foto_url        text,
  role_id         int  not null references roles(id),
  status          text not null default 'AKTIF'
                    check (status in ('AKTIF', 'NONAKTIF')),
  terakhir_login  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index users_email_idx   on users (lower(email));
create index users_role_id_idx on users (role_id);
create index users_status_idx  on users (status) where status = 'AKTIF';

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

comment on column users.id is
  'UUID, not a serial. Personal data must not sit behind guessable URLs.';

-- -----------------------------------------------------------------------------
-- participants
-- -----------------------------------------------------------------------------
create table participants (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique references users(id) on delete cascade,

  asal_sekolah         text not null,
  kelas                text not null,
  target_jurusan       text,
  kampus_impian        text,

  -- Answers to admin-defined questions. JSONB because Administration can add
  -- questions that did not exist when this table was created.
  extra_fields         jsonb not null default '{}'::jsonb,

  -- QR identity. Issued only once payment is marked settled.
  qr_token             text unique,
  qr_terbit_at         timestamptz,

  selected_attempt_id  bigint,   -- FK added in 0007, after quiz_attempts exists

  -- Explicit consent before alumni may see this participant's interests.
  -- These are high-school students; consent is asked for, never assumed.
  izin_bagi_data       boolean not null default false,

  jumlah_edit_profil   int not null default 0,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- The single most performance-critical index in the system: every gate scan
-- looks a participant up by this column.
create unique index participants_qr_token_idx on participants (qr_token)
  where qr_token is not null;

create index participants_sekolah_idx on participants using gin (asal_sekolah gin_trgm_ops);
create index participants_extra_idx   on participants using gin (extra_fields);
create index participants_izin_idx    on participants (izin_bagi_data)
  where izin_bagi_data = true;

create trigger participants_set_updated_at
  before update on participants
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- representatives  (alumni staffing booths)
--
-- Stores BOTH campus and major: the same alumnus mans the campus booth during
-- Event 2 and the major booth during Event 3. Holding both lets the system
-- place them automatically instead of asking them to pick.
-- -----------------------------------------------------------------------------
create table representatives (
  id               serial primary key,
  user_id          uuid unique references users(id) on delete cascade,
  email_undangan   text not null unique,
  university_id    int,   -- FK added in 0006
  major_id         int,   -- FK added in 0006
  angkatan         int,
  bio              text,
  foto_url         text,
  kontak           text,
  status           text not null default 'DIUNDANG'
                     check (status in ('DIUNDANG', 'AKTIF', 'NONAKTIF')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index representatives_email_idx on representatives (lower(email_undangan));
create index representatives_user_idx  on representatives (user_id);

create trigger representatives_set_updated_at
  before update on representatives
  for each row execute function set_updated_at();

comment on column representatives.user_id is
  'Null until the alumnus first signs in. The invitation is matched by email.';

-- -----------------------------------------------------------------------------
-- lo_assignments  (Education division liaison officers)
--
-- LO is attached to the alumnus, not the booth: one alumnus works two different
-- booths across the two expo events, so booth-level assignment would have to be
-- entered twice for the same person.
-- -----------------------------------------------------------------------------
create table lo_assignments (
  id                 serial primary key,
  lo_user_id         uuid not null references users(id) on delete cascade,
  representative_id  int  not null references representatives(id) on delete cascade,
  catatan            text,
  created_at         timestamptz not null default now(),
  unique (lo_user_id, representative_id)
);

create index lo_assignments_lo_idx   on lo_assignments (lo_user_id);
create index lo_assignments_rep_idx  on lo_assignments (representative_id);
