import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as reviewsService from './reviews.service.js';

export const listPlumberReviews = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await reviewsService.listPlumberReviews(req.params.id, cursor, limit);
  sendSuccess(res, page);
});

export const moderateReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewsService.moderateReview(req.params.id, req.body);
  sendSuccess(res, review);
});
