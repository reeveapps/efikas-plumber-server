import { Request, Response } from 'express';
import { CookieOptions } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { env } from '../../config/env.js';
import { generateSocketToken } from '../../utils/jwt.js';
import * as authService from './auth.service.js';

const isProd = env.NODE_ENV === 'production';

function cookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    domain: env.COOKIE_DOMAIN === 'localhost' ? undefined : env.COOKIE_DOMAIN,
    maxAge: maxAgeMs,
  };
}

function setTokenCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
  res.cookie('accessToken', tokens.accessToken, cookieOptions(4 * 60 * 60 * 1000));
  res.cookie('refreshToken', tokens.refreshToken, cookieOptions(20 * 24 * 60 * 60 * 1000));
}

export const requestOtp = asyncHandler(async (req: Request, res: Response) => {
  await authService.requestOtp(req.body.phone, req.body.role);
  sendSuccess(res, null, 'OTP sent');
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.verifyOtp(req.body.phone, req.body.code);
  setTokenCookies(res, result.tokens);
  sendSuccess(res, { ...result.tokens, isNewUser: result.user.isNew, role: result.user.role });
});

export const createGuest = asyncHandler(async (_req: Request, res: Response) => {
  const result = await authService.createGuest();
  setTokenCookies(res, result.tokens);
  sendSuccess(res, result.tokens, undefined, 201);
});

export const upgradeGuest = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.upgradeGuest(req.user!.userId, req.body.phone, req.body.code);
  if ('tokens' in result) {
    setTokenCookies(res, result.tokens);
    sendSuccess(res, result.tokens);
  } else {
    sendSuccess(res, result);
  }
});

export const oauthGoogle = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await authService.loginWithGoogle(req.body.idToken);
  setTokenCookies(res, tokens);
  sendSuccess(res, tokens);
});

export const oauthApple = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await authService.loginWithApple(req.body.idToken);
  setTokenCookies(res, tokens);
  sendSuccess(res, tokens);
});

export const registerPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, role } = req.body;
  const tokens = await authService.registerPassword(email, password, name, role);
  setTokenCookies(res, tokens);
  sendSuccess(res, tokens, undefined, 201);
});

export const loginPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.loginPassword(req.body.email, req.body.password);
  if ('tokens' in result) {
    setTokenCookies(res, result.tokens);
    sendSuccess(res, result.tokens);
  } else {
    sendSuccess(res, result);
  }
});

export const verifyTwoFactor = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await authService.verifyTwoFactor(req.body.tempToken, req.body.code);
  setTokenCookies(res, tokens);
  sendSuccess(res, tokens);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.body.refreshToken || req.cookies?.refreshToken;
  if (!token) {
    sendError(res, 'Refresh token required', 400);
    return;
  }
  const tokens = await authService.refreshTokens(token);
  setTokenCookies(res, tokens);
  sendSuccess(res, tokens);
});

export const issueSocketToken = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, { token: generateSocketToken(req.user!) });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie('accessToken', cookieOptions(0));
  res.clearCookie('refreshToken', cookieOptions(0));
  sendSuccess(res, null, 'Logged out');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.forgotPassword(req.body.email);
  sendSuccess(res, null, 'If an account exists for that email, a reset link has been sent');
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.token, req.body.newPassword);
  sendSuccess(res, null, 'Password reset successfully');
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.changePassword(req.user!.userId, req.body.currentPassword, req.body.newPassword);
  sendSuccess(res, null, 'Password changed successfully');
});
