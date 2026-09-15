/**
 * Error catalogue.
 *
 * Every message here is written to be read by a committee member standing at a
 * gate with a queue behind them — not by a developer. The frontend displays
 * `pesan` verbatim; translating it a second time only creates two versions of
 * the same sentence.
 */

export const ERRORS = {
  // --- auth ---
  TOKEN_KEDALUWARSA:      { status: 401, pesan: 'Sesi login habis, silakan masuk lagi' },
  TIDAK_LOGIN:            { status: 401, pesan: 'Kamu belum masuk' },
  TIDAK_BERHAK:           { status: 403, pesan: 'Kamu tidak punya akses ke bagian ini' },
  AKUN_DINONAKTIFKAN:     { status: 403, pesan: 'Akun ini dinonaktifkan' },
  KODE_GOOGLE_TIDAK_VALID:{ status: 400, pesan: 'Login Google gagal, coba lagi' },

  // --- registration & payment ---
  SUDAH_DAFTAR:           { status: 409, pesan: 'Kamu sudah terdaftar' },
  PENDAFTARAN_DITUTUP:    { status: 423, pesan: 'Pendaftaran sudah ditutup' },
  PROFIL_BELUM_LENGKAP:   { status: 403, pesan: 'Lengkapi profilmu dulu' },
  FIELD_WAJIB_KOSONG:     { status: 400, pesan: 'Masih ada isian wajib yang kosong' },
  BATAS_EDIT_HABIS:       { status: 403, pesan: 'Batas mengubah profil sudah habis' },
  FIELD_TIDAK_BOLEH_DIEDIT:{status: 403, pesan: 'Isian ini tidak bisa diubah sendiri' },
  KODE_TIDAK_DITEMUKAN:   { status: 404, pesan: 'Kode registrasi tidak ditemukan' },
  SUDAH_LUNAS:            { status: 409, pesan: 'Pendaftaran ini sudah ditandai lunas' },
  BELUM_BAYAR:            { status: 402, pesan: 'Peserta belum menyelesaikan pembayaran' },
  ALASAN_WAJIB:           { status: 400, pesan: 'Alasan wajib diisi' },
  LINK_BELUM_DIATUR:      { status: 503, pesan: 'Panitia belum mengatur cara pembayaran' },

  // --- QR & scanning ---
  QR_TIDAK_VALID:         { status: 400, pesan: 'QR tidak dikenali' },
  QR_TIDAK_DIKENAL:       { status: 404, pesan: 'QR tidak terdaftar di sistem' },
  SUDAH_SCAN:             { status: 409, pesan: 'Sudah presensi di sesi ini' },
  SESI_DITUTUP:           { status: 423, pesan: 'Sesi belum dibuka atau sudah ditutup' },
  SESI_TIDAK_DITEMUKAN:   { status: 404, pesan: 'Sesi tidak ditemukan' },

  // --- booth ---
  SUDAH_AMBIL_POIN:       { status: 409, pesan: 'Peserta sudah mengambil poin di booth ini' },
  BOOTH_DITUTUP:          { status: 423, pesan: 'Booth sudah ditutup' },
  BOOTH_BELUM_DIBUKA:     { status: 423, pesan: 'Booth ini belum dibuka panitia' },
  BOOTH_TIDAK_DITEMUKAN:  { status: 404, pesan: 'Booth tidak ditemukan' },
  BUKAN_BOOTH_ANDA:       { status: 403, pesan: 'Kamu tidak bertugas di booth ini' },
  BUKAN_ALUMNI:           { status: 403, pesan: 'Akun ini bukan alumni booth' },
  BUKAN_PESERTA:          { status: 403, pesan: 'Bagian ini hanya untuk peserta' },
  XP_MELEBIHI_BATAS:      { status: 422, pesan: 'XP melebihi batas booth' },

  // --- materials ---
  TIPE_FILE_DITOLAK:      { status: 400, pesan: 'File PPT tidak bisa diunggah. Simpan sebagai PDF dulu, atau taruh link Google Drive-nya.' },
  FILE_TERLALU_BESAR:     { status: 400, pesan: 'Ukuran maksimal 10 MB. Coba taruh link Google Drive saja.' },
  BATAS_MATERI_TERCAPAI:  { status: 409, pesan: 'Maksimal 5 materi per booth/kampus' },

  // --- layanan kuis & gamifikasi (Danar) ---
  LAYANAN_BELUM_SIAP:     { status: 503, pesan: 'Fitur ini belum dinyalakan panitia' },
  LAYANAN_TIDAK_MERESPONS:{ status: 503, pesan: 'Fitur ini sedang tidak bisa dihubungi, coba sebentar lagi' },

  // --- quiz & leaderboard ---
  KUIS_HABIS:             { status: 409, pesan: 'Percobaan kuis sudah habis' },
  LEADERBOARD_BEKU:       { status: 423, pesan: 'Papan peringkat sudah dibekukan' },
  BELUM_DIBEKUKAN:        { status: 409, pesan: 'Bekukan papan peringkat dulu' },
  SUDAH_DIBEKUKAN:        { status: 409, pesan: 'Papan peringkat sudah dibekukan sebelumnya' },
  SUDAH_DISAHKAN:         { status: 409, pesan: 'Pemenang sudah disahkan' },

  // --- form builder ---
  KUNCI_SUDAH_DIPAKAI:    { status: 409, pesan: 'Kunci ini sudah dipakai field lain' },
  KUNCI_TIDAK_VALID:      { status: 400, pesan: 'Kunci harus huruf kecil dan garis bawah' },
  OPSI_KOSONG:            { status: 400, pesan: 'Field pilihan harus punya daftar opsi' },

  // --- alumni invitation ---
  EMAIL_SUDAH_DIUNDANG:   { status: 409, pesan: 'Email ini sudah ada di daftar undangan' },
  EMAIL_SUDAH_PESERTA:    { status: 409, pesan: 'Email ini sudah punya akun peserta' },
  SUDAH_DITUGASKAN:       { status: 409, pesan: 'LO ini sudah ditugaskan ke alumni tersebut' },
  BUKAN_LO:               { status: 400, pesan: 'Akun ini bukan LO' },
  ALUMNI_TIDAK_DITEMUKAN: { status: 404, pesan: 'Alumni tidak ditemukan' },

  // --- generic ---
  TIDAK_DITEMUKAN:        { status: 404, pesan: 'Data tidak ditemukan' },
  DATA_TIDAK_VALID:       { status: 400, pesan: 'Data yang dikirim tidak valid' },
  TERLALU_SERING:         { status: 429, pesan: 'Terlalu banyak permintaan, tunggu sebentar' },
  ERROR_SERVER:           { status: 500, pesan: 'Terjadi kesalahan di server' },
} as const;

export type KodeError = keyof typeof ERRORS;

export class AppError extends Error {
  constructor(
    public readonly kode: KodeError,
    public readonly detail?: unknown,
    pesanKhusus?: string,
  ) {
    super(pesanKhusus ?? ERRORS[kode].pesan);
    this.name = 'AppError';
  }

  get status(): number {
    return ERRORS[this.kode].status;
  }

  toJSON() {
    return {
      sukses: false,
      error: {
        kode: this.kode,
        pesan: this.message,
        ...(this.detail !== undefined ? { detail: this.detail } : {}),
      },
    };
  }
}

/** Throws the matching AppError when a database function reports failure. */
export function pastikanSukses(hasil: {
  sukses?: boolean;
  kode?: string;
  pesan?: string;
  data?: unknown;
}): void {
  if (hasil?.sukses) return;
  const kode = (hasil?.kode ?? 'ERROR_SERVER') as KodeError;
  if (!(kode in ERRORS)) {
    throw new AppError('ERROR_SERVER', { kode_asli: hasil?.kode, pesan: hasil?.pesan });
  }
  throw new AppError(kode, hasil?.data, hasil?.pesan);
}
