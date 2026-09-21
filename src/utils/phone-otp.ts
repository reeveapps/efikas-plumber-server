import { NotificationChannel } from '@prisma/client';
import { prisma } from '../db/index.js';
import { createError } from '../middleware/error.middleware.js';
import { OTP_EXPIRY_SECONDS, OTP_MAX_ATTEMPTS } from '../config/constants.js';
import { generateOtpCode, hashOtpCode, compareOtpCode } from './otp.js';
import { sendSms } from './sms.js';

// One-time codes sent by SMS and checked here, not by a third-party verify
// service. Codes are stored hashed (like the admin 2FA codes) and are single
// use, short-lived and attempt-limited.

/// What the code is for. Part of the stored `purpose`, so a code issued to log
/// in can't be replayed to delete an account, and vice versa.
export type OtpKind = 'login' | 'verify_phone' | 'delete_account';
 
// Also part of `purpose`: a code is only valid for the exact number it was
// sent to. Without this, someone could request a code to their own phone and
// then use it to "verify" a different number when changing their phone.
const purposeFor = (kind: OtpKind, phone: string): string => `${kind}:${phone}`;

// SMS costs money and can be used to harass a number, so requesting codes for
// the same user/number/purpose is rate limited.
const RESEND_COOLDOWN_MS = 30_000;

export async function sendPhoneOtp(params: { userId: string; phone: string; kind: OtpKind }): Promise<void> {
  const { userId, phone, kind } = params;
  const purpose = purposeFor(kind, phone);

  const latest = await prisma.otpCode.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw createError('Please wait a moment before requesting another code.', 429);
  }

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code);
  const now = new Date();

  // Only the newest code stays valid.
  const [, created] = await prisma.$transaction([
    prisma.otpCode.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: now } }),
    prisma.otpCode.create({
      data: {
        userId,
        purpose,
        code: codeHash,
        channel: NotificationChannel.SMS,
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_SECONDS * 1000),
      },
    }),
  ]);

  try {
    await sendSms(phone, `Your Efikas Plumber OTP is ${code}. It expires in ${Math.round(OTP_EXPIRY_SECONDS / 60)} minutes.`);
  } catch (err) {
    console.error('[OTP] SMS send failed:', err);
    // Removed so the cooldown doesn't lock the user out after a failed send.
    await prisma.otpCode.deleteMany({ where: { id: created.id } });
    throw createError('Failed to send verification code. Please try again.', 502);
  }
}

/// Throws unless `code` is the current, unexpired, unused code for this user,
/// number and purpose. On success the code is consumed and can't be reused.
export async function verifyPhoneOtp(params: { userId: string; phone: string; kind: OtpKind; code: string }): Promise<void> {
  const { userId, phone, kind, code } = params;
  const purpose = purposeFor(kind, phone);

  const otp = await prisma.otpCode.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt < new Date()) {
    throw createError('No pending code found. Please request a new one.', 400);
  }

  // Counted before the comparison, and by the database, so a burst of parallel
  // guesses can't all slip in under the limit before any of them is recorded.
  const { attempts } = await prisma.otpCode.update({
    where: { id: otp.id },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });
  if (attempts > OTP_MAX_ATTEMPTS) {
    throw createError('Too many incorrect attempts. Please request a new code.', 429);
  }

  if (!(await compareOtpCode(code, otp.code))) {
    throw createError('Incorrect code', 400);
  }

  // Consumed atomically: if two requests submit the right code together, only
  // one of them wins.
  const consumed = await prisma.otpCode.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) throw createError('This code has already been used.', 400);
}
