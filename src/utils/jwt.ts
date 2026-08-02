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
