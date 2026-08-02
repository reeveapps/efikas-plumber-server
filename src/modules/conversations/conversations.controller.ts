import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as conversationsService from './conversations.service.js';

export const listMyConversations = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await conversationsService.listMyConversations(req.user!, cursor, limit);
  sendSuccess(res, page);
});

export const startWithPlumber = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await conversationsService.startWithPlumber(req.user!, req.params.plumberId);
  sendSuccess(res, conversation, undefined, 201);
});

export const startWithSupplier = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.query as unknown as { productId?: string };
  const conversation = await conversationsService.startWithSupplier(req.user!, req.params.partnerId, productId);
  sendSuccess(res, conversation, undefined, 201);
});

export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await conversationsService.listMessages(req.params.id, req.user!, cursor, limit);
  sendSuccess(res, page);
});

export const createMessage = asyncHandler(async (req: Request, res: Response) => {
  const message = await conversationsService.createMessage(req.params.id, req.user!, req.body);
  sendSuccess(res, message, undefined, 201);
});

export const markMessagesRead = asyncHandler(async (req: Request, res: Response) => {
  await conversationsService.markMessagesRead(req.params.id, req.user!);
  sendSuccess(res, null, 'Messages marked as read');
});
