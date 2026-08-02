import bcrypt from 'bcryptjs';

const OTP_LENGTH = 6;

export function generateOtpCode(): string {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

export function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export function compareOtpCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
