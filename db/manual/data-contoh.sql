-- =============================================================================
-- Data contoh untuk tim frontend
--
-- BUKAN migration, dan sengaja tidak ditaruh di db/migrations. Data ini cuma
-- supaya Rijal, Fariz, dan Haqi punya sesuatu untuk ditampilkan sebelum Divisi
-- Acara mengisi data yang sebenarnya. Kalau ikut jadi migration, dia akan
-- terpasang lagi setiap kali database dibangun ulang, termasuk nanti waktu
-- database sudah berisi data asli.
--
-- Aman dijalankan berulang kali. Setiap baris dijaga supaya tidak kembar.
--
-- JALANKAN:
--   npm run db:contoh
--
-- Cara menghapusnya nanti ada di bagian paling bawah.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Acara. Empat, sesuai struktur yang sudah disepakati.
--
-- Tanggalnya dihitung dari hari ini supaya data contoh tidak pernah basi.
-- Jumlah acara dan jumlah hari tidak dikunci di kode, jadi Divisi Acara boleh
-- menambah, mengurangi, atau menggeser tanggalnya sendiri nanti.
-- -----------------------------------------------------------------------------
insert into events (nama, tipe, tanggal, deskripsi, urutan)
select v.nama, v.tipe, current_date + v.hari, v.deskripsi, v.urutan
from (values
  ('Pembukaan',    'PEMBUKAAN',    30, 'Upacara pembukaan dan perkenalan alumni di panggung.', 1),
  ('Expo Kampus',  'EXPO_KAMPUS',  30, 'Sosialisasi kampus. Satu booth untuk satu kampus.', 2),
  ('Expo Jurusan', 'EXPO_JURUSAN', 31, 'Sosialisasi jurusan. Alumni dari beberapa kampus berkumpul di satu booth jurusan.', 3),
  ('Penutupan',    'PENUTUPAN',    31, 'Pengumuman pemenang dan penutupan.', 4)
) as v(nama, tipe, hari, deskripsi, urutan)
where not exists (select 1 from events e where e.nama = v.nama);

-- -----------------------------------------------------------------------------
-- 2. Sesi.
--
-- Statusnya sengaja dibuat bermacam-macam supaya tim frontend bisa melihat
-- ketiga tampilannya sekaligus tanpa perlu mengubah data:
--   CLOSED -> abu-abu       ACTIVE -> badge LIVE       DRAFT -> tidak tampil
--
-- Yang DRAFT itu penting ada. Kalau tidak pernah ada satu pun baris DRAFT,
-- tidak ada yang sadar kalau kodenya lupa menyaring, dan baru ketahuan di
-- hari-H waktu sesi yang belum siap ikut tampil di HP peserta.
-- -----------------------------------------------------------------------------
insert into sessions (event_id, nama, lokasi, jam_mulai, jam_selesai, status, xp, wajib_presensi, urutan)
select e.id,
       v.nama,
       v.lokasi,
       (current_date + v.hari) + v.mulai,
       (current_date + v.hari) + v.selesai,
       v.status,
       v.xp,
       v.wajib,
       v.urutan
from (values
  ('Pembukaan',    'Registrasi Ulang',         'Lobby Utama', 30, interval '8 hours',  interval '9 hours',  'CLOSED', 10, true, 1),
  ('Pembukaan',    'Opening Ceremony',         'Aula Utama',  30, interval '9 hours',  interval '10 hours', 'ACTIVE', 20, true, 2),
  ('Expo Kampus',  'Campus Expo Sesi 1',       'Lapangan A',  30, interval '10 hours', interval '12 hours', 'ACTIVE', 15, true, 1),
  ('Expo Kampus',  'Talkshow Kuliah di PTN',   'Aula Utama',  30, interval '13 hours', interval '14 hours', 'DRAFT',  20, true, 2),
  ('Expo Jurusan', 'Expo Jurusan Sesi 1',      'Lapangan B',  31, interval '9 hours',  interval '11 hours', 'DRAFT',  15, true, 1),
  ('Penutupan',    'Penutupan dan Pengumuman', 'Aula Utama',  31, interval '14 hours', interval '15 hours', 'DRAFT',  20, true, 1)
) as v(acara, nama, lokasi, hari, mulai, selesai, status, xp, wajib, urutan)
join events e on e.nama = v.acara
where not exists (
  select 1 from sessions s where s.event_id = e.id and s.nama = v.nama
);

-- -----------------------------------------------------------------------------
-- 3. Kampus dan jurusan.
--
-- Sengaja lebih dari sepuluh baris supaya kotak pencarian di halaman direktori
-- benar-benar ada gunanya waktu dicoba. Daftar dengan tiga baris selalu
-- kelihatan baik-baik saja, dan itu yang menipu.
-- -----------------------------------------------------------------------------
insert into universities (nama, singkatan, kota, akreditasi, website, warna_khas)
select v.nama, v.singkatan, v.kota, v.akreditasi, v.website, v.warna
from (values
  ('Institut Teknologi Bandung',          'ITB',   'Bandung',    'Unggul',      'https://itb.ac.id',              '#005AA7'),
  ('Institut Teknologi Sepuluh Nopember', 'ITS',   'Surabaya',   'Unggul',      'https://its.ac.id',              '#003D7C'),
  ('Universitas Indonesia',               'UI',    'Depok',      'Unggul',      'https://ui.ac.id',               '#FFD700'),
  ('Universitas Gadjah Mada',             'UGM',   'Yogyakarta', 'Unggul',      'https://ugm.ac.id',              '#F2A900'),
  ('Universitas Airlangga',               'UNAIR', 'Surabaya',   'Unggul',      'https://unair.ac.id',            '#00549F'),
  ('Universitas Brawijaya',               'UB',    'Malang',     'Unggul',      'https://ub.ac.id',               '#1E4B8F'),
  ('Universitas Jember',                  'UNEJ',  'Jember',     'Baik Sekali', 'https://unej.ac.id',             '#006837'),
  ('Universitas Negeri Surabaya',         'UNESA', 'Surabaya',   'Unggul',      'https://unesa.ac.id',            '#004A8F'),
  ('Universitas Trunojoyo Madura',        'UTM',   'Bangkalan',  'Baik Sekali', 'https://trunojoyo.ac.id',        '#8B0000'),
  ('Universitas Padjadjaran',             'UNPAD', 'Bandung',    'Unggul',      'https://unpad.ac.id',            '#F5A623'),
  ('Universitas Diponegoro',              'UNDIP', 'Semarang',   'Unggul',      'https://undip.ac.id',            '#004B87'),
  ('Universitas Telkom',                  'TELU',  'Bandung',    'Unggul',      'https://telkomuniversity.ac.id', '#C8102E')
) as v(nama, singkatan, kota, akreditasi, website, warna)
where not exists (select 1 from universities u where u.singkatan = v.singkatan);

insert into majors (nama, rumpun, deskripsi)
select v.nama, v.rumpun, v.deskripsi
from (values
  ('Teknik Informatika',      'Teknik & Rekayasa',  'Perangkat lunak, kecerdasan buatan, dan sistem komputer.'),
  ('Teknik Elektro',          'Teknik & Rekayasa',  'Kelistrikan, elektronika, dan kendali.'),
  ('Teknik Sipil',            'Teknik & Rekayasa',  'Struktur, jalan, dan bangunan air.'),
  ('Teknik Mesin',            'Teknik & Rekayasa',  'Mesin, manufaktur, dan energi.'),
  ('Sistem Informasi',        'Teknik & Rekayasa',  'Jembatan antara kebutuhan organisasi dan teknologi.'),
  ('Kedokteran',              'Kesehatan',          'Pendidikan dokter umum.'),
  ('Farmasi',                 'Kesehatan',          'Obat, formulasi, dan pelayanan kefarmasian.'),
  ('Keperawatan',             'Kesehatan',          'Asuhan keperawatan dan kesehatan masyarakat.'),
  ('Manajemen',               'Ekonomi & Bisnis',   'Pengelolaan organisasi, pemasaran, dan keuangan.'),
  ('Akuntansi',               'Ekonomi & Bisnis',   'Pelaporan, audit, dan perpajakan.'),
  ('Ilmu Komunikasi',         'Sosial & Humaniora', 'Media, jurnalistik, dan hubungan masyarakat.'),
  ('Hubungan Internasional',  'Sosial & Humaniora', 'Diplomasi, politik global, dan kerja sama antarnegara.'),
  ('Psikologi',               'Sosial & Humaniora', 'Perilaku, perkembangan, dan kesehatan mental.'),
  ('Matematika',              'Sains',              'Analisis, aljabar, dan pemodelan.'),
  ('Biologi',                 'Sains',              'Makhluk hidup dan lingkungannya.')
) as v(nama, rumpun, deskripsi)
where not exists (select 1 from majors m where m.nama = v.nama);

-- Penghubung kampus dan jurusan. Dipakai logika rekomendasi kuis Danar, dan
-- dipakai halaman detail kampus punya Rijal.
insert into university_majors (university_id, major_id)
select u.id, m.id
from (values
  ('ITB',   'Teknik Informatika'), ('ITB',   'Teknik Elektro'), ('ITB',   'Teknik Sipil'),
  ('ITB',   'Teknik Mesin'),       ('ITB',   'Matematika'),
  ('ITS',   'Teknik Informatika'), ('ITS',   'Teknik Elektro'), ('ITS',   'Teknik Sipil'),
  ('ITS',   'Sistem Informasi'),
  ('UI',    'Kedokteran'),         ('UI',    'Farmasi'),        ('UI',    'Ilmu Komunikasi'),
  ('UI',    'Hubungan Internasional'), ('UI', 'Psikologi'),
  ('UGM',   'Kedokteran'),         ('UGM',   'Teknik Informatika'), ('UGM', 'Manajemen'),
  ('UGM',   'Psikologi'),          ('UGM',   'Biologi'),
  ('UNAIR', 'Kedokteran'),         ('UNAIR', 'Farmasi'),        ('UNAIR', 'Keperawatan'),
  ('UNAIR', 'Akuntansi'),
  ('UB',    'Teknik Informatika'), ('UB',    'Manajemen'),      ('UB',    'Akuntansi'),
  ('UB',    'Ilmu Komunikasi'),
  ('UNEJ',  'Sistem Informasi'),   ('UNEJ',  'Manajemen'),      ('UNEJ',  'Keperawatan'),
  ('UNESA', 'Matematika'),         ('UNESA', 'Biologi'),        ('UNESA', 'Ilmu Komunikasi'),
  ('UTM',   'Teknik Informatika'), ('UTM',   'Manajemen'),      ('UTM',   'Akuntansi'),
  ('UNPAD', 'Kedokteran'),         ('UNPAD', 'Ilmu Komunikasi'),('UNPAD', 'Hubungan Internasional'),
  ('UNPAD', 'Psikologi'),
  ('UNDIP', 'Teknik Sipil'),       ('UNDIP', 'Teknik Mesin'),   ('UNDIP', 'Kedokteran'),
  ('UNDIP', 'Akuntansi'),
  ('TELU',  'Teknik Informatika'), ('TELU',  'Sistem Informasi'),('TELU',  'Teknik Elektro')
) as v(singkatan, jurusan)
join universities u on u.singkatan = v.singkatan
join majors m on m.nama = v.jurusan
on conflict (university_id, major_id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Booth. Dua jenis, di dua acara yang berbeda.
--
-- Acara 2 booth-nya per kampus, Acara 3 booth-nya per jurusan. Data ini yang
-- membuktikan dua bentuk itu benar-benar bisa ditampung satu tabel, dan aturan
-- anti curang yang sama (participant_id + booth_id) menutup dua-duanya.
--
-- Statusnya campur lagi, termasuk satu yang CLOSED, supaya tampilan booth yang
-- sudah tutup (abu-abu, tidak dihilangkan) ikut kelihatan waktu dicoba.
-- -----------------------------------------------------------------------------
insert into booths (event_id, booth_type, university_id, nama_tampilan, lokasi, xp_max, status, kode_booth, urutan)
select e.id, 'KAMPUS', u.id, 'Booth ' || u.singkatan, v.lokasi, 30, v.status,
       'K-' || u.singkatan, v.urutan
from (values
  ('ITB',   'Aula A-12', 'ACTIVE', 1),
  ('ITS',   'Aula A-13', 'ACTIVE', 2),
  ('UI',    'Aula A-14', 'ACTIVE', 3),
  ('UGM',   'Aula A-15', 'CLOSED', 4),
  ('UNAIR', 'Aula A-16', 'DRAFT',  5),
  ('UB',    'Aula A-17', 'ACTIVE', 6)
) as v(singkatan, lokasi, status, urutan)
join universities u on u.singkatan = v.singkatan
cross join (select id from events where tipe = 'EXPO_KAMPUS' order by id limit 1) e
where not exists (select 1 from booths b where b.kode_booth = 'K-' || u.singkatan);

insert into booths (event_id, booth_type, major_id, nama_tampilan, lokasi, xp_max, status, kode_booth, urutan)
select e.id, 'JURUSAN', m.id, 'Booth ' || m.nama, v.lokasi, 30, v.status,
       'J-' || lpad(m.id::text, 3, '0'), v.urutan
from (values
  ('Teknik Informatika', 'Lapangan B-05', 'ACTIVE', 1),
  ('Teknik Sipil',       'Lapangan B-06', 'ACTIVE', 2),
  ('Kedokteran',         'Lapangan B-07', 'ACTIVE', 3),
  ('Manajemen',          'Lapangan B-08', 'CLOSED', 4),
  ('Psikologi',          'Lapangan B-09', 'DRAFT',  5)
) as v(jurusan, lokasi, status, urutan)
join majors m on m.nama = v.jurusan
cross join (select id from events where tipe = 'EXPO_JURUSAN' order by id limit 1) e
where not exists (select 1 from booths b where b.kode_booth = 'J-' || lpad(m.id::text, 3, '0'));

-- -----------------------------------------------------------------------------
-- 5. Sponsor.
--
-- Tiga tier supaya grid-nya kelihatan bertingkat, dan satu yang tidak aktif
-- supaya ketahuan kalau ada yang lupa menyaring kolom aktif.
-- -----------------------------------------------------------------------------
insert into sponsors (nama, logo_url, tier, url, urutan, penempatan, aktif)
select v.nama, v.logo, v.tier, v.url, v.urutan, v.penempatan::jsonb, v.aktif
from (values
  ('Contoh Sponsor Platinum', 'https://placehold.co/400x160?text=PLATINUM', 'PLATINUM',      'https://example.com', 1, '["landing","footer"]', true),
  ('Contoh Sponsor Gold A',   'https://placehold.co/320x130?text=GOLD+A',   'GOLD',          'https://example.com', 1, '["landing"]',          true),
  ('Contoh Sponsor Gold B',   'https://placehold.co/320x130?text=GOLD+B',   'GOLD',          'https://example.com', 2, '["landing"]',          true),
  ('Contoh Sponsor Silver',   'https://placehold.co/240x100?text=SILVER',   'SILVER',        'https://example.com', 1, '["footer"]',           true),
  ('Contoh Media Partner',    'https://placehold.co/240x100?text=MEDIA',    'MEDIA_PARTNER', 'https://example.com', 1, '["footer"]',           true),
  ('Contoh Sponsor Nonaktif', 'https://placehold.co/240x100?text=OFF',      'SILVER',        null,                  9, '["landing"]',          false)
) as v(nama, logo, tier, url, urutan, penempatan, aktif)
where not exists (select 1 from sponsors s where s.nama = v.nama);

commit;

-- -----------------------------------------------------------------------------
-- Melihat hasilnya:
--
--   select urutan, tipe, nama, tanggal from events order by urutan;
--   select status, count(*) from sessions group by status order by status;
--   select booth_type, status, count(*) from booths group by 1, 2 order by 1, 2;
--   select count(*) as kampus from universities;
--   select count(*) as pasangan from university_majors;
--
-- MENGHAPUS semuanya nanti, kalau data asli sudah masuk. Urutannya penting
-- karena booth mengacu ke acara dan ke kampus:
--
--   delete from booths   where kode_booth like 'K-%' or kode_booth like 'J-%';
--   delete from sponsors where nama like 'Contoh %';
--   delete from sessions where nama in (
--     'Registrasi Ulang','Opening Ceremony','Campus Expo Sesi 1',
--     'Talkshow Kuliah di PTN','Expo Jurusan Sesi 1','Penutupan dan Pengumuman');
--   delete from events   where nama in ('Pembukaan','Expo Kampus','Expo Jurusan','Penutupan');
--   delete from university_majors;
--   delete from majors;
--   delete from universities;
--
-- Jangan dijalankan setelah pendaftaran dibuka. Menghapus acara ikut menghapus
-- sesinya, dan menghapus sesi ikut menghapus presensi yang menempel padanya.
-- -----------------------------------------------------------------------------
