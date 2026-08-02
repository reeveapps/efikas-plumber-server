import { Request, Response } from 'express';
import { AdBillingInterval, ServiceCategory } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as adsService from './ads.service.js';

export const getFeed = asyncHandler(async (req: Request, res: Response) => {
  const { category, location, cursor, limit } = req.query as unknown as {
    category?: ServiceCategory;
    location?: string;
    cursor?: string;
    limit: number;
  };
  const page = await adsService.getFeed({ category, location, callerRole: req.user?.role }, cursor, limit);
  sendSuccess(res, page);
});

export const getSpotlightAds = asyncHandler(async (req: Request, res: Response) => {
  const { limit } = req.query as unknown as { limit: number };
  const ads = await adsService.getSpotlightAds(req.user?.role, req.user?.profileId, limit);
  sendSuccess(res, ads);
});

export const recordImpression = asyncHandler(async (req: Request, res: Response) => {
  const ad = await adsService.recordImpression(req.params.id, req.user?.role);
  sendSuccess(res, ad);
});

export const recordClick = asyncHandler(async (req: Request, res: Response) => {
  const ad = await adsService.recordClick(req.params.id, req.user?.role);
  sendSuccess(res, ad);
});

export const listPending = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await adsService.listPending(cursor, limit);
  sendSuccess(res, page);
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  const ad = await adsService.approve(req.params.id, req.body.approve, req.user!.userId);
  sendSuccess(res, ad);
});

export const listPricing = asyncHandler(async (_req: Request, res: Response) => {
  const rates = await adsService.listPricing();
  sendSuccess(res, rates);
});

export const setPricing = asyncHandler(async (req: Request, res: Response) => {
  const rate = await adsService.setPricing(req.params.interval as AdBillingInterval, req.body.priceKes);
  sendSuccess(res, rate);
});
