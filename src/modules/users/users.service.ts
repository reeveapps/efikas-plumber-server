import { Role } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { generateOtpCode, hashOtpCode, compareOtpCode } from '../../utils/otp.js';
import { sendSms } from '../../utils/sms.js';
import formatPhoneNumber from '../../utils/formatPhoneNumber.js';
import { OTP_EXPIRY_SECONDS } from '../../config/constants.js';

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

    const otpCode = generateOtpCode();
    const codeHash = await hashOtpCode(otpCode);
    await prisma.otpCode.create({
      data: {
        userId,
        code: codeHash,
        channel: 'SMS',
        purpose: 'phone_change',
        expiresAt: new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000),
      },
    });
    await sendSms(normalizedPhone, `Your Plumbers verification code is ${otpCode}. It expires in 10 minutes.`);
    return { otpSent: true };
  }

  const otp = await prisma.otpCode.findFirst({
    where: { userId, purpose: 'phone_change', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt < new Date()) throw createError('No pending OTP found. Please request a new code.', 400);

  const isValid = await compareOtpCode(code, otp.code);
  if (!isValid) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw createError('Incorrect code', 400);
  }

  await prisma.$transaction([
    prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({
      where: { id: userId },
      data: { phone: normalizedPhone, phoneVerifiedAt: new Date() },
    }),
  ]);

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
