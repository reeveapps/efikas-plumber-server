import { z } from 'zod';

export const createCompanySchema = z.object({
  name: z.string().min(1).max(200),
  registrationNumber: z.string().min(1).max(120).optional(),
});

export const updateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  registrationNumber: z.string().min(1).max(120).optional(),
  logoUrl: z.string().url().optional(),
});

export const addPlumberSchema = z
  .object({
    phone: z.string().min(1).optional(),
    email: z.string().email().optional(),
  })
  .refine((data) => !!data.phone || !!data.email, {
    message: 'Either phone or email is required',
    path: ['phone'],
  });

export const plumberIdParamSchema = z.object({
  plumberId: z.string().min(1),
});

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const assignBookingParamSchema = z.object({
  bookingId: z.string().min(1),
});

export const assignBookingSchema = z.object({
  plumberId: z.string().min(1),
});

export const reportsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const reportsExportQuerySchema = reportsQuerySchema.extend({
  format: z.enum(['csv', 'pdf']).default('csv'),
});

export const subscribeSchema = z.object({
  planId: z.string().min(1),
});
