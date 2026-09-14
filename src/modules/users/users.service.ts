import { Role } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { sendOtp as sendTwilioOtp, verifyOtp as verifyTwilioOtp } from '../../utils/twilio-otp.js';
import formatPhoneNumber from '../../utils/formatPhoneNumber.js';

const toE164 = (phone: string): string => `+${phone}`;

const PROFILE_INCLUDE_BY_ROLE: Record<Role, Record<string, true>> = {
  [Role.CUSTOMER]: { customerProfile: true },
  [Role.PLUMBER]: { plumberProfile: true },
  [Role.SERVICE_MANAGER]: { managerProfile: true },
  [Role.PARTNER]: { partnerProfile: true },
  [Role.ADMIN]: { adminProfile: true },
};

export async function getMe(userId: string, role: Role) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: PROFILE_INCLUDE_BY_ROLE[role],
  });
  if (!user) throw createError('User not found', 404);
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function updateMe(
  userId: string,
  data: { name?: string; email?: string; avatarUrl?: string; language?: 'en' | 'sw' }
) {
  const user = await prisma.user.update({ where: { id: userId }, data });
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}


export async function changePhone(
  userId: string,
  phone: string,
  code: string | undefined
): Promise<{ otpSent: true } | { phone: string }> {
  const normalizedPhone = formatPhoneNumber(phone);
  if (!normalizedPhone) throw createError('Invalid phone number', 400);

  if (!code) {
    const existingWithPhone = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
    if (existingWithPhone && existingWithPhone.id !== userId) {
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
    where: { id: userId },
    data: { phone: normalizedPhone, phoneVerifiedAt: new Date() },
  });

  return { phone: normalizedPhone };
}

export async function registerDevice(userId: string, fcmToken: string, platform: 'ios' | 'android') {
  return prisma.deviceToken.upsert({
    where: { fcmToken },
    create: { userId, fcmToken, platform },
    update: { userId, platform },
  });
}

export async function removeDevice(userId: string, tokenId: string): Promise<void> {
  const device = await prisma.deviceToken.findUnique({ where: { id: tokenId } });
  if (!device || device.userId !== userId) throw createError('Device token not found', 404);
  await prisma.deviceToken.delete({ where: { id: tokenId } });
}


export async function requestAccountDeletion(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { isActive: false } }),
    prisma.deviceToken.deleteMany({ where: { userId } }),
  ]);
}

// Public counterpart to requestAccountDeletion — for someone requesting
// deletion from the marketing site rather than the logged-in app, where we
// have no session to trust. Identity is confirmed via phone OTP first, same
// two-step shape as changePhone above (no `code` sends it, `code` verifies).
// Never creates an account for an unrecognized phone — unlike the login OTP
// flow, a wrong number here should fail, not sign someone up.
export async function requestAccountDeletionByPhone(
  phone: string,
  code: string | undefined
): Promise<{ otpSent: true } | { deactivated: true }> {
  const normalizedPhone = formatPhoneNumber(phone);
  if (!normalizedPhone) throw createError('Invalid phone number', 400);

  const user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
  if (!user) throw createError('No account found with this phone number', 404);

  if (!code) {
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

  await requestAccountDeletion(user.id);
  return { deactivated: true };
}
