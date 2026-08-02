import { z } from 'zod';
import { AdBillingInterval, ServiceCategory } from '@prisma/client';

export const feedQuerySchema = z.object({
  category: z.nativeEnum(ServiceCategory).optional(),
  location: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const spotlightQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adIdParamSchema = z.object({
  id: z.string().min(1),
});

export const approveSchema = z.object({
  approve: z.boolean(),
});

export const pricingIntervalParamSchema = z.object({
  interval: z.nativeEnum(AdBillingInterval),
});

export const setPricingSchema = z.object({
  priceKes: z.coerce.number().int().positive(),
});
