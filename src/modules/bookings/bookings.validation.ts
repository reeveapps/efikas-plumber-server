import { z } from 'zod';
import { DisputeReason, PaymentProvider, ServiceCategory } from '@prisma/client';

// Accepts both real booleans (JSON body) and stringified booleans (multipart form fields).
const booleanish = z.preprocess((v) => {
  if (typeof v === 'string') return v === 'true' || v === '1';
  return v;
}, z.boolean());

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const bookingIdParamSchema = z.object({
  bookingId: z.string().min(1),
});

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createBookingSchema = z.object({
  category: z.nativeEnum(ServiceCategory),
  subCategory: z.string().optional(),
  description: z.string().optional(),
  voiceNoteUrl: z.string().url().optional(),
  photoUrls: z.array(z.string().url()).optional(),
  address: z.string().min(1),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  preferredAt: z.coerce.date().optional(),
  isAsap: booleanish.optional().default(true),
});

export const selectPlumberSchema = z.object({
  plumberId: z.string().min(1).optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['EN_ROUTE', 'ARRIVED', 'INSPECTING', 'IN_PROGRESS']),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  note: z.string().optional(),
});

export const paymentRecordSchema = z.object({
  amountKes: z.coerce.number().int().positive(),
  method: z.nativeEnum(PaymentProvider),
});

export const reviewSchema = z.object({
  punctualityRating: z.coerce.number().int().min(1).max(5),
  professionalismRating: z.coerce.number().int().min(1).max(5),
  qualityRating: z.coerce.number().int().min(1).max(5),
  valueRating: z.coerce.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const disputeSchema = z.object({
  reason: z.nativeEnum(DisputeReason),
  description: z.string().min(1),
  photoUrls: z.array(z.string().url()).optional().default([]),
});

export const messageSchema = z
  .object({
    body: z.string().min(1).optional(),
    attachmentUrl: z.string().url().optional(),
  })
  .refine((d) => !!d.body || !!d.attachmentUrl, {
    message: 'Either body or attachmentUrl is required',
  });
