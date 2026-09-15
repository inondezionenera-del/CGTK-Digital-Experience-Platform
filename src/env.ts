/**
 * Runtime bindings.
 *
 * Anything marked "secret" is set with `wrangler secret put NAME` and never
 * appears in wrangler.toml or the repository.
 */
export interface Env {
  /** Supabase project URL, e.g. https://abc.supabase.co */
  SUPABASE_URL: string;

  /** secret — bypasses row level security. Server-side only, never shipped to a browser. */
  SUPABASE_SERVICE_ROLE_KEY: string;

  /** Public anon key. Safe to expose. */
  SUPABASE_ANON_KEY: string;

  /** secret — Supabase JWT secret (HS256), used to verify access tokens locally. */
  SUPABASE_JWT_SECRET: string;

  /** secret — HMAC key for QR identities. Lets scanners reject forgeries offline. */
  QR_SIGNING_SECRET: string;

  ENVIRONMENT: 'development' | 'production';
  ALLOWED_ORIGINS?: string;

  /**
   * Base URL of Danar's Python service (quiz, missions, achievements, levels,
   * cosmetics, reports). Requests to those prefixes are forwarded there.
   *
   * Unset means those features answer 503 with a readable message; everything
   * else keeps working. That is deliberate — the gate must not depend on it.
   */
  PYTHON_API_URL?: string;

  /** Optional. Rate limiting degrades to a no-op when absent. */
  RATE_LIMIT?: KVNamespace;
}

/** Authenticated caller, attached to the request context by the auth middleware. */
export interface Pengguna {
  id: string;
  email: string;
  nama: string;
  peran: string;
  izin: string[];
  participantId?: string;
  representativeId?: number;
}

export type Variables = {
  pengguna: Pengguna;
};
