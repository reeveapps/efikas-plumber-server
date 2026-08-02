import { z } from 'zod';
import { DeliveryRequestStatus } from '@prisma/client';

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const deliveryRequestIdParamSchema = z.object({
  id: z.string().min(1),
});

export const updateStatusSchema = z.object({
  status: z.nativeEnum(DeliveryRequestStatus),
});
