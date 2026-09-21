import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY } from '../config/constants.js';
import { AuthUser } from '../types/index.js';

export function generateAccessToken(payload: AuthUser): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRY } as jwt.SignOptions);
}

export function generateRefreshToken(payload: AuthUser): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRY } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  return decoded as AuthUser;
}

export function verifyRefreshToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  return decoded as AuthUser;
}

// Short-lived token issued after a successful password login for accounts that
// require a 2FA step (SERVICE_MANAGER, ADMIN) before full tokens are handed out.
export function generateTwoFactorToken(userId: string): string {
  return jwt.sign({ userId, type: 'two-factor' }, env.JWT_RESET_SECRET, { expiresIn: '10m' } as jwt.SignOptions);
}

export function verifyTwoFactorToken(token: string): { userId: string } {
  const decoded = jwt.verify(token, env.JWT_RESET_SECRET) as { userId: string; type: string };
  if (decoded.type !== 'two-factor') throw new Error('Invalid token type');
  return { userId: decoded.userId };
}

// A browser can't safely hold the real access token (the web apps keep it
// httpOnly), so it asks the API for one of these instead and presents it only
// at Socket.IO handshake time. Two things stop it being a usable API
// credential if it leaks: it's signed with a different secret than access
// tokens (so `authenticate` rejects it outright), and it expires in minutes.
// The socket client re-requests a fresh one on every (re)connect attempt.
export function generateSocketToken(payload: AuthUser): string {
  // Only the identity fields: `payload` is often a decoded access token still
  // carrying `iat`/`exp`, and jsonwebtoken rejects `expiresIn` when the payload
  // already has an `exp`.
  const { userId, role, profileId } = payload;
  return jwt.sign({ userId, role, profileId, type: 'socket' }, env.JWT_RESET_SECRET, {
    expiresIn: '2m',
  } as jwt.SignOptions);
}

export function verifySocketToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.JWT_RESET_SECRET) as AuthUser & { type: string };
  if (decoded.type !== 'socket') throw new Error('Invalid token type');
  return { userId: decoded.userId, role: decoded.role, profileId: decoded.profileId };
}

export function generatePasswordResetToken(userId: string): string {
  return jwt.sign({ userId, type: 'password-reset' }, env.JWT_RESET_SECRET, {
    expiresIn: '15m',
  } as jwt.SignOptions);
}

export function verifyPasswordResetToken(token: string): { userId: string } {
  const decoded = jwt.verify(token, env.JWT_RESET_SECRET) as { userId: string; type: string };
  if (decoded.type !== 'password-reset') throw new Error('Invalid token type');
  return { userId: decoded.userId };
}
