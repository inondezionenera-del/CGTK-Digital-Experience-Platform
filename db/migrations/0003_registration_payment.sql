-- =============================================================================
-- 0003 — Form builder, registration and payment
--
-- Payment is handled entirely outside this system. The Administration division
-- collects money their own way — cash or online — and records it in their own
-- books. All this system stores is whether someone has been marked settled,
-- by whom, and when.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- form_fields
--
-- Administration adds registration questions without touching code. Answers
-- land in participants.extra_fields.
-- -----------------------------------------------------------------------------
create table form_fields (
  id                   serial primary key,
  kunci                text not null unique
                         check (kunci ~ '^[a-z][a-z0-9_]*$'),
  label                text not null,
  tipe                 text not null
                         check (tipe in ('TEKS','ANGKA','PILIHAN','PILIHAN_GANDA','TANGGAL','YA_TIDAK')),
  opsi                 jsonb,
  wajib                boolean not null default false,
  bisa_diedit_peserta  boolean not null default true,
  bantuan              text,
  urutan               int not null default 0,
  aktif                boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- A choice field with no choices is a dead end for the participant.
  constraint form_fields_opsi_required check (
    tipe not in ('PILIHAN','PILIHAN_GANDA')
    or (opsi is not null and jsonb_array_length(opsi) > 0)
  )
);

create index form_fields_aktif_idx on form_fields (aktif, urutan) where aktif = true;

create trigger form_fields_set_updated_at
  before update on form_fields
  for each row execute function set_updated_at();

comment on table form_fields is
  'Fields are deactivated, never deleted — deleting one orphans every answer
   already given and leaves a hole in the final report.';

-- -----------------------------------------------------------------------------
-- registrations
-- -----------------------------------------------------------------------------
create table registrations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references users(id) on delete cascade,

  -- The bridge to Administration's own bookkeeping. Participants quote this
  -- when they pay, by form or in person.
  kode_registrasi     text not null unique default generate_registration_code(),

  -- Payment instructions stay locked until every required field is answered.
  -- Administration asked for this: they did not want people paying with
  -- half-finished records.
  profil_lengkap      boolean not null default false,
  profil_lengkap_at   timestamptz,

  status              text not null default 'PROFIL_BELUM_LENGKAP'
                        check (status in (
                          'PROFIL_BELUM_LENGKAP',
                          'MENUNGGU_PEMBAYARAN',
                          'LUNAS',
                          'DIBATALKAN'
                        )),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index registrations_kode_idx   on registrations (kode_registrasi);
create index registrations_status_idx on registrations (status);
create index registrations_belum_lunas_idx on registrations (created_at)
  where status = 'MENUNGGU_PEMBAYARAN';

create trigger registrations_set_updated_at
  before update on registrations
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- payments
--
-- A log of who pressed the button, not a ledger of money. There is deliberately
-- no amount column: Administration compiles the financial report by hand from
-- their own records.
-- -----------------------------------------------------------------------------
create table payments (
  id                 uuid primary key default gen_random_uuid(),
  registration_id    uuid not null references registrations(id) on delete cascade,

  ditandai_oleh      uuid not null references users(id),
  ditandai_at        timestamptz not null default now(),
  catatan            text,

  dibatalkan         boolean not null default false,
  dibatalkan_oleh    uuid references users(id),
  dibatalkan_at      timestamptz,
  alasan_pembatalan  text,

  created_at         timestamptz not null default now()
);

create index payments_registration_idx on payments (registration_id);
create index payments_aktif_idx on payments (registration_id)
  where dibatalkan = false;

-- At most one live settlement per registration.
create unique index payments_satu_aktif_idx on payments (registration_id)
  where dibatalkan = false;

-- Reversing a settlement revokes the participant's QR, so it must never happen
-- silently.
alter table payments add constraint payments_alasan_wajib check (
  dibatalkan = false or (alasan_pembatalan is not null and length(trim(alasan_pembatalan)) > 0)
);
