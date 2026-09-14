-- =============================================================================
-- 0007 — Content and system tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- announcements
--
-- Delivered by polling, not Realtime. The free tier caps Realtime at 200
-- concurrent connections and the expected peak is 250–300; connection 201 would
-- silently receive nothing, with no error to notice.
-- -----------------------------------------------------------------------------
create table announcements (
  id               serial primary key,
  judul            text not null,
  isi              text not null,
  tingkat          text not null default 'BIASA' check (tingkat in ('BIASA','DARURAT')),
  aktif            boolean not null default true,
  dibuat_oleh      uuid not null references users(id),
  berlaku_sampai   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Serves the 30-second poll.
create index announcements_poll_idx on announcements (created_at desc)
  where aktif = true;
create index announcements_tingkat_idx on announcements (tingkat);

create trigger announcements_set_updated_at
  before update on announcements
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- sponsors
--
-- Tier decides logo size and row; urutan orders within a tier. Plain integer
-- rather than drag-and-drop: reordering twenty logos is not worth the frontend
-- work that a touch-friendly drag handle costs.
-- -----------------------------------------------------------------------------
create table sponsors (
  id           serial primary key,
  nama         text not null,
  logo_url     text not null,
  tier         text not null
                 check (tier in ('PLATINUM','GOLD','SILVER','MEDIA_PARTNER')),
  url          text,
  urutan       int not null default 0,
  -- ["landing","footer","dashboard","leaderboard","kosmetik"]
  penempatan   jsonb not null default '["landing"]'::jsonb,
  aktif        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index sponsors_tier_idx       on sponsors (tier, urutan) where aktif = true;
create index sponsors_penempatan_idx on sponsors using gin (penempatan);

create trigger sponsors_set_updated_at
  before update on sponsors
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- pages  (FAQ / About / Terms)
-- -----------------------------------------------------------------------------
create table pages (
  id           serial primary key,
  slug         text not null unique check (slug ~ '^[a-z0-9-]+$'),
  judul        text not null,
  isi          text not null default '',
  aktif        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger pages_set_updated_at
  before update on pages
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- settings
--
-- The table that lets the project be handed over. Every number that might
-- change lives here, so each division edits their own without a developer.
-- -----------------------------------------------------------------------------
create table settings (
  kunci        text primary key,
  nilai        text,
  tipe         text not null default 'TEKS'
                 check (tipe in ('TEKS','ANGKA','BOOLEAN','JSON')),
  kelompok     text not null default 'sistem',
  deskripsi    text,
  publik       boolean not null default false,
  diubah_oleh  uuid references users(id),
  diubah_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index settings_kelompok_idx on settings (kelompok);
create index settings_publik_idx   on settings (publik) where publik = true;

comment on column settings.publik is
  'Whether the value may be served to unauthenticated callers. The payment form
   URL is NOT public — it is only ever reached through a server-side redirect.';

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
create table audit_logs (
  id          bigserial primary key,
  user_id     uuid references users(id) on delete set null,
  aksi        text not null,
  tabel       text,
  record_id   text,
  sebelum     jsonb,
  sesudah     jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);

create index audit_logs_user_idx   on audit_logs (user_id);
create index audit_logs_aksi_idx   on audit_logs (aksi);
create index audit_logs_waktu_idx  on audit_logs (created_at desc);
create index audit_logs_record_idx on audit_logs (tabel, record_id);

comment on table audit_logs is
  'Not surveillance — protection. Once prizes are involved, "he cheated" needs
   an answer backed by data rather than memory.';

-- -----------------------------------------------------------------------------
-- sync_conflicts
--
-- Two phones that are both offline cannot know about each other. When the
-- signal returns, the second scan of the same person is rejected by the unique
-- constraint — correct, but the field staff already saw a green tick. This
-- table is how they find out afterwards.
-- -----------------------------------------------------------------------------
create table sync_conflicts (
  id              bigserial primary key,
  scan_uuid       uuid not null,
  tipe            text not null check (tipe in ('ATTENDANCE','BOOTH_VISIT')),
  alasan          text not null,
  payload         jsonb,
  dilaporkan_oleh uuid references users(id),
  created_at      timestamptz not null default now()
);

create index sync_conflicts_waktu_idx on sync_conflicts (created_at desc);
create index sync_conflicts_scan_idx  on sync_conflicts (scan_uuid);
