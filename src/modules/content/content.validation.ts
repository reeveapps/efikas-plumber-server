import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const keyParamSchema = z.object({
  key: z.string().min(1),
});

export const createFaqSchema = z.object({
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(3000),
});

export const updateFaqSchema = z.object({
  question: z.string().min(1).max(300).optional(),
  answer: z.string().min(1).max(3000).optional(),
  isActive: z.boolean().optional(),
});

export const reorderFaqsSchema = z.object({
  order: z.array(z.string().min(1)).min(1), // FAQ ids in the new display order
});

export const setAppCopySchema = z.object({
  value: z.string().max(5000),
});
