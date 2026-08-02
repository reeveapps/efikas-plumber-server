import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as subscriptionsService from './subscriptions.service.js';

export const listPlans = asyncHandler(async (_req: Request, res: Response) => {
  const plans = await subscriptionsService.listActivePlans();
  sendSuccess(res, plans);
});
