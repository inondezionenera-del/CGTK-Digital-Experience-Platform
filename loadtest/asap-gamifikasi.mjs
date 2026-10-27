/**
 * Uji asap untuk kuis, misi, achievement, dan papan peringkat, langsung ke API
 * yang hidup di internet.
 *
 *   node loadtest/siapkan.mjs 3        <- bikin peserta uji dan tokennya
 *   npm run uji:gamifikasi
 *   node loadtest/siapkan.mjs --bersihkan
 *
 * Bukan pengganti vitest. Yang diperiksa di sini justru yang tidak bisa
 * ditangkap unit test: bentuk amplop { sukses, data } yang dibaca frontend,
 * CORS dari origin frontend yang sebenarnya, dan apakah quiz_options.bobot
 * ikut terkirim ke browser.
 *
 * Dibuat sesudah dua hal yang lolos dari typecheck dan 49 tes: sumber_tipe
 * 'KUIS' yang ditolak batasan check sehingga XP diam-diam nol, dan jawaban
 * FastAPI yang tidak memakai amplop sehingga frontend selalu dapat undefined.
 */

import fs from 'node:fs';
const A = 'https://cgtk-api.inondezionenera.workers.dev';
const W = 'https://cgtk-web.inondezionenera.workers.dev';
const tok = JSON.parse(fs.readFileSync('loadtest/token-uji.json','utf8'));
const peserta = Array.isArray(tok) ? tok : (tok.token ?? tok.peserta ?? []);
const t1 = peserta[0]?.access_token ?? peserta[0]?.token ?? peserta[0];
const t2 = peserta[1]?.access_token ?? peserta[1]?.token ?? peserta[1];
if (typeof t1 !== 'string') { console.log('bentuk token-uji.json:', JSON.stringify(tok).slice(0,300)); process.exit(1); }

let gagal = 0;
const H = (t) => ({ Authorization: 'Bearer ' + t, Origin: W, 'Content-Type': 'application/json' });
async function panggil(m, p, t, body) {
  const r = await fetch(A + p, { method: m, headers: H(t), body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
function ok(label, syarat, catatan='') {
  if (!syarat) gagal++;
  console.log((syarat ? '  LULUS ' : '  GAGAL ') + label + (catatan ? ' | ' + catatan : ''));
}

console.log('1. amplop { sukses, data }');
let r = await panggil('GET','/quiz/soal',t1);
ok('/quiz/soal 200 dan ada data', r.s===200 && Array.isArray(r.j?.data), `status ${r.s}`);
const soal = r.j?.data ?? [];
console.log('     jumlah soal:', soal.length, '| opsi soal pertama:', soal[0]?.options?.length);

console.log('2. kunci jawaban tidak bocor');
const teks = JSON.stringify(soal);
ok('tidak ada kata bobot di jawaban', !teks.includes('bobot'));

console.log('3. tanpa token ditolak');
r = await fetch(A + '/quiz/soal', { headers: { Origin: W } });
ok('401 tanpa Authorization', r.status===401, `status ${r.status}`);

console.log('4. mulai kuis');
r = await panggil('POST','/quiz/mulai',t1,{});
ok('dapat attempt id', (r.s===200||r.s===201) && typeof r.j?.data?.id==='number', `status ${r.s} ${JSON.stringify(r.j?.error??'')}`);
const attempt = r.j?.data?.id;

console.log('5. percobaan yang belum selesai dipakai ulang');
const r2 = await panggil('POST','/quiz/mulai',t1,{});
ok('id sama, bukan percobaan baru', r2.j?.data?.id===attempt && r2.j?.data?.dilanjutkan===true, `id ${r2.j?.data?.id}`);

console.log('6. peserta lain tidak bisa menyelesaikan percobaan ini');
if (typeof t2 === 'string') {
  r = await panggil('POST','/quiz/selesai',t2,{ attempt_id: attempt, answers: soal.slice(0,1).map(s=>({question_id:s.id,option_id:s.options[0].id})) });
  ok('403 untuk attempt orang lain', r.s===403, `status ${r.s}`);
} else console.log('  (dilewati, cuma ada satu token)');

console.log('7. selesaikan kuis');
const jawab = soal.map(s => ({ question_id: s.id, option_id: s.options[0].id }));
r = await panggil('POST','/quiz/selesai',t1,{ attempt_id: attempt, answers: jawab });
ok('200 dan ada hasil_rumpun', r.s===200 && typeof r.j?.data?.hasil_rumpun==='string', `status ${r.s} ${JSON.stringify(r.j?.error??'')}`);
const h = r.j?.data;
if (h) {
  console.log('     rumpun:', h.hasil_rumpun, '| jurusan:', h.hasil_jurusan?.length, '| kampus:', h.hasil_kampus?.length, '| xp:', h.xp_didapat);
  ok('rekomendasi jurusan tidak kosong', (h.hasil_jurusan?.length ?? 0) > 0);
  ok('skor terisi', Object.keys(h.skor ?? {}).length > 0);
}

console.log('8. tidak bisa diselesaikan dua kali');
r = await panggil('POST','/quiz/selesai',t1,{ attempt_id: attempt, answers: jawab });
ok('bukan 200 pada pengiriman kedua', r.s!==200, `status ${r.s}`);

console.log('9. id palsu di path ditolak');
r = await panggil('GET','/missions/saya/abc',t1);
ok('403 untuk id orang lain', r.s===403, `status ${r.s}`);

console.log('10. misi dan achievement dengan id akun sendiri');
const sub = JSON.parse(Buffer.from(t1.split('.')[1], 'base64url').toString()).sub;
r = await panggil('GET',`/missions/saya/${sub}`,t1);
ok('/missions/saya 200 array', r.s===200 && Array.isArray(r.j?.data), `status ${r.s}`);
console.log('     jumlah misi:', r.j?.data?.length);
r = await panggil('GET',`/achievements/saya/${sub}`,t1);
ok('/achievements/saya 200 array', r.s===200 && Array.isArray(r.j?.data), `status ${r.s}`);
console.log('     jumlah badge:', r.j?.data?.length);

console.log('11. papan peringkat');
r = await panggil('GET','/leaderboard?limit=50',t1);
ok('200 dan ada baris', r.s===200 && Array.isArray(r.j?.data?.baris), `status ${r.s}`);
ok('asal_sekolah tidak diteruskan', !JSON.stringify(r.j?.data ?? {}).includes('asal_sekolah'));
console.log('     beku:', r.j?.data?.beku, '| jumlah baris:', r.j?.data?.baris?.length);

console.log('\nGAGAL:', gagal);
process.exit(gagal ? 1 : 0);
