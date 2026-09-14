-- =============================================================================
-- 0001 — Extensions and shared helpers
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid(), digest()
create extension if not exists "pg_trgm";    -- fast ILIKE search on names

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Human-friendly random codes.
--
-- Deliberately excludes 0 O 1 I L — these are read aloud and typed by hand at
-- the registration desk, and those five characters are where mistakes happen.
-- -----------------------------------------------------------------------------
create or replace function generate_code(len int default 6)
returns text
language plpgsql
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text := '';
  i int;
begin
  for i in 1..len loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- Registration code: the only bridge between this system and whatever the
-- Administration division uses to collect money. Must be unguessable — a
-- sequential code would let anyone claim someone else's payment.
create or replace function generate_registration_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'CGTK-' || generate_code(6);
    exit when not exists (select 1 from registrations where kode_registrasi = candidate);
  end loop;
  return candidate;
end;
$$;

-- Opaque random token, used for QR identities and booth posters.
create or replace function generate_token(bytes int default 24)
returns text
language sql
as $$
  select encode(gen_random_bytes(bytes), 'hex');
$$;
