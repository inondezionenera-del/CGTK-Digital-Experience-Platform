/**
 * QR identity.
 *
 * Payload shape:
 *
 *     CGTK1 . <random token, 32 hex> . <HMAC-SHA256 truncated to 12 hex>
 *     └ ver   └ looked up in the database      └ verifiable without a network
 *
 * Two layers on purpose. Online, the token is matched against the database —
 * accurate, and revocable the moment a payment is reversed. Offline, the
 * signature alone tells a scanner whether the code was issued by us, which is
 * what makes the offline queue safe to accept in the first place.
 *
 * A plain UUID would leave a phone with no signal unable to tell a real badge
 * from a screenshot of someone's drawing.
 */

const VERSI = 'CGTK1';
const PANJANG_TANDA = 12;

const enc = new TextEncoder();

async function kunciHmac(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function keHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison — a plain === leaks timing on a per-character basis. */
function samaAman(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let beda = 0;
  for (let i = 0; i < a.length; i++) beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return beda === 0;
}

export async function tandaTangan(token: string, secret: string): Promise<string> {
  const key = await kunciHmac(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${VERSI}.${token}`));
  return keHex(sig).slice(0, PANJANG_TANDA);
}

/** Builds the string that gets rendered as the participant's QR code. */
export async function susunQr(token: string, secret: string): Promise<string> {
  return `${VERSI}.${token}.${await tandaTangan(token, secret)}`;
}

export interface HasilQr {
  valid: boolean;
  token?: string;
  alasan?: 'FORMAT' | 'VERSI' | 'TANDA_TANGAN';
}

/** Verifies the signature and returns the token. Never touches the database. */
export async function bacaQr(isi: string, secret: string): Promise<HasilQr> {
  const bagian = (isi ?? '').trim().split('.');
  if (bagian.length !== 3) return { valid: false, alasan: 'FORMAT' };

  const [versi, token, tanda] = bagian as [string, string, string];
  if (versi !== VERSI) return { valid: false, alasan: 'VERSI' };
  if (!/^[0-9a-f]{16,64}$/.test(token)) return { valid: false, alasan: 'FORMAT' };

  const diharapkan = await tandaTangan(token, secret);
  if (!samaAman(tanda, diharapkan)) return { valid: false, alasan: 'TANDA_TANGAN' };

  return { valid: true, token };
}

/**
 * Hash handed to scanner phones for offline matching.
 *
 * The real token never leaves the server: a lost or stolen staff phone would
 * otherwise carry everything needed to mint working badges.
 */
export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return keHex(buf);
}

/** Booth poster payload — the participant-side code that unlocks material. */
export function susunQrBooth(token: string): string {
  return `CGTKB1.${token}`;
}

export function bacaQrBooth(isi: string): string | null {
  const m = (isi ?? '').trim().match(/^CGTKB1\.([0-9a-f]{16,64})$/);
  return m ? m[1]! : null;
}
