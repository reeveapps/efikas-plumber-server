import { env } from '../config/env.js';

const allowedOrigins = env.CLIENT_URL.split(',').map((o) => o.trim()).filter(Boolean);
const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Shared by both Express's `cors` middleware and the Socket.IO server so the
// two transports never drift into allowing different origins.
export function corsOriginChecker(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void {
  // No Origin header (native apps, curl, server-to-server) — always allow.
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  // `flutter run -d chrome` binds a new random localhost port every run, so a
  // fixed CLIENT_URL can never keep up in development — allow any localhost
  // origin there instead of hardcoding a port that will drift.
  if (env.NODE_ENV !== 'production' && localhostOriginPattern.test(origin)) {
    return callback(null, true);
  }
  callback(new Error(`Origin ${origin} not allowed by CORS`));
}
