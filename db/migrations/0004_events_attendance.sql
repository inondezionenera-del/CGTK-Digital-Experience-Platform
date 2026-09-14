-- =============================================================================
-- 0004 — Events, sessions and attendance
--
-- Nothing about the agenda is fixed in code. The Events division decides how
-- many days, how many events, and what kind each one is.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- events
-- -----------------------------------------------------------------------------
create table events (
  id          serial primary key,
  nama        text not null,
  tipe        text not null
                check (tipe in ('PEMBUKAAN','EXPO_KAMPUS','EXPO_JURUSAN','PENUTUPAN','LAINNYA')),
  tanggal     date,
  deskripsi   text,
  urutan      int not null default 0,
  aktif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index events_tipe_idx    on events (tipe);
create index events_tanggal_idx on events (tanggal);

create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();

comment on column events.tipe is
  'Determines the shape of the booths underneath. EXPO_KAMPUS gives one booth
   per campus; EXPO_JURUSAN gives one booth per major, shared by alumni from
   several campuses.';

-- -----------------------------------------------------------------------------
-- sessions
-- -----------------------------------------------------------------------------
create table sessions (
  id              serial primary key,
  event_id        int not null references events(id) on delete cascade,
  nama            text not null,
  lokasi          text,

  -- Display only. These never decide whether a scan is allowed.
  jam_mulai       timestamptz,
  jam_selesai     timestamptz,

  status          text not null default 'DRAFT'
                    check (status in ('DRAFT','ACTIVE','CLOSED')),
  xp              int not null default 0 check (xp >= 0),
  wajib_presensi  boolean not null default true,
  urutan          int not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index sessions_event_idx  on sessions (event_id);
create index sessions_status_idx on sessions (status);
create index sessions_active_idx on sessions (id) where status = 'ACTIVE';

create trigger sessions_set_updated_at
  before update on sessions
  for each row execute function set_updated_at();

comment on column sessions.status is
  'The only thing that gates scanning. Clock time is never consulted — a
   twenty-minute delay is normal at this kind of event, and a time-based gate
   would shut the scanners down while the queue is still moving.';

-- -----------------------------------------------------------------------------
-- attendances
-- -----------------------------------------------------------------------------
create table attendances (
  id             bigserial primary key,

  -- References users, not participants: if alumni attendance is ever switched
  -- on, this table does not have to be rebuilt.
  user_id        uuid not null references users(id) on delete cascade,
  session_id     int  not null references sessions(id) on delete cascade,

  -- Generated on the scanning phone. Makes the offline queue safe to resend.
  scan_uuid      uuid not null unique,

  waktu_scan     timestamptz not null,   -- clock on the scanning phone
  waktu_terima   timestamptz not null default now(),  -- clock on the server
  scanned_by     uuid not null references users(id),
  sumber         text not null default 'ONLINE'
                   check (sumber in ('ONLINE','OFFLINE_SYNC','MANUAL')),
  alasan_manual  text,

  created_at     timestamptz not null default now(),

  -- No double check-in for the same session. Enforced here rather than in
  -- application code: two phones submitting in the same second would both pass
  -- an application-level check.
  constraint attendances_sekali_per_sesi unique (user_id, session_id),

  constraint attendances_alasan_manual check (
    sumber <> 'MANUAL' or (alasan_manual is not null and length(trim(alasan_manual)) > 0)
  )
);

create index attendances_session_idx on attendances (session_id);
create index attendances_user_idx    on attendances (user_id);
create index attendances_waktu_idx   on attendances (waktu_terima);

comment on column attendances.waktu_scan is
  'Phone clock at scan time. When a device has been offline this diverges from
   waktu_terima, and that gap is exactly what you want when tracing problems.';
