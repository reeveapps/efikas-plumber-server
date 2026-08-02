import { z } from 'zod';
import { NotificationChannel, Role } from '@prisma/client';

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const broadcastSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  channels: z.array(z.nativeEnum(NotificationChannel)).min(1),
  segment: z
    .object({
      role: z.nativeEnum(Role).optional(),
      isGuest: z.boolean().optional(),
    })
    .optional(),
});

export const broadcastHistoryQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
