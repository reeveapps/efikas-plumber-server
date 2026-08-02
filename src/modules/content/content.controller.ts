import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as contentService from './content.service.js';

export const listFaqs = asyncHandler(async (_req: Request, res: Response) => {
  const faqs = await contentService.listFaqs();
  sendSuccess(res, faqs);
});

export const createFaq = asyncHandler(async (req: Request, res: Response) => {
  const faq = await contentService.createFaq(req.body);
  sendSuccess(res, faq, undefined, 201);
});

export const updateFaq = asyncHandler(async (req: Request, res: Response) => {
  const faq = await contentService.updateFaq(req.params.id, req.body);
  sendSuccess(res, faq);
});

export const deleteFaq = asyncHandler(async (req: Request, res: Response) => {
  await contentService.deleteFaq(req.params.id);
  sendSuccess(res, null, 'FAQ entry deleted');
});

export const reorderFaqs = asyncHandler(async (req: Request, res: Response) => {
  const faqs = await contentService.reorderFaqs(req.body.order);
  sendSuccess(res, faqs);
});

export const listAppCopy = asyncHandler(async (_req: Request, res: Response) => {
  const entries = await contentService.listAppCopy();
  sendSuccess(res, entries);
});

export const setAppCopy = asyncHandler(async (req: Request, res: Response) => {
  const entry = await contentService.setAppCopy(req.params.key, req.body.value);
  sendSuccess(res, entry);
});
