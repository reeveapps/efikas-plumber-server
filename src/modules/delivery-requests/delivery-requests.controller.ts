import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as deliveryRequestsService from './delivery-requests.service.js';

export const listMine = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await deliveryRequestsService.listMine(req.user!.role, req.user!.profileId, cursor, limit);
  sendSuccess(res, page);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const deliveryRequest = await deliveryRequestsService.getById(req.params.id, req.user!.role, req.user!.profileId);
  sendSuccess(res, deliveryRequest);
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const deliveryRequest = await deliveryRequestsService.updateStatus(
    req.params.id,
    req.user!.profileId,
    req.body.status
  );
  sendSuccess(res, deliveryRequest);
});
