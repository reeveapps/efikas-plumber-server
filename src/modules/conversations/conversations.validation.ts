import { z } from 'zod';

export const conversationIdParamSchema = z.object({
  id: z.string().min(1),
});

export const plumberIdParamSchema = z.object({
  plumberId: z.string().min(1),
});

export const partnerIdParamSchema = z.object({
  partnerId: z.string().min(1),
});

export const startWithSupplierQuerySchema = z.object({
  productId: z.string().min(1).optional(),
});

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const messageSchema = z
  .object({
    body: z.string().min(1).optional(),
    attachmentUrl: z.string().url().optional(),
  })
  .refine((d) => !!d.body || !!d.attachmentUrl, {
    message: 'Either body or attachmentUrl is required',
  });
