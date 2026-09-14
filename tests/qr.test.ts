import { describe, it, expect } from 'vitest';
import { susunQr, bacaQr, tandaTangan, hashToken, susunQrBooth, bacaQrBooth } from '../src/lib/qr';

/**
 * These cover the one thing a scanner has to get right with no network: telling
 * a badge we issued from one somebody made up.
 */

const RAHASIA = 'rahasia-uji-coba-jangan-dipakai-di-produksi';
const TOKEN = 'a3f19c4d8b2e7016f5c93a8d41b6e207';

describe('QR identity', () => {
  it('menerima QR yang dibuatnya sendiri', async () => {
    const qr = await susunQr(TOKEN, RAHASIA);
    const hasil = await bacaQr(qr, RAHASIA);
    expect(hasil.valid).toBe(true);
    expect(hasil.token).toBe(TOKEN);
  });

  it('berbentuk CGTK1.<token>.<tanda tangan>', async () => {
    const qr = await susunQr(TOKEN, RAHASIA);
    const [versi, token, tanda] = qr.split('.');
    expect(versi).toBe('CGTK1');
    expect(token).toBe(TOKEN);
    expect(tanda).toMatch(/^[0-9a-f]{12}$/);
  });

  // The attack this blocks: someone reads their own QR, changes a digit, and
  // walks in as another participant.
  it('menolak token yang diubah satu karakter', async () => {
    const qr = await susunQr(TOKEN, RAHASIA);
    const [versi, token, tanda] = qr.split('.') as [string, string, string];
    const diubah = `${versi}.${token.slice(0, -1)}9.${tanda}`;
    const hasil = await bacaQr(diubah, RAHASIA);
    expect(hasil.valid).toBe(false);
    expect(hasil.alasan).toBe('TANDA_TANGAN');
  });

  it('menolak tanda tangan yang dikarang', async () => {
    const hasil = await bacaQr(`CGTK1.${TOKEN}.000000000000`, RAHASIA);
    expect(hasil.valid).toBe(false);
    expect(hasil.alasan).toBe('TANDA_TANGAN');
  });

  // If the signing secret is ever rotated, every old badge must stop working —
  // that is the whole point of being able to rotate it.
  it('menolak QR yang ditandatangani rahasia lain', async () => {
    const qr = await susunQr(TOKEN, 'rahasia-yang-lain');
    const hasil = await bacaQr(qr, RAHASIA);
    expect(hasil.valid).toBe(false);
    expect(hasil.alasan).toBe('TANDA_TANGAN');
  });

  it('menolak versi yang tidak dikenal', async () => {
    const tanda = await tandaTangan(TOKEN, RAHASIA);
    const hasil = await bacaQr(`CGTK9.${TOKEN}.${tanda}`, RAHASIA);
    expect(hasil.alasan).toBe('VERSI');
  });

  it.each([
    ['kosong', ''],
    ['sembarang teks', 'halo'],
    ['QR orang lain', 'https://instagram.com/cgtk'],
    ['bagian kurang', `CGTK1.${TOKEN}`],
    ['bagian lebih', `CGTK1.${TOKEN}.aaaaaaaaaaaa.x`],
    ['token bukan hex', 'CGTK1.zzzzzzzzzzzzzzzz.aaaaaaaaaaaa'],
  ])('menolak %s tanpa error', async (_nama, isi) => {
    const hasil = await bacaQr(isi, RAHASIA);
    expect(hasil.valid).toBe(false);
    expect(hasil.alasan).toBe(isi.startsWith('CGTK1.') ? 'FORMAT' : 'FORMAT');
  });

  // Scanners run the camera at full speed and hand over whatever they decode,
  // including partial reads. None of that may throw — a crashed scanner stops
  // the queue.
  it('tidak pernah melempar error apa pun isinya', async () => {
    const aneh = ['\n', '.'.repeat(50), 'CGTK1..', '   ', 'CGTK1.' + 'a'.repeat(500) + '.bbb'];
    for (const isi of aneh) {
      await expect(bacaQr(isi, RAHASIA)).resolves.toHaveProperty('valid', false);
    }
  });

  it('memangkas spasi — pembaca QR kadang menambahkan newline', async () => {
    const qr = await susunQr(TOKEN, RAHASIA);
    expect((await bacaQr(`  ${qr}\n`, RAHASIA)).valid).toBe(true);
  });

  it('tanda tangan sama untuk token sama (bisa dicocokkan offline)', async () => {
    expect(await tandaTangan(TOKEN, RAHASIA)).toBe(await tandaTangan(TOKEN, RAHASIA));
  });
});

describe('hash token untuk HP scanner', () => {
  // What ships to a scanner phone before the event. A stolen phone must not
  // carry anything that can be turned back into a working badge.
  it('64 hex, stabil, dan tidak memuat tokennya', async () => {
    const h = await hashToken(TOKEN);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(await hashToken(TOKEN));
    expect(h).not.toContain(TOKEN);
  });

  it('token berbeda menghasilkan hash berbeda', async () => {
    expect(await hashToken(TOKEN)).not.toBe(await hashToken(TOKEN.replace('a', 'b')));
  });
});

describe('QR poster booth', () => {
  it('bolak-balik', () => {
    expect(bacaQrBooth(susunQrBooth(TOKEN))).toBe(TOKEN);
  });

  // A booth poster is not an identity. Confusing the two would let someone
  // photograph a poster and check in as a participant.
  it('tidak menerima QR identitas peserta', async () => {
    expect(bacaQrBooth(await susunQr(TOKEN, RAHASIA))).toBeNull();
  });

  it('menolak isi sembarangan', () => {
    for (const isi of ['', 'CGTKB1.', 'CGTKB1.zz', 'halo']) {
      expect(bacaQrBooth(isi)).toBeNull();
    }
  });
});
