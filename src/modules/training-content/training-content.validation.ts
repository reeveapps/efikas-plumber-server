import { z } from 'zod';
import { TrainingCategory } from '@prisma/client';

// Booleanish so multipart form fields ("true"/"false" strings) validate the
// same as a plain JSON body's real boolean.
const booleanish = z.preprocess((v) => {
  if (typeof v === 'string') return v === 'true' || v === '1';
  return v;
}, z.boolean());

export const submitContentSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    category: z.nativeEnum(TrainingCategory),
    videoUrl: z.string().url().optional(),
    videoFileUrl: z.string().url().optional(),
    guidePdfUrl: z.string().url().optional(),
    downloadable: booleanish.optional().default(false),
  })
  .refine((data) => !!data.videoUrl || !!data.videoFileUrl, {
    message: 'Either videoUrl or an uploaded video file is required',
    path: ['videoUrl'],
  });

export const updateContentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.nativeEnum(TrainingCategory).optional(),
  videoUrl: z.string().url().optional(),
  videoFileUrl: z.string().url().optional(),
  guidePdfUrl: z.string().url().optional(),
  downloadable: booleanish.optional(),
});

export const contentIdParamSchema = z.object({
  id: z.string().min(1),
});

export const rejectContentSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const publicListQuerySchema = z.object({
  category: z.nativeEnum(TrainingCategory).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
