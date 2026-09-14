import app from './app';
import type { Env } from './env';

/**
 * Worker entry point.
 *
 * Nothing runs here at module scope on purpose: a Worker isolate is shared
 * between requests, so anything cached up here would be shared between users.
 * Per-request state belongs on the Hono context.
 */
export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
