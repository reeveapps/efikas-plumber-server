import { z } from 'zod';

export const updateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
  language: z.enum(['en', 'sw']).optional(),
});

// Step 1 (no `code`): sends an OTP to `phone`. Step 2 (with `code`): verifies
// it and applies the phone change. Mirrors auth.service.ts's upgradeGuest flow.
export const changePhoneSchema = z.object({
  phone: z.string().min(9).max(15),
  code: z.string().min(4).max(10).optional(),
});

export const registerDeviceSchema = z.object({
  fcmToken: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});

export const deviceIdParamSchema = z.object({
  tokenId: z.string().min(1),
});
