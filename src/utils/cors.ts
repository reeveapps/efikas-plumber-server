import { env } from '../config/env.js';

const allowedOrigins = [env.PARTNER_CLIENT_URL, env.ADMIN_APP_URL]
  .flatMap((url) => url.split(','))
  .map((o) => o.trim())
  .filter(Boolean);
const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function corsOriginChecker(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void {
  // No Origin header (native apps, curl, server-to-server) — always allow.
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  if (env.NODE_ENV !== 'production' && localhostOriginPattern.test(origin)) {
    return callback(null, true);
  }
  callback(new Error(`Origin ${origin} not allowed by CORS`));
}
