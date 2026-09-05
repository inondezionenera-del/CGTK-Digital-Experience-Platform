# CGTK Digital Experience Platform

> **The digital hub for CGTK — connecting students with universities, majors, alumni, and their future academic journey.**

CGTK Digital Experience Platform adalah platform digital yang dikembangkan untuk mendukung pelaksanaan **Campus Goes To Kampoeng (CGTK)**, sebuah kegiatan tahunan yang diselenggarakan oleh alumni **SMAN 1 Pamekasan**.

Platform ini dirancang bukan hanya sebagai website informasi dan pendaftaran, tetapi sebagai **pusat digital seluruh pengalaman peserta selama CGTK**.

Mulai dari registrasi, eksplorasi minat, informasi kampus dan jurusan, digital identity, QR-based attendance, campus exploration, hingga gamifikasi dan evaluasi acara akan terintegrasi dalam satu platform.

---

## Table of Contents

* [About CGTK](#about-cgtk)
* [Project Vision](#project-vision)
* [Problem](#problem)
* [Solution](#solution)
* [Core Concept](#core-concept)
* [Main Features](#main-features)
* [Participant Journey](#participant-journey)
* [QR Digital Identity](#qr-digital-identity)
* [Campus Passport](#campus-passport)
* [Gamification System](#gamification-system)
* [Interest Exploration](#interest-exploration)
* [User Roles](#user-roles)
* [System Architecture](#system-architecture)
* [Backend Architecture](#backend-architecture)
* [Team & Responsibilities](#team--responsibilities)
* [Development Priorities](#development-priorities)
* [Development Workflow](#development-workflow)
* [Security & Privacy](#security--privacy)
* [Technology Stack](#technology-stack)
* [Project Structure](#project-structure)
* [Roadmap](#roadmap)
* [Contributing](#contributing)
* [Project Status](#project-status)
* [License](#license)

---

# About CGTK

**Campus Goes To Kampoeng (CGTK)** merupakan kegiatan yang diselenggarakan oleh alumni SMAN 1 Pamekasan yang bertujuan untuk membantu siswa mengenal dunia perguruan tinggi secara lebih dekat.

CGTK mempertemukan peserta dengan mahasiswa dan alumni dari berbagai perguruan tinggi sehingga peserta dapat memperoleh informasi mengenai:

* Kehidupan perkuliahan
* Perguruan tinggi
* Fakultas dan jurusan
* Jalur masuk perguruan tinggi
* Pengalaman mahasiswa
* Lingkungan akademik
* Perencanaan pendidikan setelah SMA

Platform ini dikembangkan untuk meningkatkan pengalaman tersebut melalui integrasi teknologi.

---

# Project Vision

## From Event Website to Digital Event Platform

Website CGTK tidak dirancang sebagai website acara biasa.

Website informasi konvensional biasanya hanya digunakan untuk:

```text
Landing Page
      ↓
Information
      ↓
Registration
      ↓
Done
```

CGTK Digital Experience Platform menggunakan pendekatan yang berbeda:

```text
Registration
      ↓
Account
      ↓
Interest Exploration
      ↓
Personal Dashboard
      ↓
Digital Identity
      ↓
QR Check-in
      ↓
Campus Exploration
      ↓
Interaction
      ↓
Campus Passport
      ↓
XP / Activities
      ↓
Achievements
      ↓
Leaderboard
      ↓
Feedback
```

Dengan demikian, website menjadi bagian dari pengalaman acara itu sendiri.

---

# Problem

Pelaksanaan event berskala besar memiliki beberapa masalah yang ingin diselesaikan oleh platform ini.

### 1. Registrasi dan data peserta

Data peserta dapat menjadi sulit dikelola jika proses registrasi dan administrasi dilakukan secara terpisah.

### 2. Absensi manual

Absensi manual dapat menyebabkan:

* antrean;
* kesalahan pencatatan;
* duplikasi;
* proses administrasi yang lambat;
* kesulitan melakukan rekap.

### 3. Informasi tersebar

Informasi mengenai kampus, jurusan, jadwal, dan kegiatan dapat tersebar di berbagai media.

### 4. Interaksi peserta sulit diukur

Sulit mengetahui:

* kampus apa yang paling banyak diminati;
* jurusan apa yang paling banyak dieksplorasi;
* sesi apa yang paling diminati;
* seberapa aktif peserta selama acara.

### 5. Peserta kurang memiliki alasan untuk terus menggunakan website

Website event biasa sering hanya dibuka ketika peserta ingin mendaftar atau mencari informasi.

Platform ini dirancang agar website tetap relevan sepanjang perjalanan peserta di CGTK.

---

# Solution

CGTK Digital Experience Platform mengintegrasikan berbagai kebutuhan acara dalam satu sistem.

## Four Core Pillars

### DISCOVER

Membantu peserta menemukan:

* Perguruan tinggi
* Fakultas
* Jurusan
* Bidang akademik
* Informasi kegiatan
* Rekomendasi eksplorasi berdasarkan minat

### CONNECT

Memfasilitasi:

* Interaksi dengan mahasiswa
* Interaksi dengan alumni
* Sharing session
* Konsultasi mengenai kampus dan jurusan

### PARTICIPATE

Mendigitalisasi:

* Registrasi
* Digital identity
* QR check-in
* Campus visit
* Session attendance
* Aktivitas peserta

### PROGRESS

Mendorong keterlibatan melalui:

* XP
* Level
* Missions
* Achievements
* Campus Passport
* Leaderboard

---

# Main Features

## 1. Participant Registration

Peserta dapat melakukan registrasi melalui platform.

Data yang dikumpulkan harus mengikuti prinsip **data minimization**, sehingga hanya informasi yang benar-benar diperlukan untuk penyelenggaraan CGTK yang dikumpulkan.

---

## 2. Authentication

Peserta memiliki akun yang digunakan untuk mengakses fitur personal.

Authentication menjadi dasar untuk:

* Participant dashboard
* Profile
* Digital identity
* QR code
* Activity history
* Campus Passport
* XP
* Achievements

---

## 3. Participant Profile

Setiap peserta memiliki profil CGTK.

Contoh informasi:

```text
Name
School
Grade
Interests
Dream University
Dream Major
XP
Level
Achievements
```

Informasi sensitif tidak boleh ditampilkan secara publik tanpa alasan dan izin yang sesuai.

---

# QR Digital Identity

Setiap peserta mendapatkan **CGTK Digital Identity** dalam bentuk QR Code.

QR bukan hanya digunakan untuk absensi, tetapi dapat menjadi identitas digital peserta selama event.

Contoh penggunaan:

```text
Participant QR
      │
      ├── Event Check-in
      ├── Campus Visit
      ├── Session Attendance
      ├── Activity Participation
      └── Meaningful Interaction
```

## Security Principle

QR tidak boleh menggunakan sequential participant ID secara langsung.

Contoh yang tidak dianjurkan:

```text
participant_id=123
```

Sebaliknya, sistem menggunakan credential/token yang tidak mudah ditebak.

Setiap proses scan harus melalui:

```text
QR Scan
   ↓
Authenticated Scanner
   ↓
Permission Validation
   ↓
QR Credential Validation
   ↓
Participant Resolution
   ↓
Activity Validation
   ↓
Duplicate Check
   ↓
Transaction
```

Sistem juga harus mempertimbangkan:

* QR screenshot sharing;
* replay;
* duplicate scan;
* unauthorized scanner;
* point farming;
* race condition.

---

# QR Scanner

Scanner digunakan oleh pihak yang memiliki izin, seperti:

* Staff
* Campus Representative
* Admin

Contoh hasil scan:

```text
✓ CHECK-IN SUCCESS

Participant:
[Display Name]

Activity:
Event Check-in

Reward:
+50 XP
```

Kemungkinan response:

```text
SUCCESS
ALREADY SCANNED
INVALID QR
UNAUTHORIZED
EVENT CLOSED
```

Scanner harus dirancang untuk penggunaan cepat selama event.

---

# Campus Passport

**Campus Passport** merupakan salah satu fitur inti platform.

Peserta dapat melihat perguruan tinggi yang telah mereka eksplorasi.

Contoh:

```text
MY CAMPUS PASSPORT

✓ Universitas Indonesia
✓ Institut Teknologi Bandung
✓ Institut Teknologi Sepuluh Nopember
□ Universitas Gadjah Mada
□ Universitas Airlangga
```

Campus visit dapat dicatat ketika participant QR berhasil dipindai oleh pihak yang berwenang.

Campus Passport bertujuan agar peserta tidak hanya hadir di event, tetapi benar-benar terdorong untuk mengeksplorasi berbagai pilihan perguruan tinggi.

---

# University & Major Directory

Platform menyediakan direktori:

* Universitas
* Fakultas
* Jurusan
* Bidang akademik
* Campus representatives
* Event/session terkait

Peserta dapat mengeksplorasi informasi sebelum maupun selama acara.

---

# Interest Exploration

Platform menyediakan **Interest Exploration Quiz**.

Fitur ini digunakan sebagai alat eksplorasi awal untuk membantu peserta menemukan bidang atau jurusan yang mungkin menarik bagi mereka.

Contoh hasil:

```text
Your Interest Profile

Technology      ████████
Science         ██████
Business        █████
Social Science  ████
Arts            ██
```

Sistem dapat memberikan rekomendasi eksplorasi seperti:

* Jurusan
* Perguruan tinggi
* Sharing session
* Campus booth

> Hasil quiz bukan diagnosis psikologis dan bukan rekomendasi akademik definitif.

---

# Personalized CGTK Journey

Hasil Interest Exploration dapat digunakan untuk membuat perjalanan peserta menjadi lebih personal.

Contoh:

```text
YOUR CGTK JOURNEY

Based on your interests:

✓ Complete Registration
✓ Complete Interest Quiz
□ Explore 3 Universities
□ Explore Computer Science
□ Attend Technology Session
□ Talk with a Campus Representative
□ Complete Feedback
```

Dengan demikian, quiz tidak berhenti sebagai hasil angka atau kategori, tetapi dapat terhubung dengan pengalaman peserta selama CGTK.

---

# Gamification System

Gamifikasi digunakan untuk meningkatkan engagement, bukan menggantikan tujuan utama CGTK.

## XP

Peserta dapat memperoleh XP dari aktivitas tertentu.

Contoh:

| Activity                 |  XP |
| ------------------------ | --: |
| Event Check-in           | +50 |
| Campus Visit             | +15 |
| Meaningful Interaction   | +10 |
| Session Attendance       | +20 |
| Interest Quiz Completion | +25 |
| Feedback                 | +15 |

Nilai XP harus dapat dikonfigurasi oleh administrator.

---

# Point Ledger

XP tidak hanya disimpan sebagai angka total.

Sistem menggunakan **point transaction ledger**.

Contoh:

```text
point_transactions

id
participant_id
activity_type_id
points
source_type
source_id
awarded_by
created_at
revoked_at
metadata
```

Hal ini memungkinkan:

* audit;
* investigasi;
* koreksi;
* revoke point;
* tracking aktivitas;
* analisis data.

Contoh:

```text
Participant A

+50  Event Check-in
+15  UI Campus Visit
+20  Engineering Session
+10  Meaningful Interaction
----------------------------
95 XP
```

---

# Anti Point Farming

Sistem tidak memperbolehkan peserta memperoleh poin tanpa batas hanya dengan melakukan scan berulang.

Contoh aturan:

```text
Event attendance:
1 reward / participant

Campus visit:
1 reward / university

Session attendance:
1 reward / session

Quiz:
1 completion reward

Feedback:
1 reward
```

Business rules kritis harus didukung oleh database constraints jika memungkinkan.

---

# Meaningful Interaction

Sistem tidak menggunakan konsep:

```text
"Alumni bebas memasukkan jumlah poin apa pun."
```

Hal tersebut berpotensi menimbulkan:

* ketidakadilan;
* point manipulation;
* favoritisme;
* leaderboard abuse.

Sebaliknya, staff/campus representative memilih aktivitas yang telah ditentukan.

Contoh:

```text
Meaningful Interaction
Campus Consultation
Mini Activity
```

Backend menentukan reward berdasarkan activity configuration.

---

# Levels

Peserta dapat memperoleh level berdasarkan XP.

Contoh:

```text
Level 1
Explorer

Level 2
Pathfinder

Level 3
Campus Seeker

Level 4
Future Scholar
```

Level ditentukan oleh XP threshold yang dikelola oleh sistem.

---

# Achievements

Peserta dapat memperoleh achievement berdasarkan aktivitas.

Contoh:

### First Step

Mengikuti check-in pertama.

### Campus Explorer

Mengunjungi beberapa universitas.

### Major Explorer

Mengeksplorasi beberapa jurusan.

### Curious Mind

Melakukan meaningful interaction.

### Cross-Field Explorer

Mengeksplorasi beberapa bidang akademik.

### CGTK Finisher

Menyelesaikan journey utama CGTK.

---

# Missions

Mission memberikan target yang jelas kepada peserta.

Contoh:

```text
EXPLORE 3 UNIVERSITIES
2 / 3

EXPLORE 3 MAJORS
1 / 3

ATTEND 2 SESSIONS
1 / 2
```

Mission dirancang untuk mendorong eksplorasi, bukan sekadar mengumpulkan poin sebanyak mungkin.

---

# Leaderboard

Leaderboard menampilkan ranking peserta berdasarkan XP yang valid.

Contoh:

```text
CGTK LEADERBOARD

1. A*****       720 XP
2. R*****       690 XP
3. N*****       650 XP
```

Leaderboard harus memperhatikan:

* privacy;
* display name;
* participant consent;
* tie handling;
* pagination;
* performance.

Informasi pribadi peserta tidak boleh ditampilkan secara berlebihan.

---

# Profile Customization

Peserta dapat memperoleh elemen kosmetik berdasarkan level atau achievement.

Contoh:

* Profile border
* Achievement badge
* Campus-inspired theme
* Level badge

Jika menggunakan identitas visual perguruan tinggi, aset resmi dan penggunaan branding harus diperhatikan terlebih dahulu.

---

# Event Schedule

Peserta dapat melihat jadwal kegiatan:

```text
09:00  Opening
10:00  Campus Expo
11:00  Sharing Session
13:00  Tryout
15:00  Awarding
```

Ke depannya peserta dapat memiliki:

```text
MY SCHEDULE
```

yang menampilkan sesi yang relevan dengan journey mereka.

---

# Announcement System

Admin dapat membuat pengumuman seperti:

* Perubahan jadwal
* Perubahan lokasi
* Informasi sesi
* Informasi teknis
* Pengumuman penting

Pengumuman ditampilkan langsung di dashboard peserta.

---

# Admin Dashboard

Admin membutuhkan dashboard terpusat untuk mengelola platform.

### Participant Management

* View participants
* Search
* Filter
* Registration status
* Attendance

### Event Management

* Events
* Sessions
* Schedule
* Locations

### Campus Management

* Universities
* Majors
* Representatives

### Gamification Management

* Activity types
* XP configuration
* Achievements
* Missions
* Level thresholds

### Communication

* Announcements

### Analytics

* Registration
* Attendance
* Campus visits
* Activity participation
* Quiz completion
* Journey completion

---

# Analytics

Platform dapat menghasilkan insight setelah event.

Contoh:

```text
Registered Participants       487
Checked-in                    421
Attendance Rate                86%

Campus Visits                1,203
Interactions                   531

Quiz Completion                82%
Journey Completion              71%
```

Contoh insight:

```text
Most Explored University
Universitas Indonesia

Most Explored Field
Engineering

Most Explored Major
Computer Science
```

Data ini dapat digunakan untuk evaluasi dan pengembangan CGTK berikutnya.

---

# User Roles

Platform menggunakan role-based access control (RBAC).

## Participant

Dapat:

* Mengelola profil sendiri
* Melihat QR sendiri
* Mengikuti quiz
* Melihat journey
* Melihat passport
* Melihat XP
* Melihat achievement
* Melihat leaderboard

## Staff

Dapat:

* Scan participant QR
* Melakukan aktivitas yang diberikan izin
* Melihat informasi minimum yang diperlukan untuk operasional

## Campus Representative

Dapat:

* Scan participant QR
* Mencatat campus visit
* Mencatat meaningful interaction
* Mengakses data operasional yang diperlukan

## Admin

Dapat:

* Mengelola peserta
* Mengelola event
* Mengelola universitas
* Mengelola aktivitas
* Mengatur XP
* Mengelola announcements
* Mengakses analytics

## Super Admin

Memiliki akses administratif tingkat tertinggi untuk pengelolaan sistem.

---

# System Architecture

High-level architecture:

```text
                         CGTK PLATFORM
                               │
              ┌────────────────┴────────────────┐
              │                                 │
           PUBLIC                         AUTHENTICATED
              │                                 │
        Landing Page                       Participant
        About CGTK                         Dashboard
        Schedule                           Profile
        Universities                       QR Identity
        Majors                             Passport
        Registration                        Journey
                                           Quiz
                                           XP
                                           Achievements
                                           Leaderboard
              │                                 │
              └────────────────┬────────────────┘
                               │
                         BACKEND API
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
     Identity              Event Core          Engagement
        │                      │                      │
   Auth / RBAC             Attendance          Quiz
   Participants            QR Scanner          Activities
   QR Identity             Sessions            XP
                                                Missions
                                                Achievements
                                                Leaderboard
                               │
                         RELATIONAL DB
```

---

# Backend Architecture

Backend menggunakan pendekatan:

## Modular Monolith

Microservices bukan target utama proyek ini.

Alasan:

* Backend hanya dikerjakan oleh dua developer.
* Event memiliki domain yang cukup jelas.
* Deployment akan lebih sederhana.
* Database consistency lebih mudah dijaga.
* Development dan debugging lebih mudah.
* Infrastruktur lebih murah dan realistis.

Microservices dapat dipertimbangkan di masa depan jika terdapat kebutuhan nyata.

---

# Backend Domain Ownership

Backend dibagi berdasarkan **domain ownership**, bukan berdasarkan jumlah endpoint.

## Rafly — Core Platform & Identity

Rafly bertanggung jawab atas:

```text
Authentication
Authorization
RBAC
Users
Participants
Registration
Participant Profile
QR Identity
QR Validation
Scanner Authorization
Attendance
Events
Sessions
Security
API Architecture
Database Migration Coordination
```

Primary modules:

```text
auth/
users/
participants/
permissions/
qr/
attendance/
events/
sessions/
```

---

## Danar — Engagement, Gamification & Content

Danar bertanggung jawab atas:

```text
Universities
Majors
University Relationships
Campus Representatives
Interest Exploration
Quiz
Activities
XP
Point Transactions
Achievements
Missions
Leaderboard
Announcements
Analytics
```

Primary modules:

```text
universities/
majors/
representatives/
quiz/
activities/
points/
achievements/
missions/
leaderboard/
announcements/
analytics/
```

---

# Backend Ownership Rule

Developer tidak boleh mengubah domain developer lain secara sembarangan.

Contoh:

### Danar dapat menggunakan:

```text
participant_id
user_id
```

tetapi tidak mengimplementasikan ulang authentication atau participant identity.

### Rafly tidak menaruh:

```text
XP calculation
Achievement logic
Mission logic
Leaderboard logic
```

ke dalam participant module.

Business logic harus berada di domain yang memiliki tanggung jawab terhadapnya.

---

# Database Responsibility

Rafly menjadi **database migration coordinator**.

Danar dapat membuat migration untuk tabel yang sepenuhnya berada dalam domain Danar.

Namun perubahan terhadap shared/core entities harus dikomunikasikan dan direview terlebih dahulu.

### Important Rule

Jangan pernah mengubah migration yang sudah diterapkan di environment production.

Buat migration baru.

---

# Shared Contracts

Sebelum development paralel dimulai, Rafly dan Danar harus menyepakati:

* User ID format
* Participant ID format
* Authentication contract
* Authorization model
* Role definitions
* Database naming convention
* Timestamp convention
* API response format
* API error format
* Pagination convention
* Environment variable naming
* Migration convention

Shared contracts harus stabil sebelum frontend mulai bergantung pada API secara penuh.

---

# Database Concept

Initial domain model:

```text
users
roles
permissions
user_roles

participants

universities
majors
university_majors
campus_representatives

events
sessions
attendance

qr_credentials
scan_logs

activity_types
participant_activities
point_transactions

achievements
participant_achievements

missions
mission_tasks
participant_missions

quiz_questions
quiz_options
quiz_answers
quiz_results

announcements

audit_logs
```

Schema final akan ditentukan setelah requirements dan domain model selesai dianalisis.

---

# API Design

API menggunakan versioning.

Conceptual structure:

```text
/api/v1/auth
/api/v1/participants
/api/v1/events
/api/v1/sessions
/api/v1/qr
/api/v1/attendance

/api/v1/universities
/api/v1/majors
/api/v1/quiz
/api/v1/activities
/api/v1/points
/api/v1/achievements
/api/v1/missions
/api/v1/leaderboard

/api/v1/admin
```

Endpoint ownership akan ditandai:

```text
[R] Rafly
[D] Danar
```

API contract harus dibuat sebelum frontend mengimplementasikan integrasi secara penuh.

---

# Security

Security merupakan bagian inti dari platform karena sistem menangani data peserta dan aktivitas event.

Area yang harus diperhatikan:

* Authentication
* Password security
* Authorization
* RBAC
* IDOR prevention
* QR replay
* QR credential security
* Rate limiting
* Input validation
* SQL injection prevention
* Mass assignment
* Sensitive data exposure
* Duplicate submissions
* Race conditions
* Point manipulation
* Audit logging

Prinsip utama:

> **Never trust the client.**

Frontend tidak boleh menjadi sumber kebenaran untuk:

* XP
* Role
* Permission
* Attendance
* Achievement
* Level
* Participant identity

Backend harus memvalidasi seluruh data kritis.

---

# Privacy

Sebagian peserta CGTK dapat merupakan siswa sekolah.

Oleh karena itu platform menerapkan prinsip:

### Data Minimization

Kumpulkan hanya data yang diperlukan.

### Least Privilege

User hanya mendapatkan akses yang diperlukan.

### Privacy by Default

Data pribadi tidak boleh otomatis menjadi data publik.

### Auditability

Aktivitas administratif penting harus dapat dilacak.

---

# Performance & Event-Day Reliability

Platform harus mampu menangani penggunaan simultan dalam jumlah besar, terutama pada event day.

Area kritis:

```text
QR Scanning
Attendance
Point Transactions
Leaderboard
Participant Dashboard
```

API harus:

* lightweight;
* cepat;
* idempotent jika diperlukan;
* retry-safe jika memungkinkan;
* memiliki database indexes yang tepat.

Sistem juga harus mempertimbangkan kondisi jaringan yang tidak stabil.

Complex offline synchronization tidak menjadi prioritas V1 kecuali kebutuhan lapangan membuktikan bahwa fitur tersebut diperlukan.

---

# Development Priorities

## P0 — Critical

Fitur yang harus tersedia agar platform dapat menjalankan fungsi utama:

```text
Authentication
Registration
Participant Profile
RBAC
Admin Participant Management
QR Digital Identity
QR Scanner
Attendance
Event Information
Schedule
University Directory
```

## P1 — Core Differentiation

Fitur yang membuat platform berbeda dari website event biasa:

```text
Campus Passport
Activity System
XP Ledger
Leaderboard
Interest Exploration Quiz
Personalized Journey
```

## P2 — Enhancement

Fitur tambahan:

```text
Achievements
Missions
Profile Cosmetics
Campus-inspired Themes
Advanced Analytics
Advanced Notifications
```

Prioritas P0 harus stabil sebelum P2 dikembangkan.

---

# Development Workflow

Development menggunakan Git-based workflow.

Recommended branches:

```text
main
develop

feature/<domain>-<feature>
```

Examples:

```text
feature/auth-login
feature/qr-scanner
feature/attendance
feature/points-ledger
feature/campus-passport
feature/interest-quiz
```

## Rules

* Jangan direct commit ke `main`.
* Gunakan Pull Request.
* Commit harus memiliki tujuan yang jelas.
* Hindari PR yang terlalu besar.
* Domain ownership harus dihormati.
* Shared/core changes harus direview.
* Jangan commit secrets atau `.env`.

---

# Suggested Pull Request Format

```text
## What changed?

Describe the implementation.

## Why?

Explain the problem being solved.

## Domain

[R] Rafly
[D] Danar

## Database Changes

- [ ] No
- [ ] Yes

If yes, describe migration.

## API Changes

- [ ] No
- [ ] Yes

If yes, describe endpoint changes.

## Testing

Describe tests performed.

## Breaking Changes

- [ ] No
- [ ] Yes
```

---

# Suggested Commit Convention

Recommended format:

```text
feat:
fix:
refactor:
docs:
test:
chore:
perf:
security:
```

Examples:

```text
feat(qr): add participant QR validation

feat(attendance): implement event check-in

feat(points): add point transaction ledger

fix(auth): prevent unauthorized role escalation

test(attendance): add duplicate check-in tests

docs(api): update participant endpoint contract
```

---

# Project Structure

Initial backend structure:

```text
backend/
│
├── src/
│   ├── modules/
│   │
│   ├── auth/                  # Rafly
│   ├── users/                 # Rafly
│   ├── participants/          # Rafly
│   ├── permissions/           # Rafly
│   ├── qr/                    # Rafly
│   ├── attendance/            # Rafly
│   ├── events/                # Rafly
│   ├── sessions/              # Rafly
│   │
│   ├── universities/          # Danar
│   ├── majors/                # Danar
│   ├── representatives/       # Danar
│   ├── quiz/                  # Danar
│   ├── activities/            # Danar
│   ├── points/                # Danar
│   ├── achievements/          # Danar
│   ├── missions/              # Danar
│   ├── leaderboard/           # Danar
│   ├── announcements/         # Danar
│   └── analytics/             # Danar
│
├── tests/
├── migrations/
├── docs/
├── .env.example
├── README.md
└── ...
```

Final structure may change after architecture review.

---

# Development Roadmap

## Phase 0 — Requirements

* [ ] Finalize CGTK requirements
* [ ] Define participant journey
* [ ] Define staff workflow
* [ ] Define campus representative workflow
* [ ] Define admin workflow
* [ ] Define event rules
* [ ] Define XP rules

---

## Phase 1 — Architecture

* [ ] Choose backend stack
* [ ] Choose database
* [ ] Define domain boundaries
* [ ] Define RBAC
* [ ] Design ERD
* [ ] Define API conventions
* [ ] Define security model
* [ ] Define QR architecture

---

## Phase 2 — Core Platform

* [ ] Authentication
* [ ] Registration
* [ ] Participant profile
* [ ] RBAC
* [ ] Event/session management
* [ ] Admin participant management

---

## Phase 3 — QR & Attendance

* [ ] QR credential generation
* [ ] QR validation
* [ ] Scanner authorization
* [ ] Attendance
* [ ] Duplicate protection
* [ ] Scan logs

---

## Phase 4 — Engagement

* [ ] University directory
* [ ] Major directory
* [ ] Campus Passport
* [ ] Activity system
* [ ] Point ledger
* [ ] Leaderboard

---

## Phase 5 — Personalization

* [ ] Interest Exploration Quiz
* [ ] Quiz scoring
* [ ] Recommendations
* [ ] Personalized Journey
* [ ] Missions
* [ ] Achievements

---

## Phase 6 — Admin & Analytics

* [ ] Announcement system
* [ ] Analytics
* [ ] Event statistics
* [ ] Participant engagement statistics
* [ ] Export/reporting if required

---

## Phase 7 — Testing & Event Preparation

* [ ] Unit tests
* [ ] Integration tests
* [ ] API tests
* [ ] Security review
* [ ] Load testing
* [ ] QR stress testing
* [ ] Event-day simulation
* [ ] Backup strategy
* [ ] Deployment testing

---

# Technology Stack

> **Status: TBD**

The final technology stack will be selected after the architecture review.

Potential considerations:

### Backend

* Framework: TBD
* Language: TBD
* ORM: TBD
* Validation: TBD

### Database

* Relational database: TBD

### Authentication

* Strategy: TBD

### Frontend

* Framework: TBD

### Infrastructure

* Hosting: TBD
* Database hosting: TBD
* Storage: TBD
* Monitoring: TBD

Technology decisions should be based on:

* team expertise;
* maintainability;
* reliability;
* development speed;
* security;
* deployment cost;
* project requirements.

The project will prioritize practical engineering over technological novelty.

---

# Team

## Event Leadership

### Daniel

CGTK Event Lead / Product Owner

Responsibilities:

* Event direction
* Product requirements
* Operational rules
* Coordination with technical team

### Valen

CGTK Event Leadership

Responsibilities:

* Event coordination
* Operational requirements
* Stakeholder coordination

---

## UI/UX

### Mirza

UI/UX Designer

### Fafa

UI/UX Designer

Responsibilities:

* User flows
* Wireframes
* Design system
* Participant experience
* Scanner UX
* Admin UX

---

## Frontend

### Rijal

Frontend Developer

### Faris

Frontend Developer — Pending Confirmation

Responsibilities:

* Public website
* Authentication UI
* Participant dashboard
* QR display
* Campus Passport
* Quiz
* Journey
* Leaderboard
* Scanner UI
* Admin dashboard

---

## Backend

### Rafly

Backend Developer — Core Platform & Identity

Responsible for:

* Authentication
* Authorization
* RBAC
* Users
* Participants
* Registration
* QR Identity
* QR validation
* Attendance
* Event/session core
* Security
* API architecture
* Database migration coordination

### Danar

Backend Developer — Engagement & Gamification

Responsible for:

* Universities
* Majors
* Campus representatives
* Interest Exploration
* Quiz
* Activities
* XP
* Point transactions
* Achievements
* Missions
* Leaderboard
* Announcements
* Analytics

---

# Engineering Principles

This project follows several principles.

## 1. Correctness over complexity

The best architecture is not the architecture with the most technologies.

## 2. Backend is the source of truth

Critical business rules must be validated server-side.

## 3. Domain ownership

Every module should have clear ownership.

## 4. Database integrity matters

Important business rules should be enforced at the database level whenever appropriate.

## 5. Security by design

Security should not be added after the application is finished.

## 6. Data minimization

Do not collect data without a clear purpose.

## 7. Event reliability

A feature that works in development but fails when hundreds of participants scan QR simultaneously is not a successful feature.

## 8. Avoid premature optimization

Do not introduce infrastructure complexity without a measurable need.

---

# Non-Goals

The project intentionally avoids unnecessary complexity in V1.

We will NOT introduce the following by default:

```text
Microservices
Kubernetes
Kafka
Complex event sourcing
Multiple databases
Complex distributed systems
Enterprise-scale infrastructure
```

unless a real requirement justifies them.

CGTK is an event platform, not a replacement for civilization's infrastructure.

---

# Documentation

Additional technical documentation will be maintained in:

```text
/docs
```

Potential documentation:

```text
docs/
├── architecture/
├── api/
├── database/
├── security/
├── deployment/
├── development/
└── event-operation/
```

---

# Project Status

> 🚧 **Currently in development**

Current stage:

```text
Requirements & Architecture
```

The project is currently focused on:

* Requirements analysis
* Product definition
* User flow
* System architecture
* Database design
* API contract
* Team responsibilities

Implementation should begin after the core architecture and API contracts are sufficiently stable.

---

# Long-Term Vision

The long-term goal is to make CGTK more than a yearly event website.

The platform can eventually become a reusable digital infrastructure for future CGTK editions.

Potential future capabilities:

```text
CGTK Account
     ↓
Annual CGTK Event
     ↓
Participant History
     ↓
Campus Exploration History
     ↓
Academic Interest Profile
     ↓
Future CGTK Events
```

The platform should be designed so that the next CGTK does not need to rebuild everything from zero.

---

# License

License:

> **TBD**

The license will be determined by the project organizers and development team.

---

# Disclaimer

CGTK Digital Experience Platform is an independent project developed to support the organization and execution of CGTK.

The platform does not represent or officially speak on behalf of any university unless explicitly stated by the relevant institution.

Interest exploration results are intended only as an exploratory aid and should not be interpreted as professional psychological assessment or definitive academic guidance.

---

# Acknowledgements

Built by the CGTK technical team with the goal of improving the experience of students exploring their future academic paths.

**CGTK Digital Experience Platform**

> Discover. Connect. Participate. Progress.


