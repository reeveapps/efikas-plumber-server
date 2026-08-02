import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import { uploadToR2 } from '../../utils/r2.js';
import { submitContentSchema, updateContentSchema } from './training-content.validation.js';
import * as service from './training-content.service.js';

async function uploadedUrls(req: Request): Promise<{ videoFileUrl?: string; guidePdfUrl?: string }> {
  const files = req.files as { video?: Express.Multer.File[]; guidePdf?: Express.Multer.File[] } | undefined;
  const out: { videoFileUrl?: string; guidePdfUrl?: string } = {};
  if (files?.video?.[0]) {
    const f = files.video[0];
    out.videoFileUrl = await uploadToR2({ buffer: f.buffer, mimetype: f.mimetype, originalname: f.originalname }, 'training/video');
  }
  if (files?.guidePdf?.[0]) {
    const f = files.guidePdf[0];
    out.guidePdfUrl = await uploadToR2({ buffer: f.buffer, mimetype: f.mimetype, originalname: f.originalname }, 'training/guide');
  }
  return out;
}

export const submitContent = asyncHandler(async (req: Request, res: Response) => {
  const uploaded = await uploadedUrls(req);
  const parsed = submitContentSchema.parse({ ...req.body, ...uploaded });
  const content = await service.submitContent(req.user!.profileId, parsed);
  sendSuccess(res, content, undefined, 201);
});

export const listMyContent = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await service.listMyContent(req.user!.profileId, cursor, limit);
  sendSuccess(res, page);
});

export const updateAndResubmit = asyncHandler(async (req: Request, res: Response) => {
  const uploaded = await uploadedUrls(req);
  const parsed = updateContentSchema.parse({ ...req.body, ...uploaded });
  const content = await service.updateAndResubmit(req.params.id, req.user!.profileId, parsed);
  sendSuccess(res, content);
});

export const listPublicContent = asyncHandler(async (req: Request, res: Response) => {
  const { category, cursor, limit } = req.query as unknown as {
    category?: 'SAFETY' | 'TECHNIQUES' | 'CUSTOMER_SERVICE' | 'BUSINESS';
    cursor?: string;
    limit: number;
  };
  const page = await service.listPublicContent(category, cursor, limit);
  sendSuccess(res, page);
});

export const recordView = asyncHandler(async (req: Request, res: Response) => {
  await service.incrementViewCount(req.params.id);
  sendSuccess(res, null);
});

export const listPendingAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await service.listPendingAdmin(cursor, limit);
  sendSuccess(res, page);
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  const content = await service.approve(req.params.id);
  sendSuccess(res, content);
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const content = await service.reject(req.params.id, req.body.reason);
  sendSuccess(res, content);
});
