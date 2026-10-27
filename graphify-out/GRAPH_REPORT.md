# Graph Report - C:\Users\Lenovo\CGTK-Digital-Experience-Platform  (2026-10-05)

## Corpus Check
- Corpus is ~45,130 words - fits in a single context window. You may not need a graph.

## Summary
- 310 nodes · 647 edges · 16 communities (14 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14

## God Nodes (most connected - your core abstractions)
1. `db()` - 26 edges
2. `Env` - 22 edges
3. `AppError` - 22 edges
4. `Variables` - 19 edges
5. `compilerOptions` - 19 edges
6. `wajibLogin()` - 15 edges
7. `ok()` - 13 edges
8. `rpc()` - 11 edges
9. `butuhIzin()` - 11 edges
10. `scripts` - 10 edges

## Surprising Connections (you probably didn't know these)
- `simpan()` --calls--> `db()`  [EXTRACTED]
  src/lib/settings.ts → src/lib/db.ts
- `muat()` --calls--> `db()`  [EXTRACTED]
  src/lib/settings.ts → src/lib/db.ts
- `muatPengguna()` --calls--> `db()`  [EXTRACTED]
  src/middleware/auth.ts → src/lib/db.ts
- `boothSaya()` --calls--> `db()`  [EXTRACTED]
  src/modules/alumni.ts → src/lib/db.ts
- `repSaya()` --calls--> `db()`  [EXTRACTED]
  src/modules/alumni.ts → src/lib/db.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Check-In Scan Transaction: scan, XP, audit in one function** — readme_qr_identity, readme_transactional_db_functions, readme_xp_ledger_append_only, readme_audit_log_catat_audit, readme_session_status_switch [EXTRACTED 1.00]
- **Free-Tier Cost Constraint Driving the Stack** — readme_zero_cost_budget_constraint, readme_cloudflare_workers, readme_supabase_postgresql, readme_postgrest_over_http, readme_polling_not_realtime, readme_no_automatic_backups [EXTRACTED 1.00]
- **Offline Resilience Pattern for Field Scanners** — readme_offline_sync_idempotency, readme_qr_identity, readme_local_jwt_verification, readme_load_test_offline_flush_scenario, readme_error_code_catalog [INFERRED 0.85]

## Communities (16 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (45): Env, Variables, db(), rpc(), AppError, KodeError, bacaPaginasi(), dibuat() (+37 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (46): Anti-Farming Keyed on (participant_id, booth_id), API Contract (frontend-facing), Audit Logging via catat_audit, Booth Poster Check-In Grants No XP, Two Booth Types in One Table (KAMPUS / JURUSAN), CGTK Digital Experience Platform Backend API, Cloudflare Workers Runtime, Nothing a Division Might Change Lives in Code (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (37): @cloudflare/workers-types, hono, dependencies, hono, @supabase/supabase-js, zod, description, devDependencies (+29 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (30): @cloudflare/workers-types, dist, ES2022, node, node_modules, src/*, src/**/*.ts, tests/**/*.ts (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.11
Nodes (21): BAHAN, bawa(), belumSiap, bukaDashboard(), bukaLeaderboard(), exportLPJ(), gagalScan, kepala() (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (16): api, root, ERRORS, tangkapError(), tidakDitemukan(), app, app, app (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (17): pastikanSukses(), bacaQr(), bacaQrBooth(), enc, hashToken(), HasilQr, keHex(), kunciHmac() (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.26
Nodes (11): AKAR, args, b64url(), BERSIHKAN, EMAIL(), HERE, JUMLAH, siapkan() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.26
Nodes (9): Pengguna, bidang(), satu(), dariBase64Url(), enc, Klaim, loginOpsional(), muatPengguna() (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.36
Nodes (8): angka(), Baris, boolean_(), modeHemat(), muat(), semuaPublik(), simpan(), teks()

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (7): args, DIR, HERE, main(), RESET, SEED_ONLY, sql

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): AKAR, bersih, HERE, isi, sql

### Community 13 - "Community 13"
Cohesion: 0.50
Nodes (3): berkas, DIR, semua

## Ambiguous Edges - Review These
- `Unified Response Envelope (sukses/data/error)` → `Minor-Participant Privacy Rules`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **113 isolated node(s):** `TOKEN`, `PERAN`, `BAHAN`, `waktuScan`, `gagalScan` (+108 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Unified Response Envelope (sukses/data/error)` and `Minor-Participant Privacy Rules`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `db()` connect `Community 0` to `Community 8`, `Community 9`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `AppError` connect `Community 0` to `Community 8`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `TOKEN`, `PERAN`, `BAHAN` to the rest of the system?**
  _113 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.10854816824966079 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05507246376811594 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._