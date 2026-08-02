import { z } from 'zod';

export const createLocationSchema = z.object({
  label: z.string().min(1).max(60),
  address: z.string().min(1).max(255),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  isDefault: z.boolean().optional(),
});

export const updateLocationSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  address: z.string().min(1).max(255).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  isDefault: z.boolean().optional(),
});

export const locationIdParamSchema = z.object({
  id: z.string().min(1),
});

export const bookingIdParamSchema = z.object({
  id: z.string().min(1),
});

export const listBookingsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
