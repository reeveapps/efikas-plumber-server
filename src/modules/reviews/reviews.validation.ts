import { z } from 'zod';

export const plumberIdParamSchema = z.object({
  id: z.string().min(1),
});

export const reviewIdParamSchema = z.object({
  id: z.string().min(1),
});

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const moderateReviewSchema = z.object({
  isVisible: z.boolean().optional(),
  isModerated: z.boolean().optional(),
});
