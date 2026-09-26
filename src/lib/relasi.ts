/**
 * Membaca relasi yang ditempelkan PostgREST.
 *
 * PERSOALANNYA
 *
 * Bentuk jawaban PostgREST untuk relasi yang ditempelkan berubah tergantung
 * kardinalitasnya, dan perubahannya tidak kelihatan dari kode kueri:
 *
 *   users(id, participants(id))
 *     participants.user_id UNIQUE  ->  "participants": { "id": "..." }     objek
 *     tanpa UNIQUE                 ->  "participants": [ { "id": "..." } ] array
 *
 * Jadi `data.participants?.[0]?.id` bekerja pada tabel yang satu ke banyak dan
 * diam-diam menghasilkan `undefined` pada tabel yang satu ke satu. TypeScript
 * tidak menolongnya sama sekali, karena tipenya kita tulis sendiri lewat
 * `as unknown as`, dan tipe yang kita karang itu yang dipercaya.
 *
 * Akibatnya waktu ditemukan: participantId dan representativeId selalu
 * undefined, sehingga setiap endpoint milik peserta menjawab 403 atau 404, dan
 * seluruh scanner alumni menolak alumninya sendiri dengan BUKAN_ALUMNI.
 * Tidak satu pun tes menangkapnya, karena tidak ada tes yang memanggil endpoint.
 *
 * Fungsi di bawah ini menerima dua-duanya, jadi masalah yang sama tidak bisa
 * kembali kalau suatu saat ada kolom UNIQUE ditambah atau dibuang.
 */

/** Ambil satu baris dari relasi yang ditempelkan, apa pun bentuknya. */
export function satu<T>(nilai: unknown): T | undefined {
  if (nilai === null || nilai === undefined) return undefined;
  if (Array.isArray(nilai)) return nilai[0] as T | undefined;
  return nilai as T;
}

/** Ambil semua baris dari relasi yang ditempelkan, apa pun bentuknya. */
export function banyak<T>(nilai: unknown): T[] {
  if (nilai === null || nilai === undefined) return [];
  if (Array.isArray(nilai)) return nilai as T[];
  return [nilai as T];
}

/** Ambil satu bidang dari relasi yang ditempelkan. */
export function bidang<T>(nilai: unknown, nama: string): T | undefined {
  const baris = satu<Record<string, unknown>>(nilai);
  return baris?.[nama] as T | undefined;
}
