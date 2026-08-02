import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import { uploadToR2 } from '../../utils/r2.js';
import * as usersService from './users.service.js';

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.getMe(req.user!.userId, req.user!.role);
  sendSuccess(res, user);
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  let avatarUrl = req.body.avatarUrl as string | undefined;
  if (req.file) {
    avatarUrl = await uploadToR2(
      { buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname },
      'avatars'
    );
  }
  const user = await usersService.updateMe(req.user!.userId, {
    ...req.body,
    ...(avatarUrl ? { avatarUrl } : {}),
  });
  sendSuccess(res, user);
});

export const changePhone = asyncHandler(async (req: Request, res: Response) => {
  const result = await usersService.changePhone(req.user!.userId, req.body.phone, req.body.code);
  sendSuccess(res, result);
});

export const registerDevice = asyncHandler(async (req: Request, res: Response) => {
  const device = await usersService.registerDevice(req.user!.userId, req.body.fcmToken, req.body.platform);
  sendSuccess(res, device, undefined, 201);
});

export const removeDevice = asyncHandler(async (req: Request, res: Response) => {
  await usersService.removeDevice(req.user!.userId, req.params.tokenId);
  sendSuccess(res, null, 'Device removed');
});

export const deleteMe = asyncHandler(async (req: Request, res: Response) => {
  await usersService.requestAccountDeletion(req.user!.userId);
  sendSuccess(res, null, 'Account deletion requested');
});
