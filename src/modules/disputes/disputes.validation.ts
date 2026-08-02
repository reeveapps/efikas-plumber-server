import { z } from 'zod';
import { ConcernStatus } from '@prisma/client';

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminListQuerySchema = listQuerySchema.extend({
  status: z.nativeEnum(ConcernStatus).optional(),
});

export const updateStatusSchema = z.object({
  status: z.nativeEnum(ConcernStatus),
});

export const resolveDisputeSchema = z.object({
  resolutionNote: z.string().min(1),
  outcome: z.enum(['RESOLVED_CUSTOMER', 'RESOLVED_OTHER_PARTY', 'DISMISSED']),
});
