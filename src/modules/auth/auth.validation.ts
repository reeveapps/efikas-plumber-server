import { z } from 'zod';

export const otpRequestSchema = z.object({
  phone: z.string().min(9).max(15),
  role: z.enum(['CUSTOMER', 'PLUMBER']).optional().default('CUSTOMER'),
});

export const otpVerifySchema = z.object({
  phone: z.string().min(9).max(15),
  code: z.string().length(6),
});

export const guestUpgradeSchema = z.object({
  phone: z.string().min(9).max(15),
  code: z.string().length(6).optional(),
});

export const oauthSchema = z.object({
  idToken: z.string().min(1),
});

export const registerPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
  role: z.enum(['SERVICE_MANAGER', 'PARTNER']),
});

export const loginPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const twoFactorVerifySchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().length(6),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const passwordForgotSchema = z.object({
  email: z.string().email(),
});

export const passwordResetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
