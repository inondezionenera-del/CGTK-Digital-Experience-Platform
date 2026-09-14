-- =============================================================================
-- 0010 — Reference data
--
-- Safe to re-run: everything upserts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles — seven, and a person holds exactly one
-- -----------------------------------------------------------------------------
insert into roles (kode, nama, urutan) values
  ('PESERTA',           'Peserta',                    1),
  ('DIV_ADMINISTRASI',  'Divisi Administrasi',        2),
  ('DIV_ACARA',         'Divisi Acara',               3),
  ('DIV_PENDANAAN',     'Divisi Pendanaan & PDD',     4),
  ('LO_PENDIDIKAN',     'LO — Divisi Pendidikan',     5),
  ('ALUMNI',            'Alumni Booth',               6),
  ('SUPER_ADMIN',       'Super Admin',                7)
on conflict (kode) do update set nama = excluded.nama;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
insert into permissions (kode, nama, kelompok) values
  ('LIHAT_DASHBOARD',           'Lihat dashboard peserta',        'peserta'),
  ('IKUT_KUIS',                 'Ikut kuis minat & bakat',        'peserta'),

  ('ATUR_PEMBAYARAN',           'Atur harga & petunjuk bayar',    'administrasi'),
  ('TANDAI_LUNAS',              'Tandai pembayaran lunas',        'administrasi'),
  ('KELOLA_FORM',               'Kelola form pendaftaran',        'administrasi'),
  ('SCAN_PRESENSI',             'Scan presensi sesi',             'administrasi'),
  ('EKSPOR_PRESENSI',           'Ekspor data presensi',           'administrasi'),
  ('KIRIM_PENGUMUMAN',          'Kirim pengumuman',               'administrasi'),

  ('SAKLAR_SESI',               'Buka/tutup sesi',                'acara'),
  ('KELOLA_JADWAL',             'Kelola acara & sesi',            'acara'),
  ('KELOLA_BOOTH',              'Kelola booth & poster',          'acara'),
  ('ATUR_XP',                   'Atur nilai XP',                  'acara'),
  ('BEKUKAN_LEADERBOARD',       'Bekukan papan peringkat',        'acara'),

  ('KELOLA_SPONSOR',            'Kelola sponsor',                 'pendanaan'),

  ('LIHAT_ALUMNI_DAMPINGAN',    'Lihat alumni dampingan',         'lo'),
  ('LIHAT_STATISTIK_DAMPINGAN', 'Lihat statistik booth dampingan','lo'),

  ('SCAN_BOOTH',                'Scan peserta di booth',          'alumni'),
  ('KELOLA_MATERI',             'Unggah materi kampus & booth',   'alumni'),

  ('KELOLA_MASTER',             'Kelola data kampus & jurusan',   'super'),
  ('UNDANG_ALUMNI',             'Undang alumni & tugaskan LO',    'super'),
  ('SAHKAN_PEMENANG',           'Sahkan pemenang',                'super'),
  ('LIHAT_AUDIT',               'Lihat log perubahan',            'super'),
  ('EKSPOR_LPJ',                'Ekspor data LPJ',                'super'),
  ('LIHAT_ANALITIK',            'Lihat analitik',                 'super'),
  ('KELOLA_USER',               'Kelola akun pengguna',           'super'),
  ('KELOLA_PERAN',              'Kelola peran & izin',            'super'),
  ('KELOLA_KONTEN',             'Kelola halaman statis',          'super'),
  ('KELOLA_KUIS',               'Kelola bank soal',               'super'),
  ('KELOLA_MISI',               'Kelola misi & achievement',      'super'),
  ('MODE_DRYRUN',               'Nyalakan mode latihan',          'super'),
  ('PENGATURAN_SISTEM',         'Ubah pengaturan sistem',         'super')
on conflict (kode) do update set nama = excluded.nama, kelompok = excluded.kelompok;

-- -----------------------------------------------------------------------------
-- Role → permission mapping
--
-- Events may set XP but not touch payments; Administration may settle payments
-- but not move the schedule. That separation is the whole reason this is
-- permission-based.
-- -----------------------------------------------------------------------------
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
where (r.kode, p.kode) in (
  ('PESERTA','LIHAT_DASHBOARD'), ('PESERTA','IKUT_KUIS'),

  ('DIV_ADMINISTRASI','ATUR_PEMBAYARAN'),
  ('DIV_ADMINISTRASI','TANDAI_LUNAS'),
  ('DIV_ADMINISTRASI','KELOLA_FORM'),
  ('DIV_ADMINISTRASI','SCAN_PRESENSI'),
  ('DIV_ADMINISTRASI','EKSPOR_PRESENSI'),
  ('DIV_ADMINISTRASI','KIRIM_PENGUMUMAN'),

  ('DIV_ACARA','SAKLAR_SESI'),
  ('DIV_ACARA','KELOLA_JADWAL'),
  ('DIV_ACARA','KELOLA_BOOTH'),
  ('DIV_ACARA','ATUR_XP'),
  ('DIV_ACARA','BEKUKAN_LEADERBOARD'),

  ('DIV_PENDANAAN','KELOLA_SPONSOR'),

  ('LO_PENDIDIKAN','LIHAT_ALUMNI_DAMPINGAN'),
  ('LO_PENDIDIKAN','LIHAT_STATISTIK_DAMPINGAN'),

  ('ALUMNI','SCAN_BOOTH'),
  ('ALUMNI','KELOLA_MATERI')
)
on conflict do nothing;

-- Super Admin holds everything.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p where r.kode = 'SUPER_ADMIN'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Activities
-- -----------------------------------------------------------------------------
insert into activities (kode, nama, xp_default, bisa_diubah) values
  ('PRESENSI_SESI',    'Presensi sesi acara',  20, true),
  ('KUNJUNGAN_BOOTH',  'Kunjungan booth',      10, true),
  ('SELESAI_KUIS',     'Menyelesaikan kuis',   30, true),
  ('SELESAI_MISI',     'Menyelesaikan misi',   15, true)
on conflict (kode) do update set nama = excluded.nama;

-- -----------------------------------------------------------------------------
-- Levels
--
-- Names and thresholds are editable by the Events division — the numbers below
-- are a starting point, not a decision.
-- -----------------------------------------------------------------------------
insert into levels (nomor, nama, xp_minimum) values
  (1, 'Pencari Arah',        0),
  (2, 'Penjelajah',        100),
  (3, 'Penyusur Kampus',   250),
  (4, 'Navigator',         450),
  (5, 'Calon Maba',        700),
  (6, 'Sarjana Muda CGTK', 1000)
on conflict (nomor) do update set nama = excluded.nama, xp_minimum = excluded.xp_minimum;

-- -----------------------------------------------------------------------------
-- Settings
--
-- Anything here can be changed by the owning division without a developer.
-- That is the whole point of the table.
-- -----------------------------------------------------------------------------
insert into settings (kunci, nilai, tipe, kelompok, deskripsi, publik) values
  ('xp_booth_hadir',            '10',      'ANGKA',   'xp',    'XP untuk kehadiran di booth', true),
  ('xp_booth_aktif',            '20',      'ANGKA',   'xp',    'XP untuk peserta yang aktif bertanya', true),
  ('xp_booth_sangat_aktif',     '30',      'ANGKA',   'xp',    'XP untuk peserta yang sangat aktif', true),
  ('xp_booth_max',              '30',      'ANGKA',   'xp',    'Batas XP per peserta per booth', true),

  ('max_edit_profil',           '2',       'ANGKA',   'form',  'Berapa kali peserta boleh mengubah profil', true),
  ('max_percobaan_kuis',        '3',       'ANGKA',   'kuis',  'Batas percobaan kuis', true),
  ('jumlah_pemenang',           '3',       'ANGKA',   'acara', 'Berapa besar yang dapat hadiah', true),

  ('registrasi_dibuka',         'true',    'BOOLEAN', 'form',  'Pendaftaran dibuka atau ditutup', true),
  ('polling_pengumuman_detik',  '30',      'ANGKA',   'sistem','Jeda polling pengumuman', true),
  ('mode_hemat',                'false',   'BOOLEAN', 'sistem','Matikan fitur berat kalau hari-H terlalu ramai', true),
  ('sponsor_slots_enabled',     'false',   'BOOLEAN', 'sistem','Slot sponsor di dashboard & leaderboard', true),
  ('alumni_attendance',         'false',   'BOOLEAN', 'sistem','Absensi alumni — dasarnya sudah ada, belum dinyalakan', false),
  ('dry_run',                   'false',   'BOOLEAN', 'sistem','Mode latihan untuk panitia', false),

  -- Payment. The form URL is NOT public: it is only ever reached through the
  -- server-side redirect, so it never appears in any page or API response.
  ('harga_tampil',              '',        'TEKS',    'bayar', 'Harga yang ditampilkan — teks bebas, bukan angka yang dihitung', true),
  ('teks_petunjuk_bayar',       '',        'TEKS',    'bayar', 'Petunjuk pembayaran, ditulis Divisi Administrasi', true),
  ('link_pembayaran',           '',        'TEKS',    'bayar', 'URL form pembayaran — TIDAK PERNAH dikirim ke halaman peserta', false),
  ('prefill_entry_id',          '',        'TEKS',    'bayar', 'ID kolom Google Form untuk Kode Registrasi (entry.xxxxx)', false),
  ('batas_akhir_pembayaran',    '',        'TEKS',    'bayar', 'Batas akhir pembayaran', true)
on conflict (kunci) do update
  set tipe = excluded.tipe,
      kelompok = excluded.kelompok,
      deskripsi = excluded.deskripsi,
      publik = excluded.publik;

-- -----------------------------------------------------------------------------
-- Static pages — content lives in the database so the committee can edit it
-- -----------------------------------------------------------------------------
insert into pages (slug, judul, isi) values
  ('faq',   'Pertanyaan yang Sering Ditanyakan', '_Belum diisi._'),
  ('about', 'Tentang CGTK 2027',                 '_Belum diisi._'),
  ('terms', 'Ketentuan Peserta',                 '_Belum diisi._')
on conflict (slug) do nothing;
