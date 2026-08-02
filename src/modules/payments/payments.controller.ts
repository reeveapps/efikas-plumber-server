import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { getCursorPagination } from '../../types/index.js';
import * as paymentsService from './payments.service.js';

export const stkPushController = asyncHandler(async (req: Request, res: Response) => {
  const idempotencyKey = req.header('Idempotency-Key') ?? undefined;
  const result = await paymentsService.initiateStkPush(
    req.user!.userId,
    req.user!.role,
    req.user!.profileId,
    req.body,
    idempotencyKey
  );
  sendSuccess(res, result, undefined, 201);
});

export const mpesaCallback = asyncHandler(async (req: Request, res: Response) => {
  const handled = await paymentsService.handleMpesaCallback(req.params.secret, req.body);
  if (!handled) {
    sendError(res, 'Forbidden', 403);
    return;
  }
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

export const getPaymentStatus = asyncHandler(async (req: Request, res: Response) => {
  const payment = await paymentsService.getPaymentStatus(req.user!.userId, req.params.id);
  sendSuccess(res, payment);
});

export const listMyPayments = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = getCursorPagination(req.query as { cursor?: string; limit?: string });
  const page = await paymentsService.listMyPayments(req.user!.userId, cursor, limit);
  sendSuccess(res, page);
});

export const mpesaQuery = asyncHandler(async (req: Request, res: Response) => {
  const payment = await paymentsService.queryMpesaStatus(req.user!.userId, req.body.paymentId);
  sendSuccess(res, payment);
});
