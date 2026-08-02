import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import { uploadToR2 } from '../../utils/r2.js';
import * as partnersService from './partners.service.js';
import * as trainingContentService from '../training-content/training-content.service.js';

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  let logoUrl = req.body.logoUrl as string | undefined;
  if (req.file) {
    logoUrl = await uploadToR2(
      { buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname },
      'partners/logo'
    );
  }
  const profile = await partnersService.updateMe(req.user!.userId, { ...req.body, ...(logoUrl ? { logoUrl } : {}) });
  sendSuccess(res, profile);
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const profile = await partnersService.getMe(req.user!.userId);
  sendSuccess(res, profile);
});

export const listMyAds = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await partnersService.listMyAds(req.user!.profileId, cursor, limit);
  sendSuccess(res, page);
});

export const getDashboardSummary = asyncHandler(async (req: Request, res: Response) => {
  const summary = await partnersService.getDashboardSummary(req.user!.profileId, req.user!.userId);
  sendSuccess(res, summary);
});

export const getDashboardAnalyticsDaily = asyncHandler(async (req: Request, res: Response) => {
  const { days } = req.query as unknown as { days: number };
  const analytics = await partnersService.getDashboardAnalyticsDaily(req.user!.profileId, days);
  sendSuccess(res, analytics);
});

export const getBillingHistory = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await partnersService.getBillingHistory(req.user!.userId, cursor, limit);
  sendSuccess(res, page);
});

export const listMyTrainingContent = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await trainingContentService.listMyContent(req.user!.profileId, cursor, limit);
  sendSuccess(res, page);
});
