import { z } from 'zod';
import { PaymentType } from '@prisma/client';

export const stkPushSchema = z
  .object({
    type: z.enum([PaymentType.SUBSCRIPTION, PaymentType.AD_CAMPAIGN]),
    subscriptionId: z.string().min(1).optional(),
    adId: z.string().min(1).optional(),
    amountKes: z.number().int().positive(),
    phone: z.string().min(9),
  })
  .refine((data) => data.type !== PaymentType.SUBSCRIPTION || !!data.subscriptionId, {
    message: 'subscriptionId is required when type is SUBSCRIPTION',
    path: ['subscriptionId'],
  })
  .refine((data) => data.type !== PaymentType.AD_CAMPAIGN || !!data.adId, {
    message: 'adId is required when type is AD_CAMPAIGN',
    path: ['adId'],
  });

export const paymentIdParamSchema = z.object({
  id: z.string().min(1),
});

export const callbackSecretParamSchema = z.object({
  secret: z.string().min(1),
});

export const listMyPaymentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

export const mpesaQuerySchema = z.object({
  paymentId: z.string().min(1),
});
