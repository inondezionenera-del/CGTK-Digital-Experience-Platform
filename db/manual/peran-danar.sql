-- =============================================================================
-- Database user for Danar's Python service
--
-- NOT a migration. It lives in db/manual/ because it uses psql variables for the
-- password, which the migration runner cannot interpolate — and because creating
-- a login role is a deliberate act, not something that should ride along with
-- `npm run db:push`.
-- =============================================================================
--
-- Danar's modules run as a separate service in Python. He needs database access,
-- and the easy answer — hand over the service role key — is the wrong one for
-- two reasons:
--
--   1. That key bypasses row level security on every table in the project,
--      including registrations, which hold the personal data of five hundred
--      minors. His features need none of that.
--
--   2. The agreement that he reads the XP ledger but never writes to it is,
--      right now, only an agreement. Written here it becomes something the
--      database refuses, which means it survives a rushed commit at 1am the
--      week before the event.
--
-- So he gets a user of his own with exactly the reach his features need.
--
-- USAGE
--   Run it after migrations 0001–0011 are applied. Set the password from an
--   environment variable, never in this file:
--     psql "$DATABASE_URL" -v sandi="$SANDI_DANAR" -f db/manual/peran-danar.sql
--   Then give him the connection string on port 6543 (the pooler) — his service
--   holds long-lived TCP connections, unlike the Worker.
-- =============================================================================

\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cgtk_kuis') then
    execute format('create role cgtk_kuis login password %L', :'sandi');
  else
    execute format('alter role cgtk_kuis password %L', :'sandi');
  end if;
end $$;

-- Connect and see the schema. Nothing else is implied by this.
grant connect on database postgres to cgtk_kuis;
grant usage on schema public to cgtk_kuis;

-- -----------------------------------------------------------------------------
-- His own tables: full read and write.
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on
  quiz_questions,
  quiz_options,
  quiz_attempts,
  missions,
  participant_missions,
  achievements,
  participant_achievements,
  cosmetics,
  participant_cosmetics
to cgtk_kuis;

grant usage, select on all sequences in schema public to cgtk_kuis;

-- -----------------------------------------------------------------------------
-- The XP ledger: READ ONLY. This is the important line in the file.
--
-- Four things write XP — the gate scanner, the booth scanner, finishing the
-- quiz, and completing a mission. Three of those are mine. With one writer the
-- ledger has one definition of correct; with two it has none, and a disagreement
-- over somebody's total is unresolvable after the fact.
--
-- When Danar needs to award XP he calls tambah_xp(), granted below. That
-- function writes the row, applies the per-booth ceiling, and records the audit
-- entry — the same path my scanners take.
-- -----------------------------------------------------------------------------
grant select on point_transactions to cgtk_kuis;
grant select on activities, levels, leaderboard_freeze to cgtk_kuis;

-- Reference data his recommendation logic reads: the quiz produces a field of
-- study, and campuses are matched to it through university_majors.
grant select on universities, majors, university_majors, booths, booth_visits to cgtk_kuis;

-- Just enough of the participant to attach a quiz result to a person and read
-- the interests they entered. No email, no phone, and nothing from
-- registrations — payment status is not his business.
grant select (id, user_id, asal_sekolah, kelas, target_jurusan, kampus_impian, selected_attempt_id)
  on participants to cgtk_kuis;
grant update (selected_attempt_id) on participants to cgtk_kuis;

grant select (id, nama) on users to cgtk_kuis;

-- -----------------------------------------------------------------------------
-- Functions he may call.
--
-- tambah_xp has to run with more authority than its caller: Danar may award XP,
-- but only through this one door, which applies the per-booth ceiling and writes
-- the audit entry. SECURITY DEFINER is what makes that possible while his own
-- grant on the ledger stays read-only.
--
-- search_path is pinned (0011 does this for every function) so a schema placed
-- earlier on the path cannot shadow a table name inside the body — with DEFINER
-- that would run as the owner, which is the classic way this feature is abused.
-- -----------------------------------------------------------------------------
alter function tambah_xp(uuid, text, text, bigint, int, uuid, text) security definer;

grant execute on function tambah_xp(uuid, text, text, bigint, int, uuid, text) to cgtk_kuis;
grant execute on function total_xp(uuid) to cgtk_kuis;
grant execute on function level_peserta(int) to cgtk_kuis;
grant execute on function hitung_leaderboard(int) to cgtk_kuis;

-- Deliberately NOT granted, and each for a reason:
--
--   bekukan_leaderboard, sahkan_pemenang  — these decide who wins a prize.
--                                           Committee action, not code.
--   scan_presensi, scan_booth, checkin_booth — the event-day path stays in one
--                                           service.
--   tandai_lunas, batal_lunas             — money.
--   catat_audit                           — writing audit entries directly would
--                                           let the log be shaped by hand.
--
-- Anything not listed above is refused by default, including tables added later.
-- A new table is invisible to him until someone grants it here on purpose.
revoke all on schema public from cgtk_kuis;
grant usage on schema public to cgtk_kuis;

alter default privileges in schema public revoke all on tables from cgtk_kuis;

-- -----------------------------------------------------------------------------
-- Check what he can actually do:
--
--   set role cgtk_kuis;
--   select count(*) from point_transactions;                  -- works
--   insert into point_transactions (participant_id, xp) values (...);  -- refused
--   select * from registrations;                              -- refused
--   select email from users;                                  -- refused
--   reset role;
--
-- Worth running once before handing over the password. A permission you believe
-- you removed and did not is the kind of thing nobody finds until it matters.
-- -----------------------------------------------------------------------------
