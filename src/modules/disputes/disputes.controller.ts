import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as disputesService from './disputes.service.js';

export const listMyDisputes = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await disputesService.listMyDisputes(req.user!, cursor, limit);
  sendSuccess(res, page);
});

export const getDispute = asyncHandler(async (req: Request, res: Response) => {
  const dispute = await disputesService.getDispute(req.params.id, req.user!);
  sendSuccess(res, dispute);
});

export const listDisputes = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit, status } = req.query as unknown as { cursor?: string; limit: number; status?: import('@prisma/client').ConcernStatus };
  const page = await disputesService.listDisputes(status, cursor, limit);
  sendSuccess(res, page);
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const dispute = await disputesService.updateStatus(req.params.id, req.body.status);
  sendSuccess(res, dispute);
});

export const resolveDispute = asyncHandler(async (req: Request, res: Response) => {
  const dispute = await disputesService.resolveDispute(req.params.id, req.user!.userId, req.body);
  sendSuccess(res, dispute);
});
