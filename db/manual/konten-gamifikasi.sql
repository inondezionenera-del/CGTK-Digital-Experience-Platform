-- =============================================================================
-- Konten gamifikasi: soal kuis minat bakat, misi, achievement, kosmetik.
--
--   node scripts/jalankan-sql.mjs db/manual/konten-gamifikasi.sql
--
-- BUKAN migration, dan memang tidak boleh jadi migration. Isinya konten yang
-- akan diedit Divisi Acara lewat halaman admin; kalau dia tercatat di tabel
-- _migrations, setiap kali database dibangun ulang isinya akan kembali ke
-- naskah di berkas ini dan hasil kerja mereka hilang.
--
-- Idempoten. Dijalankan dua kali tidak menduplikasi apa pun.
--
-- Kenapa berkas ini ada: sebelum ini quiz_questions, quiz_options, missions,
-- achievements, dan cosmetics semuanya nol baris. Halaman Kuis menampilkan
-- "Soal kuis belum ada", halaman Misi dan Paspor kosong. Secara teknis tidak
-- ada yang rusak, tapi tiga layar inti peserta tidak menampilkan apa pun.
--
-- CATATAN PENTING soal bobot: kuncinya WAJIB sama persis dengan nilai
-- majors.rumpun, termasuk spasi dan tanda &. Layanan Python menjumlahkan bobot
-- per rumpun lalu mencari majors dengan "rumpun = :r". Satu huruf beda berarti
-- rekomendasi jurusannya kosong, dan itu tidak akan muncul sebagai error.
-- Lima nilai yang dipakai sekarang:
--     Teknik & Rekayasa, Kesehatan, Sains, Sosial & Humaniora, Ekonomi & Bisnis
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Soal kuis
--
-- Dua puluh soal. Tiap opsi memberi bobot ke satu atau dua rumpun; yang
-- memberi ke dua rumpun nilainya dibagi, supaya satu jawaban tidak lebih
-- berpengaruh dari jawaban lain hanya karena menyentuh lebih banyak rumpun.
--
-- Pertanyaannya sengaja tentang kebiasaan, bukan tentang cita-cita. Anak SMA
-- yang ditanya "mau jadi apa" menjawab dengan apa yang terdengar bagus; yang
-- ditanya "biasanya kamu ngapain" menjawab apa yang benar-benar dia lakukan.
-- -----------------------------------------------------------------------------

create temporary table soal_sementara (
  urutan int,
  teks   text,
  opsi   jsonb
) on commit drop;

insert into soal_sementara (urutan, teks, opsi) values
(1, 'Ada barang di rumah yang rusak. Apa yang paling mungkin kamu lakukan?', '[
  {"teks": "Bongkar dulu, lihat dalamnya, coba perbaiki sendiri", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Cari tahu kenapa bisa rusak, baru ambil kesimpulan", "bobot": {"Sains": 3}},
  {"teks": "Tanya orang yang biasa memperbaiki, sambil ikut melihat", "bobot": {"Sosial & Humaniora": 2, "Teknik & Rekayasa": 1}},
  {"teks": "Hitung lebih murah diperbaiki atau beli baru", "bobot": {"Ekonomi & Bisnis": 3}}
]'::jsonb),

(2, 'Pelajaran yang jam-nya terasa paling cepat habis?', '[
  {"teks": "Matematika atau Fisika", "bobot": {"Teknik & Rekayasa": 2, "Sains": 1}},
  {"teks": "Biologi atau Kimia", "bobot": {"Kesehatan": 2, "Sains": 1}},
  {"teks": "Sejarah, Sosiologi, atau Bahasa", "bobot": {"Sosial & Humaniora": 3}},
  {"teks": "Ekonomi atau Akuntansi", "bobot": {"Ekonomi & Bisnis": 3}}
]'::jsonb),

(3, 'Teman cerita sedang ada masalah berat. Reaksi pertamamu?', '[
  {"teks": "Dengarkan sampai habis dulu, jangan dipotong", "bobot": {"Sosial & Humaniora": 3}},
  {"teks": "Tanya detailnya, cari akar masalahnya", "bobot": {"Sains": 2, "Sosial & Humaniora": 1}},
  {"teks": "Kalau soal badan atau kesehatan, aku yang paling sibuk cari info", "bobot": {"Kesehatan": 3}},
  {"teks": "Bantu susun rencana supaya kejadiannya tidak terulang", "bobot": {"Ekonomi & Bisnis": 2, "Teknik & Rekayasa": 1}}
]'::jsonb),

(4, 'Diminta mengerjakan tugas kelompok, kamu paling nyaman di bagian mana?', '[
  {"teks": "Bikin alat, aplikasi, atau apa pun yang bisa dipakai", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Mengumpulkan data dan mengujinya", "bobot": {"Sains": 3}},
  {"teks": "Menulis dan mempresentasikan", "bobot": {"Sosial & Humaniora": 3}},
  {"teks": "Mengatur pembagian kerja dan tenggatnya", "bobot": {"Ekonomi & Bisnis": 3}}
]'::jsonb),

(5, 'Lihat orang terjatuh dan luka di depanmu. Jujur, apa yang terjadi?', '[
  {"teks": "Langsung mendekat, cek lukanya", "bobot": {"Kesehatan": 3}},
  {"teks": "Menenangkan orangnya dulu supaya tidak panik", "bobot": {"Sosial & Humaniora": 2, "Kesehatan": 1}},
  {"teks": "Cari apa yang bikin dia jatuh, biar tidak ada korban lagi", "bobot": {"Teknik & Rekayasa": 2, "Sains": 1}},
  {"teks": "Panggil bantuan, atur orang-orang di sekitar", "bobot": {"Ekonomi & Bisnis": 2, "Sosial & Humaniora": 1}}
]'::jsonb),

(6, 'Dapat uang lebih tak terduga. Paling sering kamu pakai untuk?', '[
  {"teks": "Beli komponen, alat, atau bahan buat bikin sesuatu", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Buku atau kursus yang bikin penasaran", "bobot": {"Sains": 2, "Sosial & Humaniora": 1}},
  {"teks": "Ditabung, atau dicoba diputar jadi lebih banyak", "bobot": {"Ekonomi & Bisnis": 3}},
  {"teks": "Dipakai bareng orang lain, atau disumbangkan", "bobot": {"Sosial & Humaniora": 2, "Kesehatan": 1}}
]'::jsonb),

(7, 'Soal yang jawabannya belum ketemu sampai berjam-jam. Kamu?', '[
  {"teks": "Terus dicoba sampai dapat, memang penasaran", "bobot": {"Sains": 3}},
  {"teks": "Ganti cara, cari jalan lain yang lebih praktis", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Diskusi dengan orang lain, biasanya ketemu di situ", "bobot": {"Sosial & Humaniora": 3}},
  {"teks": "Lihat dulu seberapa penting, jangan habis waktu", "bobot": {"Ekonomi & Bisnis": 3}}
]'::jsonb),

(8, 'Tontonan atau bacaan yang paling sering kamu buka sendiri?', '[
  {"teks": "Cara kerja mesin, bangunan, atau teknologi", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Tubuh manusia, penyakit, obat", "bobot": {"Kesehatan": 3}},
  {"teks": "Alam semesta, hewan, percobaan ilmiah", "bobot": {"Sains": 3}},
  {"teks": "Berita, politik, cerita orang, budaya", "bobot": {"Sosial & Humaniora": 3}}
]'::jsonb),

(9, 'Kalau harus memilih kerja seharian, mana yang paling tahan kamu jalani?', '[
  {"teks": "Di depan layar atau alat, menyelesaikan sesuatu yang rumit", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Berhadapan dengan orang yang butuh dibantu", "bobot": {"Kesehatan": 2, "Sosial & Humaniora": 1}},
  {"teks": "Di laboratorium, mengulang percobaan sampai yakin", "bobot": {"Sains": 3}},
  {"teks": "Bertemu banyak pihak, negosiasi, mengatur", "bobot": {"Ekonomi & Bisnis": 3}}
]'::jsonb),

(10, 'Hal yang bikin kamu paling puas setelah selesai?', '[
  {"teks": "Ada barang jadi yang bisa dipegang atau dipakai", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Ada yang keadaannya jadi lebih baik karena aku", "bobot": {"Kesehatan": 3}},
  {"teks": "Akhirnya paham sesuatu yang sebelumnya tidak jelas", "bobot": {"Sains": 3}},
  {"teks": "Angkanya naik, atau hasilnya terukur", "bobot": {"Ekonomi & Bisnis": 3}}
]'::jsonb),

(11, 'Di kelas, peran yang biasanya jatuh ke kamu?', '[
  {"teks": "Yang dimintai tolong kalau ada yang error atau macet", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Yang dicari kalau ada yang sakit atau butuh ditemani", "bobot": {"Kesehatan": 3}},
  {"teks": "Yang menengahi kalau ada yang berselisih", "bobot": {"Sosial & Humaniora": 3}},
  {"teks": "Yang pegang uang kas dan catatannya", "bobot": {"Ekonomi & Bisnis": 3}}
]'::jsonb),

(12, 'Cara kamu belajar yang paling nempel?', '[
  {"teks": "Langsung dicoba, salah dulu tidak masalah", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Dibaca teorinya dulu sampai paham urutannya", "bobot": {"Sains": 2, "Kesehatan": 1}},
  {"teks": "Dijelaskan ke orang lain, baru aku sendiri paham", "bobot": {"Sosial & Humaniora": 3}},
  {"teks": "Dibuat ringkasan, tabel, atau hitungan", "bobot": {"Ekonomi & Bisnis": 2, "Sains": 1}}
]'::jsonb),

(13, 'Ada kabar penyakit menyebar di daerahmu. Yang pertama kamu lakukan?', '[
  {"teks": "Cari tahu gejalanya dan cara mencegahnya", "bobot": {"Kesehatan": 3}},
  {"teks": "Cek sumber datanya, jangan asal percaya", "bobot": {"Sains": 3}},
  {"teks": "Sebarkan info yang benar ke orang sekitar", "bobot": {"Sosial & Humaniora": 3}},
  {"teks": "Pikirkan dampaknya ke sekolah dan usaha orang", "bobot": {"Ekonomi & Bisnis": 3}}
]'::jsonb),

(14, 'Kalau disuruh memilih mata lomba, kamu ambil yang mana?', '[
  {"teks": "Robotik, coding, atau jembatan dari stik es krim", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Olimpiade Biologi atau Kimia", "bobot": {"Kesehatan": 2, "Sains": 1}},
  {"teks": "Olimpiade Fisika atau Matematika", "bobot": {"Sains": 2, "Teknik & Rekayasa": 1}},
  {"teks": "Debat, esai, atau karya tulis", "bobot": {"Sosial & Humaniora": 3}}
]'::jsonb),

(15, 'Mana yang lebih sering bikin kamu kesal?', '[
  {"teks": "Alat atau sistem yang jelas-jelas bisa dibuat lebih baik", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Orang yang menderita padahal sebenarnya bisa dibantu", "bobot": {"Kesehatan": 3}},
  {"teks": "Kesimpulan yang diambil tanpa bukti", "bobot": {"Sains": 3}},
  {"teks": "Keputusan tidak adil yang dibiarkan saja", "bobot": {"Sosial & Humaniora": 3}}
]'::jsonb),

(16, 'Diberi modal kecil dan waktu sebulan. Kamu pakai untuk?', '[
  {"teks": "Bikin prototipe barang yang belum ada", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Jalankan usaha kecil, lihat bisa jalan atau tidak", "bobot": {"Ekonomi & Bisnis": 3}},
  {"teks": "Bikin program bantuan untuk orang sekitar", "bobot": {"Sosial & Humaniora": 2, "Kesehatan": 1}},
  {"teks": "Lakukan percobaan untuk menjawab satu pertanyaan", "bobot": {"Sains": 3}}
]'::jsonb),

(17, 'Yang lebih kamu percaya saat mengambil keputusan?', '[
  {"teks": "Angka dan data", "bobot": {"Sains": 2, "Ekonomi & Bisnis": 1}},
  {"teks": "Pengalaman mencoba sendiri", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Cerita dan keadaan orang yang terlibat", "bobot": {"Sosial & Humaniora": 3}},
  {"teks": "Prosedur dan panduan yang sudah terbukti", "bobot": {"Kesehatan": 3}}
]'::jsonb),

(18, 'Suasana kerja yang bikin kamu paling hidup?', '[
  {"teks": "Tenang, fokus, boleh lama-lama di satu hal", "bobot": {"Sains": 3}},
  {"teks": "Cepat, banyak kejadian, harus sigap", "bobot": {"Kesehatan": 3}},
  {"teks": "Ramai orang, banyak ngobrol", "bobot": {"Sosial & Humaniora": 2, "Ekonomi & Bisnis": 1}},
  {"teks": "Ada target jelas dan hasilnya kelihatan", "bobot": {"Teknik & Rekayasa": 2, "Ekonomi & Bisnis": 1}}
]'::jsonb),

(19, 'Kalau ada satu masalah di Indonesia yang ingin kamu ikut selesaikan?', '[
  {"teks": "Infrastruktur, energi, transportasi", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Layanan kesehatan yang belum merata", "bobot": {"Kesehatan": 3}},
  {"teks": "Pendidikan dan kesenjangan sosial", "bobot": {"Sosial & Humaniora": 3}},
  {"teks": "Lapangan kerja dan ekonomi daerah", "bobot": {"Ekonomi & Bisnis": 3}}
]'::jsonb),

(20, 'Terakhir. Lima tahun dari sekarang, kamu paling ingin dikenal sebagai?', '[
  {"teks": "Orang yang bisa membuat dan membetulkan apa saja", "bobot": {"Teknik & Rekayasa": 3}},
  {"teks": "Orang yang bisa diandalkan saat ada yang sakit", "bobot": {"Kesehatan": 3}},
  {"teks": "Orang yang paham dan bisa menjelaskan", "bobot": {"Sains": 2, "Sosial & Humaniora": 1}},
  {"teks": "Orang yang bisa menggerakkan dan mengatur", "bobot": {"Ekonomi & Bisnis": 3}}
]'::jsonb);

-- Soal dicocokkan berdasarkan teksnya, bukan id, supaya berkas ini bisa
-- dijalankan berulang tanpa menduplikasi dan tanpa mengacak id yang mungkin
-- sudah dirujuk quiz_attempts.jawaban.
insert into quiz_questions (teks, urutan, aktif)
select s.teks, s.urutan, true
from soal_sementara s
where not exists (select 1 from quiz_questions q where q.teks = s.teks);

update quiz_questions q
set urutan = s.urutan, aktif = true
from soal_sementara s
where q.teks = s.teks and q.urutan <> s.urutan;

insert into quiz_options (question_id, teks, bobot, urutan)
select q.id, o.teks, o.bobot, o.urutan
from soal_sementara s
join quiz_questions q on q.teks = s.teks
cross join lateral (
  select (e.value ->> 'teks')      as teks,
         (e.value -> 'bobot')      as bobot,
         (e.ordinality)::int       as urutan
  from jsonb_array_elements(s.opsi) with ordinality e(value, ordinality)
) o
where not exists (
  select 1 from quiz_options x where x.question_id = q.id and x.teks = o.teks
);

-- -----------------------------------------------------------------------------
-- 2. Misi
--
-- tipe MANUAL berarti diselesaikan lewat POST /missions/selesai. Kolom target
-- tidak dibaca kode mana pun saat ini; isinya untuk panitia, supaya syaratnya
-- tercatat di satu tempat dan tidak cuma ada di kepala orang.
-- -----------------------------------------------------------------------------

insert into missions (nama, deskripsi, tipe, target, xp, aktif)
select v.nama, v.deskripsi, v.tipe, v.target::jsonb, v.xp, true
from (values
  ('Hadir dan Absen',
   'Lakukan check-in di meja registrasi. Ini yang pertama, dan paling mudah.',
   'MANUAL', '{"syarat": "check_in", "jumlah": 1}', 25),

  ('Jelajah Lima Kampus',
   'Scan QR di lima booth kampus yang berbeda.',
   'MANUAL', '{"syarat": "scan_booth", "booth_type": "KAMPUS", "jumlah": 5}', 75),

  ('Keliling Semua Booth Kampus',
   'Scan QR di semua booth kampus yang buka hari itu.',
   'MANUAL', '{"syarat": "scan_booth", "booth_type": "KAMPUS", "jumlah": "semua"}', 150),

  ('Kenali Tiga Jurusan',
   'Kunjungi tiga booth jurusan dan dengarkan penjelasannya sampai habis.',
   'MANUAL', '{"syarat": "scan_booth", "booth_type": "JURUSAN", "jumlah": 3}', 60),

  ('Kenali Dirimu',
   'Selesaikan kuis minat dan bakat.',
   'OTOMATIS_KUIS', '{"syarat": "selesai_kuis", "jumlah": 1}', 100),

  ('Tanya Satu Alumni',
   'Ajukan minimal satu pertanyaan ke alumni di booth, lalu minta dia menandai misimu.',
   'MANUAL', '{"syarat": "verifikasi_alumni", "jumlah": 1}', 50),

  ('Ikut Sesi Utama',
   'Hadiri sesi talkshow atau seminar utama sampai selesai.',
   'MANUAL', '{"syarat": "hadir_sesi", "jumlah": 1}', 40),

  ('Datang Dua Hari',
   'Check-in di dua hari acara yang berbeda.',
   'MANUAL', '{"syarat": "check_in_hari_berbeda", "jumlah": 2}', 80)
) as v(nama, deskripsi, tipe, target, xp)
where not exists (select 1 from missions m where m.nama = v.nama);

-- -----------------------------------------------------------------------------
-- 3. Achievement
--
-- kode yang dipakai sebagai kunci, nama untuk ditampilkan. Dicocokkan dengan
-- kode supaya namanya boleh diganti panitia tanpa membuat baris kembar.
-- -----------------------------------------------------------------------------

insert into achievements (kode, nama, deskripsi, syarat, aktif)
select v.kode, v.nama, v.deskripsi, v.syarat::jsonb, true
from (values
  ('HADIR_PERTAMA',   'Langkah Pertama',    'Check-in pertamamu di CGTK.',                           '{"syarat": "check_in", "jumlah": 1}'),
  ('PENJELAJAH',      'Penjelajah',         'Mengunjungi sepuluh booth berbeda.',                    '{"syarat": "scan_booth_unik", "jumlah": 10}'),
  ('TAHU_ARAH',       'Tahu Arah',          'Menyelesaikan kuis minat dan bakat.',                   '{"syarat": "selesai_kuis", "jumlah": 1}'),
  ('KOLEKTOR_MISI',   'Kolektor Misi',      'Menyelesaikan lima misi.',                              '{"syarat": "misi_selesai", "jumlah": 5}'),
  ('TUNTAS',          'Tuntas',             'Menyelesaikan semua misi yang aktif.',                  '{"syarat": "misi_selesai", "jumlah": "semua"}'),
  ('SETIA',           'Setia',              'Hadir di dua hari acara yang berbeda.',                 '{"syarat": "check_in_hari_berbeda", "jumlah": 2}'),
  ('BANYAK_TANYA',    'Banyak Tanya',       'Bertanya ke lima alumni yang berbeda.',                 '{"syarat": "verifikasi_alumni", "jumlah": 5}'),
  ('LIMA_BESAR',      'Lima Besar',         'Masuk lima teratas papan peringkat.',                   '{"syarat": "peringkat_maksimal", "nilai": 5}'),
  ('PAGI_SEKALI',     'Pagi Sekali',        'Check-in dalam tiga puluh menit pertama acara dibuka.',  '{"syarat": "check_in_awal_menit", "nilai": 30}'),
  ('LENGKAP_RUMPUN',  'Lintas Rumpun',      'Mengunjungi booth dari kelima rumpun jurusan.',          '{"syarat": "rumpun_unik", "jumlah": 5}')
) as v(kode, nama, deskripsi, syarat)
where not exists (select 1 from achievements a where a.kode = v.kode);

-- -----------------------------------------------------------------------------
-- 4. Kosmetik
--
-- Hadiah yang tidak memberi keuntungan apa pun selain tampilan. Syaratnya
-- level, atau masuk lima belas besar. Yang syarat_top15 true hanya terbuka
-- untuk lima belas teratas, dan sengaja tetap kelihatan oleh semua orang
-- dalam keadaan terkunci: itu bagian dari alasan orang mau mengejarnya.
-- -----------------------------------------------------------------------------

insert into cosmetics (tipe, nama, nilai, syarat_level, syarat_top15, aktif)
select v.tipe, v.nama, v.nilai, v.syarat_level, v.syarat_top15, true
from (values
  ('WARNA_NAMA', 'Putih',            '#ffffff', 1,    false),
  ('WARNA_NAMA', 'Biru Navy',        '#1b3a5c', 2,    false),
  ('WARNA_NAMA', 'Magenta',          '#c2185b', 3,    false),
  ('WARNA_NAMA', 'Oranye',           '#f57c00', 4,    false),
  ('WARNA_NAMA', 'Emas',             '#d4af37', null, true),
  ('BINGKAI',    'Bingkai Polos',    'polos',   1,    false),
  ('BINGKAI',    'Bingkai Garis',    'garis',   3,    false),
  ('BINGKAI',    'Bingkai Berukir',  'ukir',    5,    false),
  ('BINGKAI',    'Bingkai Emas',     'emas',    null, true),
  ('BACKGROUND', 'Polos Terang',     'terang',  1,    false),
  ('BACKGROUND', 'Polos Gelap',      'gelap',   2,    false),
  ('BACKGROUND', 'Gradasi Senja',    'senja',   4,    false),
  ('BACKGROUND', 'Gradasi Juara',    'juara',   null, true)
) as v(tipe, nama, nilai, syarat_level, syarat_top15)
where not exists (
  select 1 from cosmetics c where c.tipe = v.tipe and c.nama = v.nama
);

commit;

-- -----------------------------------------------------------------------------
-- Periksa hasilnya, dan periksa yang paling mudah salah: kunci bobot yang
-- tidak cocok dengan majors.rumpun. Kalau baris "bobot tak dikenali" bukan
-- nol, rekomendasi jurusan untuk rumpun itu akan selalu kosong.
-- -----------------------------------------------------------------------------

select 'soal kuis' as apa, count(*)::text as jumlah from quiz_questions where aktif
union all select 'opsi kuis',   count(*)::text from quiz_options
union all select 'misi',        count(*)::text from missions where aktif
union all select 'achievement', count(*)::text from achievements where aktif
union all select 'kosmetik',    count(*)::text from cosmetics where aktif
union all select 'soal tanpa 4 opsi', count(*)::text from (
  select question_id from quiz_options group by 1 having count(*) <> 4
) t
union all select 'bobot tak dikenali', count(*)::text from (
  select distinct k from quiz_options o, jsonb_object_keys(o.bobot) k
  where k not in (select distinct rumpun from majors where rumpun is not null)
) t;
