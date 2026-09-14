# CGTK Digital Experience Platform — Backend API

Backend for **CGTK 2027**, a one-day campus and major expo for high-school
students. The platform handles registration, payment status, QR check-in at
session doors, booth visits with an XP ledger, alumni booth tooling, and the
reporting the committee needs afterwards.

Built to run at zero monthly cost on Cloudflare Workers and Supabase, for a
budget of **Rp 100,000 in total** — not per month. That constraint is the reason
behind most of the design decisions documented below, and it is worth knowing
before changing any of them.

**Scale it is built for:** ~500 registered participants, 250–300 concurrent at
peak, up to 60 booths. Verified against the free-tier limits at 1,000
participants with headroom.

---

## Contents

- [Architecture](#architecture)
- [Why this stack](#why-this-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database migrations](#database-migrations)
- [API overview](#api-overview)
- [Domain rules worth knowing](#domain-rules-worth-knowing)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Operational switches](#operational-switches)
- [Scope and ownership](#scope-and-ownership)
- [Contact](#contact)

---

## Architecture

```
   Participant / Alumni / Committee phone
                   │  HTTPS
                   ▼
   ┌─────────────────────────────────────┐
   │  Cloudflare Pages  (frontend, PWA)  │
   │  Cloudflare Workers (this repo)     │   same origin → no CORS in production
   └───────────────┬─────────────────────┘
                   │  HTTPS (PostgREST + RPC)
                   ▼
   ┌─────────────────────────────────────┐
   │  Supabase                           │
   │   • PostgreSQL  (data + functions)  │
   │   • Auth        (Google sign-in)    │
   │   • Storage     (materials)         │
   └─────────────────────────────────────┘
```

The Worker is the only thing that talks to the database. No browser ever holds
a database credential, and Row Level Security (`0011_rls.sql`) denies the public
anon key everything except a short list of genuinely public tables.

**Multi-table operations live in PostgreSQL functions**, not in TypeScript.
Over HTTP, "record the scan, add the XP, write the audit row" would be three
independent calls; a connection dropped between them would award XP for a
check-in that does not exist, or record attendance that never earned anything.
Inside a function it is one transaction. See `db/migrations/0008_functions.sql`.

---

## Why this stack

| Choice | Reason |
| --- | --- |
| **Cloudflare Workers** | No cold start. A platform that sleeps after 15 minutes idle wakes in ~50 seconds — survivable on a website, fatal with a queue of students at a gate. |
| **Hono** | Small, Web-standard, runs natively on Workers. No Node compatibility shims in the request path. |
| **Supabase (PostgreSQL)** | Free tier covers the load with room to spare, and bundles Google sign-in and file storage that would otherwise each be a week of work. JSONB carries the admin-defined registration form. |
| **`@supabase/supabase-js` over HTTP** | Workers have no long-lived TCP sockets. PostgREST over HTTPS means no connection pool to exhaust when 300 phones sync at once. |
| **Polling, not Realtime** | The free tier caps Realtime at 200 concurrent connections against an expected peak of 250–300. Connection 201 fails **silently** — announcements would simply not arrive, with nothing in any log to explain it. Announcements are polled every 30s and answer `204` when there is nothing new. |
| **Zod** | Every request body is validated at the edge of the module, so nothing unvalidated reaches a SQL function. |

Alternatives that were rejected: Render (free tier sleeps), Railway (Hobby is
$5 in usage credit, not a price; Postgres pushes it to $10–18/month — over the
whole project budget), MySQL (weaker JSONB, and none of the bundled auth or
storage).

---

## Project structure

```
src/
  index.ts              Worker entry point
  app.ts                Router mounting, CORS, logging, health check
  env.ts                Runtime bindings and the authenticated-user shape
  lib/
    db.ts               Cached Supabase client + rpc() helper
    errors.ts           ~45 error codes, messages written for field staff
    respond.ts          One response envelope for every endpoint
    qr.ts               QR identity: build, verify, hash
    settings.ts         Runtime settings with a 30s cache
  middleware/
    auth.ts             Local HS256 JWT verification (WebCrypto)
    rbac.ts             Permission and role guards
    ratelimit.ts        KV fixed-window limiter
    error.ts            Central error handler; never leaks internals
  modules/              One file per domain area — see the API table below

db/migrations/          0001–0011, applied in filename order
scripts/migrate.mjs     Migration runner
tests/                  Vitest
```

Every module file opens with a comment explaining *why* it works the way it
does, not what the code says. Those comments are the design record; please keep
them current when changing behaviour.

---

## Getting started

**Prerequisites:** Node.js 20+, a Supabase project, a Cloudflare account.

```bash
git clone https://github.com/inondezionenera-del/CGTK-Digital-Experience-Platform.git
cd CGTK-Digital-Experience-Platform
npm install

cp .env.example .dev.vars     # then fill it in — see the next section
npm run db:push               # apply migrations 0001–0011
npm run dev                   # http://localhost:8787
```

Verify:

```bash
curl http://localhost:8787/health
# {"status":"ok","database":"ok","ms":142,"waktu":"..."}
```

`/health` deliberately touches the database. A health check that only proves
the Worker is running would report green while every check-in fails.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local Worker on :8787 |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm test` | Vitest |
| `npm run db:push` | Apply pending migrations |
| `npm run db:reset` | Drop and rebuild (development only) |
| `npm run deploy` | `wrangler deploy` |

---

## Environment variables

Local development reads `.dev.vars`; production uses `wrangler secret put`.
**Neither file is ever committed** — `.gitignore` covers both.

| Variable | Secret | Notes |
| --- | :---: | --- |
| `SUPABASE_URL` | no | Project URL |
| `SUPABASE_ANON_KEY` | no | Public key; safe in a browser bundle |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Bypasses RLS. Server-side only. If this ever reaches a commit or a browser, **rotate it** — deleting the commit is not enough |
| `SUPABASE_JWT_SECRET` | **yes** | HS256 secret used to verify access tokens locally |
| `QR_SIGNING_SECRET` | **yes** | HMAC key for QR identities. Rotating it invalidates every issued badge |
| `DATABASE_URL` | **yes** | Migrations only, port **5432** (direct). Never the pooler port 6543 — the runner refuses it |
| `ALLOWED_ORIGINS` | no | Comma-separated. Unset in production means same-origin only |
| `ENVIRONMENT` | no | `development` or `production` |

---

## Database migrations

39 tables across eleven files, applied in filename order and recorded in
`_migrations`. Each file runs in its own transaction, so a failure leaves the
database at the last complete migration rather than half-applied.

| File | Contents |
| --- | --- |
| `0001_extensions.sql` | `pgcrypto`, `pg_trgm`, code/token generators |
| `0002_identity.sql` | Roles, permissions, users, participants, representatives, LO assignments |
| `0003_registration_payment.sql` | Admin-defined form fields, registrations, payments |
| `0004_events_attendance.sql` | Events, sessions, attendances |
| `0005_campus_booth.sql` | Universities, majors, booths, visits, check-ins, materials |
| `0006_quiz_gamification.sql` | Quiz, XP ledger, levels, achievements, missions, cosmetics |
| `0007_content_system.sql` | Announcements, sponsors, pages, settings, audit log, sync conflicts |
| `0008_functions.sql` | Transactional functions — scanning, XP, payment status, audit |
| `0009_leaderboard.sql` | Ranking with tie-breakers, freeze, winner confirmation, anomaly check |
| `0010_seed.sql` | 7 roles, 31 permissions, activities, levels, settings, static pages |
| `0011_rls.sql` | Row Level Security and privilege revocation |

Registration codes avoid `0 O 1 I L` — the code is read aloud across a desk and
typed on a phone, and those are the characters that go wrong.

---

## API overview

All responses share one envelope:

```jsonc
// success
{ "sukses": true, "data": { }, "meta": { } }

// failure
{ "sukses": false, "error": { "kode": "SESI_DITUTUP", "pesan": "Sesi belum dibuka atau sudah ditutup" } }
```

`pesan` is written in Indonesian for the person holding the phone and is
displayed verbatim by the frontend. `kode` is what code should branch on.

Authentication is a Supabase access token in `Authorization: Bearer <token>`,
verified locally with WebCrypto — a network round trip per scan would be the
slowest part of the check-in path.

| Prefix | Module | Covers |
| --- | --- | --- |
| `/auth` | `auth.ts` | Account sync on first sign-in, current user, permissions |
| `/registrations`, `/participants`, `/qr`, `/cek-status` | `registrations.ts` | Registration, profile, QR identity, public status lookup |
| `/payments` | `payments.ts` | Payment instructions, the gated redirect, marking settled |
| `/attendance` | `attendance.ts` | Session scanning, manual entry, offline sync, rejected scans |
| `/booths` | `booths.ts` | Alumni scanning, poster check-in, passport, booth administration |
| `/materials` | `materials.ts` | Public and booth-gated campus material |
| `/events` | `events.ts` | Events, sessions, the ACTIVE/CLOSED switch |
| `/universities`, `/majors`, `/representatives` | `master.ts` | Master data and alumni invitations |
| `/announcements`, `/sponsors`, `/pages` | `content.ts` | Announcements (with polling), sponsors, static pages |
| `/settings`, `/form_fields`, `/activities`, `/points`, `/audit`, `/exports` | `admin.ts` | Configuration, form builder, XP values, audit, LPJ export |
| `/lo` | `lo.ts` | Liaison officers — read-only |
| `/alumni` | `alumni.ts` | Alumni dashboard, statistics, certificate, post-event recap |

Administrative routes are nested under their own module — `/payments/admin/...`,
not `/admin/payments/...` — so one file owns one prefix and a permission mistake
cannot spread outside it.

> **Note for the frontend team:** the API Contract document uses the opposite
> order (`/admin/payments/...`). The implementation in this repository is
> authoritative; the document will be updated to match.

Rate limits (only active when a KV namespace is bound): 10/min on auth, 30/min
on scanning, 5/min on sync, 10/min on public status lookups, 120/min otherwise.

---

## Domain rules worth knowing

These are the decisions that are easy to undo by accident. `tests/skema.test.ts`
pins the ones that can be checked statically.

**Anti-farming is keyed on `(participant_id, booth_id)` — never `campus_id`.**
In Event 3 a single table is staffed by alumni from several universities at
once. Keyed on campus, a participant collects XP from each of them without
moving. Keyed on the booth, both event formats are covered by one rule.

**Two booth types in one table.** `booth_type` is `KAMPUS` (Event 2, one booth
per university) or `JURUSAN` (Event 3, one booth per major), with a CHECK
constraint requiring exactly one of `university_id` / `major_id`. Alumni are
placed into the right booth automatically from the active event — they never
choose.

**Booth check-in does not grant XP.** Participants scan a printed booth poster
to unlock `DI_BOOTH` material. If it awarded points, photographing the poster
would earn XP for someone who never attended. XP comes only from an alumnus
scanning the participant.

**Sessions are gated by a status switch, never by clock time.** A twenty-minute
delay is normal at a school event; a time-based gate would close the scanners
mid-queue.

**The XP ledger is append-only.** A reversal is a new negative row. Level is
computed from the ledger and never stored, so cancelling a visit corrects the
level automatically.

**Payment happens entirely outside the platform.** Administration collects cash
or transfers and keeps their own book. No amount is stored anywhere — only who
marked a registration settled, and when. A second set of figures here would
disagree with theirs eventually.

**Offline sync answers `200`, not `409`, to a duplicate.** A phone that already
delivered a scan and lost the response will retry. An error status makes it
retry forever; a success ends the loop. Genuine rejections are recorded in
`sync_conflicts` for the committee to review.

---

## Security

- The service role key never leaves the Worker. It bypasses RLS entirely.
- `link_pembayaran` and `prefill_entry_id` are never serialized into any
  participant-facing response. The payment form is reachable only through
  `GET /payments/buka`, a server-side 302 issued after the profile is verified
  complete, with the registration code pre-filled — which makes forwarding the
  link self-defeating, since a friend's payment would land under the sharer's
  code.
- **Participants are minors.** Alumni see only participants who ticked the
  consent box, and never a phone number. Liaison officers see aggregate counts
  only — never participant data.
- `quiz_options.bobot` (the answer key) is never sent to a client.
- Offline scanner data ships `token_hash`, never a raw QR token. A stolen staff
  phone must not carry anything that can mint a working badge.
- XP ceilings are re-checked server-side. A limit enforced only on the phone is
  not a limit.
- Form fields are deactivated, never deleted — deleting one orphans the answers
  already submitted under it.
- Reversing a payment is Super Admin only and requires a written reason; it
  revokes the QR identity.
- Every privileged mutation writes to `audit_logs` through `catat_audit`.

---

## Testing

```bash
npm test
```

Two suites, both running without a database:

- `tests/qr.test.ts` — signing and verification, tampered tokens, wrong secret,
  malformed input. A scanner receives whatever the camera decodes, including
  partial reads; nothing in this path may throw, because a crashed scanner stops
  the queue.
- `tests/skema.test.ts` — reads the migration SQL and asserts the decisions
  above are still in it.

Anything involving real data belongs in the load test described in the
infrastructure document (9 scenarios at 200 concurrent users), which should be
run no later than two weeks before the event. The scenario most worth attention
is #7: every phone flushing its offline queue at once when venue signal
returns.

---

## Deployment

```bash
npm run typecheck && npm test

wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SUPABASE_JWT_SECRET
wrangler secret put QR_SIGNING_SECRET

wrangler kv namespace create RATE_LIMIT   # then uncomment the binding in wrangler.toml
npm run deploy
```

Set `SUPABASE_URL` in `wrangler.toml` under `[env.production.vars]` before the
first production deploy.

The Supabase free tier has **no automatic backups**. A daily dump is required —
see the infrastructure document. Restoring from a backup that was never taken is
not a recovery plan.

---

## Operational switches

Everything below is changed from the admin dashboard, without a deployment:

| Setting | Effect |
| --- | --- |
| `mode_hemat` | Economy mode — slows the leaderboard and announcement polling, hides alumni statistics. Scanning, attendance and XP are never disabled |
| `registrasi_dibuka` | Opens or closes registration |
| `sponsor_slots_enabled` | Reveals the reserved sponsor slots (off by default; empty slots collapse rather than leaving a gap) |
| `xp_booth_max` | Server-side XP ceiling per booth |
| Session `status` | `DRAFT` / `ACTIVE` / `CLOSED` — the only thing that opens a scanner |
| Leaderboard freeze | Locks the ranking before the ceremony so the winners cannot change mid-announcement |

The rule behind all of these: **nothing that a division might want to change is
written into the code.** Ticket wording, XP values, schedules, FAQ text,
announcements, sponsors, form questions — all of it lives in the database.

---

## Scope and ownership

This repository is the **backend only**. The frontend (PWA on Cloudflare Pages),
the quiz engine, achievements, missions and the leaderboard UI are separate
work owned by other members of the Web subdivision. The leaderboard reads the
XP ledger and never writes to it — that boundary is what keeps two people out
of the same table.

Contributions are expected to keep: strict TypeScript with no `any` in request
paths, Zod validation on every body, a matching error code in `lib/errors.ts`
for anything a user can trigger, and an audit entry for anything privileged.

---

## Contact

**Rafly Pratama Hudzaifah Al Syahbani** — Web subdivision lead (PDD), backend

- WhatsApp: [+62 895-2353-4113](https://wa.me/6289523534113)
- Email: inondezionenera@gmail.com
- LinkedIn: [rafly-pratama-hudzaifah-al-syahbani](https://www.linkedin.com/in/rafly-pratama-hudzaifah-al-syahbani-41b48133a)

---

Built for CGTK 2027.
