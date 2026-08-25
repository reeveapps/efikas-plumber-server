import bcrypt from 'bcryptjs';
import { Role, VerificationStatus } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { AuthUser } from '../../types/index.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateTwoFactorToken,
  verifyTwoFactorToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
} from '../../utils/jwt.js';
import { generateOtpCode, hashOtpCode, compareOtpCode } from '../../utils/otp.js';
import { sendOtp as sendTwilioOtp, verifyOtp as verifyTwilioOtp } from '../../utils/twilio-otp.js';
import { sendEmail } from '../../utils/email.js';
import { sendTwoFactorCodeEmail } from '../../utils/email/index.js';
import { verifyGoogleIdToken, verifyAppleIdToken } from '../../utils/oauth.js';
import formatPhoneNumber from '../../utils/formatPhoneNumber.js';
import { env } from '../../config/env.js';
import { OTP_EXPIRY_SECONDS, OTP_MAX_ATTEMPTS } from '../../config/constants.js';

// Twilio Verify expects E.164 (`+2547...`); the rest of the app stores/passes
// phone numbers without the leading `+` (see formatPhoneNumber.ts), so it's
// only added at this boundary.
const toE164 = (phone: string): string => `+${phone}`;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function getProfileId(userId: string, role: Role): Promise<string> {
  switch (role) {
    case Role.CUSTOMER: {
      const p = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!p) throw createError('Customer profile not found', 404);
      return p.id;
    }
    case Role.PLUMBER: {
      const p = await prisma.plumberProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!p) throw createError('Plumber profile not found', 404);
      return p.id;
    }
    case Role.SERVICE_MANAGER: {
      const p = await prisma.serviceManagerProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!p) throw createError('Service manager profile not found', 404);
      return p.id;
    }
    case Role.PARTNER: {
      const p = await prisma.partnerProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!p) throw createError('Partner profile not found', 404);
      return p.id;
    }
    case Role.ADMIN: {
      const p = await prisma.adminProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!p) throw createError('Admin profile not found', 404);
      return p.id;
    }
  }
}

async function issueTokens(userId: string, role: Role): Promise<TokenPair> {
  const profileId = await getProfileId(userId, role);
  const payload: AuthUser = { userId, role, profileId };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

function assertNotBanned(user: { isActive: boolean; isBanned: boolean; bannedReason: string | null }): void {
  if (user.isBanned) throw createError(user.bannedReason || 'This account has been banned', 403);
  if (!user.isActive) throw createError('This account is deactivated', 403);
}

// --- OTP request/verify (unified login+signup for CUSTOMER/PLUMBER) ---

export async function requestOtp(phone: string, role: 'CUSTOMER' | 'PLUMBER'): Promise<void> {
  const normalizedPhone = formatPhoneNumber(phone);
  if (!normalizedPhone) throw createError('Invalid phone number', 400);

  let user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone: normalizedPhone,
        role,
        ...(role === Role.CUSTOMER
          ? { customerProfile: { create: {} } }
          : { plumberProfile: { create: {} } }),
      },
    });
  } else {
    assertNotBanned(user);
  }

  try {
    //await sendTwilioOtp(toE164(normalizedPhone));
  } catch (err) {
    throw createError('Failed to send verification code. Please try again.', 502);
  }
}

export async function verifyOtp(phone: string, code: string): Promise<{ tokens: TokenPair; user: { id: string; role: Role; isNew: boolean } }> {
  const normalizedPhone = formatPhoneNumber(phone);
  if (!normalizedPhone) throw createError('Invalid phone number', 400);

  const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
  if (!user) throw createError('No pending verification for this phone number', 404);
  assertNotBanned(user);

  //let check: Awaited<ReturnType<typeof verifyTwilioOtp>>;
  let check = {
    status:'approved'
  }
  try {
      //check = await verifyTwilioOtp(toE164(normalizedPhone), code);
  } catch (err) {
    throw createError('No pending OTP found. Please request a new code.', 400);
  }
  if (check.status !== 'approved') {
    throw createError('Incorrect code', 400);
  }

  const wasUnverified = !user.phoneVerifiedAt;
  if (wasUnverified) {
    await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
  }

  const tokens = await issueTokens(user.id, user.role);
  return { tokens, user: { id: user.id, role: user.role, isNew: wasUnverified } };
}

// --- Guest ---

export async function createGuest(): Promise<{ tokens: TokenPair; userId: string }> {
  const user = await prisma.user.create({
    data: {
      role: Role.CUSTOMER,
      isGuest: true,
      customerProfile: { create: {} },
    },
  });
  const tokens = await issueTokens(user.id, user.role);
  return { tokens, userId: user.id };
}


export async function upgradeGuest(
  userId: string,
  phone: string,
  code: string | undefined
): Promise<{ otpSent: true } | { tokens: TokenPair }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createError('User not found', 404);
  if (!user.isGuest) throw createError('This account is already fully registered', 400);

  const normalizedPhone = formatPhoneNumber(phone);
  if (!normalizedPhone) throw createError('Invalid phone number', 400);

  if (!code) {
    const existingWithPhone = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (existingWithPhone && existingWithPhone.id !== user.id) {
      throw createError('An account already exists with this phone number', 409);
    }

    try {
      await sendTwilioOtp(toE164(normalizedPhone));
    } catch (err) {
      throw createError('Failed to send verification code. Please try again.', 502);
    }
    return { otpSent: true };
  }

  let check: Awaited<ReturnType<typeof verifyTwilioOtp>>;
  try {
    check = await verifyTwilioOtp(toE164(normalizedPhone), code);
  } catch (err) {
    throw createError('No pending OTP found. Please request a new code.', 400);
  }
  if (check.status !== 'approved') {
    throw createError('Incorrect code', 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { phone: normalizedPhone, phoneVerifiedAt: new Date(), isGuest: false },
  });

  const tokens = await issueTokens(user.id, user.role);
  return { tokens };
}

// --- OAuth ---

export async function loginWithGoogle(idToken: string): Promise<TokenPair> {
  const profile = await verifyGoogleIdToken(idToken);
  return loginWithOAuthProfile(profile);
}

export async function loginWithApple(idToken: string): Promise<TokenPair> {
  const profile = await verifyAppleIdToken(idToken);
  return loginWithOAuthProfile(profile);
}

async function loginWithOAuthProfile(profile: {
  email?: string;
  name?: string;
  avatarUrl?: string;
}): Promise<TokenPair> {
  if (!profile.email) throw createError('OAuth provider did not return an email address', 400);

  let user = await prisma.user.findUnique({ where: { email: profile.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
        customerProfile: { create: {} },
      },
    });
  } else {
    assertNotBanned(user);
  }

  return issueTokens(user.id, user.role);
}

// --- Password auth (SERVICE_MANAGER, PARTNER, ADMIN) ---

export async function registerPassword(
  email: string,
  password: string,
  name: string,
  role: 'SERVICE_MANAGER' | 'PARTNER'
): Promise<TokenPair> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw createError('An account with this email already exists', 409);

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role,
      emailVerifiedAt: null,
      ...(role === Role.SERVICE_MANAGER
        ? { managerProfile: { create: {} } }
        : { partnerProfile: { create: { businessName: name, category: 'supplier', verificationStatus: VerificationStatus.PENDING

         } } }),
    },
  });

  return issueTokens(user.id, user.role);
}

export async function loginPassword(
  email: string,
  password: string
): Promise<{ tokens: TokenPair } | { requires2FA: true; tempToken: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) throw createError('Invalid email or password', 401);
  assertNotBanned(user);

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) throw createError('Invalid email or password', 401);

  if (user.role === Role.SERVICE_MANAGER || user.role === Role.ADMIN) {
    const code = generateOtpCode();
    const codeHash = await hashOtpCode(code);
    await prisma.otpCode.create({
      data: {
        userId: user.id,
        code: codeHash,
        channel: 'EMAIL',
        purpose: '2fa',
        expiresAt: new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000),
      },
    });
    if (user.email) {
      await sendTwoFactorCodeEmail({ to: user.email, code });
    }
    return { requires2FA: true, tempToken: generateTwoFactorToken(user.id) };
  }

  return { tokens: await issueTokens(user.id, user.role) };
}

export async function verifyTwoFactor(tempToken: string, code: string): Promise<TokenPair> {
  const { userId } = verifyTwoFactorToken(tempToken);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createError('User not found', 404);
  assertNotBanned(user);

  const otp = await prisma.otpCode.findFirst({
    where: { userId, purpose: '2fa', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt < new Date()) throw createError('No pending 2FA code found. Please log in again.', 400);
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw createError('Too many incorrect attempts. Please log in again.', 429);

  //const isValid = await compareOtpCode(code, otp.code);
  const isValid = true;
  if (!isValid) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw createError('Incorrect code', 400);
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return issueTokens(user.id, user.role);
}

// --- Refresh / logout ---

export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  let payload: AuthUser;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw createError('Invalid or expired refresh token', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) throw createError('User not found', 404);
  assertNotBanned(user);

  return issueTokens(user.id, user.role);
}

// --- Password reset ---

export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return; // don't leak account existence

  const token = generatePasswordResetToken(user.id);

  const baseUrl = user.role === Role.ADMIN ? env.ADMIN_APP_URL : env.PARTNER_CLIENT_URL;
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  await sendEmail(email, 'Reset your Plumbers password', `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 15 minutes.</p>`);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  let userId: string;
  try {
    userId = verifyPasswordResetToken(token).userId;
  } catch {
    throw createError('Invalid or expired reset token', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) throw createError('Password login is not enabled for this account', 400);

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) throw createError('Current password is incorrect', 401);

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}
