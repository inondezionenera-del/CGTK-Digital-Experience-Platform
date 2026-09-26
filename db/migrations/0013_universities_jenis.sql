-- =============================================================================
-- 0013 — Kolom `jenis` di universities
-- =============================================================================
--
-- KENAPA
--
-- Lembar tugas RIJAL menggambar halaman direktori dengan empat tombol saring:
--
--   [ Semua ]  [ Negeri ]  [ Swasta ]  [ Rumpun ▼ ]
--
-- Dua di tengah tidak punya sumber data. Tabel universities cuma menyimpan
-- nama, singkatan, logo, kota, akreditasi, website, dan warna khas. Tidak ada
-- kolom yang memberi tahu kampus itu negeri atau swasta, jadi tombolnya akan
-- selalu kosong.
--
-- Rijal sudah membuat tombolnya, persis seperti gambar yang diberikan. Yang
-- salah gambarnya, bukan dia. Jadi kolomnya yang ditambah, bukan janjinya yang
-- ditarik.
--
-- Rumpun tidak perlu kolom baru: dia sudah ada di tabel majors, dan kampus
-- dihubungkan ke jurusan lewat university_majors. Penyaringannya dikerjakan di
-- Worker, karena PostgREST tidak enak dipakai untuk "kampus yang punya minimal
-- satu jurusan di rumpun ini".
--
-- KENAPA BOLEH KOSONG
--
-- Kolomnya dibuat nullable dengan sengaja. Yang mengisi data kampus nanti
-- Divisi Acara, dan memaksa mereka menentukan negeri atau swasta untuk tiap
-- baris cuma akan membuat mereka mengarang jawabannya. Kampus yang jenisnya
-- belum diisi tetap tampil di tombol "Semua", cuma tidak muncul waktu disaring.
-- =============================================================================

alter table universities
  add column if not exists jenis text;

-- KEDINASAN ikut dimasukkan karena STAN, IPDN, dan sekolah kedinasan lain
-- bukan negeri biasa dan bukan swasta, dan anak SMA justru sering menanyakannya.
-- Menambahkan nilainya sekarang jauh lebih murah daripada mengubah check
-- constraint setelah datanya terisi.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'universities_jenis_check'
  ) then
    alter table universities
      add constraint universities_jenis_check
      check (jenis is null or jenis in ('NEGERI', 'SWASTA', 'KEDINASAN'));
  end if;
end $$;

-- Dipakai tiap kali halaman direktori disaring, dan halaman itu yang paling
-- sering dibuka peserta sebelum hari acara.
create index if not exists universities_jenis_idx on universities (jenis)
  where jenis is not null;

comment on column universities.jenis is
  'NEGERI, SWASTA, atau KEDINASAN. Boleh kosong: Divisi Acara belum tentu tahu '
  'waktu memasukkan kampusnya. Yang kosong tetap tampil di daftar, cuma tidak '
  'ikut waktu disaring.';

-- -----------------------------------------------------------------------------
-- Isi untuk kampus yang sudah ada.
--
-- Hanya menyentuh baris yang jenisnya masih kosong, jadi aman dijalankan ulang
-- dan tidak pernah menimpa isian Divisi Acara.
-- -----------------------------------------------------------------------------
update universities u set jenis = v.jenis
from (values
  ('ITB',   'NEGERI'),
  ('ITS',   'NEGERI'),
  ('UI',    'NEGERI'),
  ('UGM',   'NEGERI'),
  ('UNAIR', 'NEGERI'),
  ('UB',    'NEGERI'),
  ('UNEJ',  'NEGERI'),
  ('UNESA', 'NEGERI'),
  ('UTM',   'NEGERI'),
  ('UNPAD', 'NEGERI'),
  ('UNDIP', 'NEGERI'),
  ('TELU',  'SWASTA')
) as v(singkatan, jenis)
where u.singkatan = v.singkatan and u.jenis is null;
