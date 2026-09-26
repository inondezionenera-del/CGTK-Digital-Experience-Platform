/* =============================================================================
   Uji beban CGTK 2027, 9 skenario.

   JALANKAN:
     node loadtest/siapkan.mjs                      # sekali, bikin 200 akun uji
     k6 run --env BASE=http://127.0.0.1:8787/api/v1 --env S=gate_scan loadtest/cgtk.js
     k6 run --env BASE=https://....workers.dev/api/v1 loadtest/cgtk.js
     node loadtest/siapkan.mjs --bersihkan          # setelah selesai

   Tanpa --env S, semua skenario jalan bersamaan. Itu skenario 9, ujian yang
   sebenarnya, dan yang paling mirip keadaan hari-H.

   YANG BEDA dari skrip di 05-INFRASTRUKTUR.md:

   Skrip di dokumen itu tidak mengirim header Authorization, dan isi QR-nya
   karangan. Akibatnya semua permintaan ditolak di pintu: 401 karena tanpa
   token, atau QR_TIDAK_VALID karena tanda tangannya tidak cocok. Jalur
   penolakan memang selalu cepat, jadi tesnya selalu lulus dan tidak
   membuktikan apa pun. Di sini tokennya sah dan QR-nya benar-benar
   ditandatangani, jadi yang terukur adalah jalur yang dipakai hari-H.
============================================================================= */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE = __ENV.BASE || __ENV.BASE_URL || 'http://127.0.0.1:8787/api/v1';

const TOKEN = JSON.parse(open('./token-uji.json'));
const BAHAN = JSON.parse(open('./qr-uji.json'));
const QR = BAHAN.qr;
const SESSION_ID = BAHAN.session_id;
const BOOTH_ID = BAHAN.booth_id;

const waktuScan = new Trend('waktu_scan', true);
const gagalScan = new Rate('gagal_scan');
const waktuSync = new Trend('waktu_sync', true);
const belumSiap = new Counter('fitur_belum_siap_503');

function kepala(i) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN[i % TOKEN.length]}`,
    },
  };
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* -----------------------------------------------------------------------------
   Skenario.

   startTime dijaga supaya berurutan dan tidak saling menutupi, kecuali yang
   memang sengaja ditumpuk (7 dan 8 dijalankan bersamaan, karena export berat
   di tengah banjir sinkron itu justru keadaan yang mau diuji).
----------------------------------------------------------------------------- */
const SEMUA = {
  // 1. Puncak pagi hari-H. Semua orang menukar token Google jadi identitas.
  login_serentak: {
    executor: 'shared-iterations',
    vus: 200, iterations: 200, maxDuration: '2m',
    exec: 'login', startTime: '0s',
  },

  // 2. Setelah pengumuman, semua orang membuka dashboard sekaligus.
  dashboard: {
    executor: 'constant-vus',
    vus: 200, duration: '3m',
    exec: 'bukaDashboard', startTime: '2m',
  },

  // 3. Antrean pintu masuk. Ini yang menentukan panjang antrean di lapangan.
  gate_scan: {
    executor: 'constant-arrival-rate',
    rate: 15, timeUnit: '1s', duration: '5m',
    preAllocatedVUs: 30, maxVUs: 60,
    exec: 'scanPresensi', startTime: '5m',
  },

  // 4. Sepuluh booth alumni memberi XP bersamaan.
  booth_scan: {
    executor: 'constant-arrival-rate',
    rate: 10, timeUnit: '1s', duration: '5m',
    preAllocatedVUs: 20, maxVUs: 40,
    exec: 'scanBooth', startTime: '5m',
  },

  // 5. Beban terus-menerus sepanjang acara: HP peserta menanyakan pengumuman.
  polling: {
    executor: 'constant-arrival-rate',
    rate: 10, timeUnit: '1s', duration: '12m',
    preAllocatedVUs: 20, maxVUs: 40,
    exec: 'pollPengumuman', startTime: '0s',
  },

  // 6. Halaman yang paling berat dihitung, dibuka banyak orang sekaligus.
  leaderboard: {
    executor: 'constant-vus',
    vus: 200, duration: '3m',
    exec: 'bukaLeaderboard', startTime: '10m',
  },

  // 7. YANG PALING RAWAN. Sinyal venue mati 20 menit lalu pulih, dan semua HP
  //    mengirim tumpukannya bersamaan. Pola beban ini yang paling sering
  //    meruntuhkan sistem, dan paling jarang diuji orang.
  banjir_sync: {
    executor: 'shared-iterations',
    vus: 20, iterations: 40, maxDuration: '3m',
    exec: 'kirimAntreanOffline', startTime: '13m',
  },

  // 8. Export LPJ justru di saat paling sibuk, bukan di saat sepi.
  export_lpj: {
    executor: 'shared-iterations',
    vus: 2, iterations: 2, maxDuration: '3m',
    exec: 'exportLPJ', startTime: '13m',
  },

  // 9. Halaman publik yang dibuka orang sambil menunggu acara mulai.
  halaman_publik: {
    executor: 'constant-arrival-rate',
    rate: 20, timeUnit: '1s', duration: '5m',
    preAllocatedVUs: 25, maxVUs: 50,
    exec: 'halamanPublik', startTime: '7m',
  },
};

const pilih = __ENV.S;
export const options = {
  scenarios: pilih ? { [pilih]: { ...SEMUA[pilih], startTime: '0s' } } : SEMUA,

  thresholds: {
    // Scan itu satu-satunya angka yang benar-benar dirasakan peserta: 800 ms
    // per scan pada 15 scan/detik berarti antreannya jalan terus.
    waktu_scan: ['p(95)<800', 'p(99)<1500'],
    gagal_scan: ['rate<0.01'],

    // Sinkron boleh lambat, tapi tidak boleh gagal. Yang gagal artinya scan
    // seseorang hilang, dan itu tidak bisa diperbaiki setelah acara.
    waktu_sync: ['p(95)<10000'],

    'http_req_failed{scenario:login_serentak}': ['rate<0.02'],
    'http_req_failed{scenario:gate_scan}': ['rate<0.01'],
    'http_req_failed{scenario:banjir_sync}': ['rate<0.01'],
    'http_req_duration{scenario:login_serentak}': ['p(95)<2000'],
    'http_req_duration{scenario:leaderboard}': ['p(95)<1000'],
  },
};

/* -----------------------------------------------------------------------------
   1. Login
----------------------------------------------------------------------------- */
export function login() {
  // Login Google-nya sendiri tidak diuji. Itu punya Google, dan tidak akan
  // tumbang karena 500 anak SMAN 1 Pamekasan. Yang diuji bagian kita: menukar
  // token jadi identitas dan peran, yang dipanggil semua orang pada saat sama.
  const r = http.post(
    `${BASE}/auth/sinkron`,
    JSON.stringify({ access_token: TOKEN[__VU % TOKEN.length] }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(r, { 'login 200': (x) => x.status === 200 });
  sleep(1);
}

/* -----------------------------------------------------------------------------
   2. Dashboard
----------------------------------------------------------------------------- */
export function bukaDashboard() {
  const h = kepala(__VU);
  const hasil = http.batch([
    ['GET', `${BASE}/auth/saya`, null, h],
    ['GET', `${BASE}/events/sessions/live`, null, h],
    ['GET', `${BASE}/attendance/saya`, null, h],
    ['GET', `${BASE}/booths/passport/saya`, null, h],
  ]);

  for (const r of hasil) {
    // 503 berarti layanan Danar belum nyala. Itu bukan kegagalan kita, tapi
    // tetap dihitung supaya kelihatan di laporan.
    if (r.status === 503) belumSiap.add(1);
    check(r, { 'dashboard terjawab': (x) => x.status === 200 || x.status === 503 });
  }

  // Orang tidak memuat ulang terus-menerus. Jeda ini yang membuat angkanya
  // mirip kenyataan, bukan lebih buruk dari kenyataan.
  sleep(Math.random() * 5 + 3);
}

/* -----------------------------------------------------------------------------
   3. Scan presensi
----------------------------------------------------------------------------- */
export function scanPresensi() {
  const i = __ITER % QR.length;
  const mulai = Date.now();

  const r = http.post(
    `${BASE}/attendance/scan`,
    JSON.stringify({
      isi_qr: QR[i],
      session_id: SESSION_ID,
      scan_uuid: uuid(),
      waktu_scan: new Date().toISOString(),
      mode_cepat: true,
    }),
    kepala(__ITER),
  );

  waktuScan.add(Date.now() - mulai);

  // 200 dan 201 jelas benar. 409 juga benar: artinya orang itu sudah pernah
  // scan, dan menolaknya memang tugas sistem. Menghitung 409 sebagai kegagalan
  // akan membuat tes ini merah justru karena aturannya bekerja.
  const ok = [200, 201, 409].includes(r.status);
  gagalScan.add(!ok);
  check(r, {
    'scan terjawab benar': () => ok,
    'scan tidak 5xx': () => r.status < 500,
  });
}

/* -----------------------------------------------------------------------------
   4. Scan booth
----------------------------------------------------------------------------- */
export function scanBooth() {
  const r = http.post(
    `${BASE}/booths/scan`,
    JSON.stringify({
      isi_qr: QR[__ITER % QR.length],
      booth_id: BOOTH_ID,
      jenis: 'HADIR',
      scan_uuid: uuid(),
      waktu_scan: new Date().toISOString(),
    }),
    kepala(__ITER),
  );

  // 403 wajar: token uji perannya PESERTA, bukan alumni. Yang diuji di sini
  // bebannya, bukan hak aksesnya, dan penolakan hak akses tetap menyentuh
  // database untuk memuat peran.
  check(r, { 'booth tidak 5xx': (x) => x.status < 500 });
}

/* -----------------------------------------------------------------------------
   5. Polling pengumuman
----------------------------------------------------------------------------- */
export function pollPengumuman() {
  const sejak = new Date(Date.now() - 60_000).toISOString();
  const r = http.get(`${BASE}/announcements/terbaru?sejak=${sejak}`, kepala(__ITER));

  // 204 itu jawaban yang diharapkan hampir sepanjang hari, dan justru yang
  // paling penting tetap murah. Inilah sebabnya pengumuman tidak pakai Realtime.
  check(r, {
    'polling 200 atau 204': (x) => [200, 204].includes(x.status),
    'polling di bawah 300ms': (x) => x.timings.duration < 300,
  });
}

/* -----------------------------------------------------------------------------
   6. Leaderboard
----------------------------------------------------------------------------- */
export function bukaLeaderboard() {
  const r = http.get(`${BASE}/leaderboard?limit=50`, kepala(__VU));
  if (r.status === 503) belumSiap.add(1);
  check(r, { 'leaderboard terjawab': (x) => x.status === 200 || x.status === 503 });

  // Cache-nya 15 detik. Memanggil lebih rapat dari itu cuma menguji cache,
  // bukan menguji perhitungannya.
  sleep(15);
}

/* -----------------------------------------------------------------------------
   7. Banjir sinkron offline
----------------------------------------------------------------------------- */
export function kirimAntreanOffline() {
  const batch = Array.from({ length: 20 }, (_, i) => ({
    isi_qr: QR[(__VU * 20 + i) % QR.length],
    session_id: SESSION_ID,
    scan_uuid: uuid(),
    waktu_scan: new Date(Date.now() - (20 - i) * 60_000).toISOString(),
  }));

  const mulai = Date.now();
  const r = http.post(
    `${BASE}/attendance/sync/attendance`,
    JSON.stringify({ batch }),
    { ...kepala(__VU), timeout: '60s' },
  );
  waktuSync.add(Date.now() - mulai);

  // Sinkron harus selalu 200, termasuk kalau semua isinya ditolak. Rinciannya
  // ada di dalam badan jawaban. Kalau dia balas 4xx, HP akan mengira
  // kirimannya gagal lalu mengirim ulang selamanya.
  check(r, {
    'sync selalu 200': (x) => x.status === 200,
    'sync ada rincian': (x) => {
      try {
        return Array.isArray(x.json('data.rincian')) || x.json('sukses') === true;
      } catch {
        return false;
      }
    },
  });
}

/* -----------------------------------------------------------------------------
   8. Export LPJ
----------------------------------------------------------------------------- */
export function exportLPJ() {
  const r = http.get(`${BASE}/exports/lpj`, { ...kepala(0), timeout: '180s' });

  // 403 wajar, token uji perannya PESERTA. Yang diuji: apakah permintaan berat
  // ini menjatuhkan yang lain waktu dijalankan di tengah kesibukan.
  check(r, { 'export tidak 5xx': (x) => x.status < 500 });
}

/* -----------------------------------------------------------------------------
   9. Halaman publik
----------------------------------------------------------------------------- */
export function halamanPublik() {
  const hasil = http.batch([
    ['GET', `${BASE}/universities`],
    ['GET', `${BASE}/events`],
    ['GET', `${BASE}/events/sessions`],
    ['GET', `${BASE}/announcements`],
    ['GET', `${BASE}/sponsors`],
    ['GET', `${BASE}/booths`],
  ]);
  for (const r of hasil) {
    check(r, { 'publik 200': (x) => x.status === 200 });
  }
  sleep(2);
}

/* -----------------------------------------------------------------------------
   Ringkasan
----------------------------------------------------------------------------- */
export function handleSummary(data) {
  const m = data.metrics;
  const ambil = (nama, bidang) => {
    const v = m[nama]?.values?.[bidang];
    return v === undefined ? '-' : Math.round(v);
  };

  const baris = [
    '',
    '  ================= RINGKASAN CGTK =================',
    '',
    `  Scan presensi   p95 ${ambil('waktu_scan', 'p(95)')} ms   p99 ${ambil('waktu_scan', 'p(99)')} ms`,
    `  Scan gagal      ${((m.gagal_scan?.values?.rate ?? 0) * 100).toFixed(2)} %`,
    `  Sinkron offline p95 ${ambil('waktu_sync', 'p(95)')} ms`,
    `  Semua permintaan p95 ${ambil('http_req_duration', 'p(95)')} ms`,
    `  Gagal keseluruhan ${((m.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)} %`,
    `  Fitur belum siap (503) ${m.fitur_belum_siap_503?.values?.count ?? 0} kali`,
    '',
    '  Yang perlu dilihat lebih dulu: p95 scan presensi. Kalau di atas 800 ms',
    '  pada 15 scan per detik, antrean pintu masuk akan memanjang di lapangan.',
    '',
    '  Angka 503 bukan kegagalan kita, itu layanan Danar yang belum nyala.',
    '',
  ].join('\n');

  return {
    stdout: baris,
    'loadtest/hasil.json': JSON.stringify(data, null, 2),
  };
}
