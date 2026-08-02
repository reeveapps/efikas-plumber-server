import { z } from 'zod';

export const updateMeSchema = z.object({
  businessName: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(60).optional(),
  location: z.string().min(1).max(200).optional(),
  logoUrl: z.string().url().optional(),
});

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dashboardAnalyticsDailyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});
