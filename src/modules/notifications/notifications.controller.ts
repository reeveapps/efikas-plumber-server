import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as notificationsService from './notifications.service.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const result = await notificationsService.listMyNotifications(req.user!.userId, cursor, limit);
  sendSuccess(res, result);
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await notificationsService.markAsRead(req.user!.userId, req.params.id);
  sendSuccess(res, notification);
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  await notificationsService.markAllAsRead(req.user!.userId);
  sendSuccess(res, null, 'All notifications marked as read');
});

export const broadcast = asyncHandler(async (req: Request, res: Response) => {
  const result = await notificationsService.broadcastNotification(req.body);
  sendSuccess(res, result, undefined, 201);
});

export const getBroadcastHistory = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const result = await notificationsService.getBroadcastHistory(cursor, limit);
  sendSuccess(res, result);
});
