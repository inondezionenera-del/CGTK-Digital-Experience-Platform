-- =============================================================================
-- 0011 — Row Level Security
-- =============================================================================
--
-- The architecture here is "no browser ever talks to Postgres". Every request
-- goes through the Worker, which holds the service role key and does its own
-- permission checks against `role_permissions`.
--
-- That makes RLS a second wall rather than the first one — and it is worth
-- building, because the first wall has a known way of failing: the anon key is
-- public by design. It ships inside the frontend bundle, and PostgREST answers
-- on the project URL whether we use it or not. Anyone who opens devtools has
-- both halves. Without RLS, that is a full read of every participant's
-- registration data, and these are minors.
--
-- So: deny everything to `anon` and `authenticated`, with a short list of
-- genuinely public, non-personal tables opened for read only.
--
-- The service role bypasses RLS entirely. Nothing below affects the Worker.
--
-- Run this AFTER 0002–0007, which create the tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RLS on, everywhere.
--
-- A table with RLS enabled and no policy denies every row to every non-service
-- role. That is the desired state for all but a handful of tables, and it is
-- the state a new table inherits automatically when someone adds one and
-- forgets this file — which is the point of doing it in a loop.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename <> '_migrations'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Take away the default grants.
--
-- Supabase grants the anon and authenticated roles table privileges out of the
-- box. RLS alone would already block the rows, but revoking the privilege means
-- a mistake in a policy later cannot re-open a table by accident.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on functions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. The public reading room.
--
-- These tables are already visible to anyone who opens the landing page while
-- logged out, so there is nothing to protect. Opening them directly means a
-- cached page can still render if the Worker is briefly unavailable.
--
-- Read only. Every write still goes through the Worker.
--
-- Deliberately NOT on this list:
--   sessions        — carries the ACTIVE/CLOSED switch; readable, but writable
--                     is a way to open a session early. Read goes through the
--                     Worker so the switch has exactly one reader.
--   settings        — holds `link_pembayaran` and `prefill_entry_id`. The whole
--                     point of /payments/buka is that the link is never
--                     serialized to a participant. A public read of this table
--                     would hand it over.
--   materials       — DI_BOOTH rows are gated on having reached the booth.
--   quiz_options    — carries `bobot`, the answer key.
-- -----------------------------------------------------------------------------
create policy publik_baca on public.universities
  for select to anon, authenticated using (aktif = true);

create policy publik_baca on public.majors
  for select to anon, authenticated using (aktif = true);

create policy publik_baca on public.university_majors
  for select to anon, authenticated using (true);

create policy publik_baca on public.sponsors
  for select to anon, authenticated using (aktif = true);

create policy publik_baca on public.pages
  for select to anon, authenticated using (aktif = true);

create policy publik_baca on public.levels
  for select to anon, authenticated using (true);

create policy publik_baca on public.achievements
  for select to anon, authenticated using (aktif = true);

grant select on
  public.universities,
  public.majors,
  public.university_majors,
  public.sponsors,
  public.pages,
  public.levels,
  public.achievements
to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Functions.
--
-- Every function in 0008/0009 writes across several tables and is called by the
-- Worker with the service role. None of them should be reachable over PostgREST
-- with the anon key, so the revoke above stands — no grants here.
--
-- `search_path` is pinned on each one so that a schema placed earlier on the
-- path cannot shadow a table name inside a SECURITY DEFINER body.
-- -----------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Storage.
--
-- Buckets are created from the dashboard, not from SQL, so this is a note
-- rather than a statement: the `materi` bucket must be created PRIVATE and read
-- through signed URLs issued by the Worker. A public bucket would make every
-- DI_BOOTH file readable by anyone who guesses the path, which undoes the booth
-- gate entirely.
-- -----------------------------------------------------------------------------
