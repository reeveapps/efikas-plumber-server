import { z } from 'zod';
import { AdminPermission, ConcernStatus, PaymentStatus, PaymentType, Role, VerificationStatus } from '@prisma/client';

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createSuperAdminSchema = z
  .object({
    setupSecret: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    password: z.string().min(8),
  })
  .refine((data) => data.email || data.phone, { message: 'Either email or phone is required' });

export const listAuditLogsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  actorId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const plumberIdParamSchema = z.object({
  plumberId: z.string().min(1),
});

export const listUsersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.nativeEnum(Role).optional(),
  status: z.enum(['active', 'banned', 'inactive']).optional(),
  search: z.string().optional(),
});

export const banUserSchema = z.object({
  banned: z.boolean(),
  reason: z.string().optional(),
});

export const rejectKycSchema = z.object({
  reason: z.string().min(1),
});

export const partnerIdParamSchema = z.object({
  partnerId: z.string().min(1),
});

export const productIdParamSchema = z.object({
  productId: z.string().min(1),
});

export const inviteAdminSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email().optional(),
    phone: z.string().min(9).max(15).optional(),
    permissions: z.array(z.nativeEnum(AdminPermission)).default([]),
  })
  .refine((d) => !!d.email || !!d.phone, { message: 'Either email or phone is required', path: ['email'] });

export const adminIdParamSchema = z.object({
  id: z.string().min(1),
});

export const updatePermissionsSchema = z.object({
  permissions: z.array(z.nativeEnum(AdminPermission)),
});

export const setActiveSchema = z.object({
  isActive: z.boolean(),
});

export const inviteTokenParamSchema = z.object({
  token: z.string().min(1),
});

export const acceptInviteSchema = z.object({
  password: z.string().min(8).max(200),
});

export const inviteIdParamSchema = z.object({
  inviteId: z.string().min(1),
});

export const searchListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export const listPlumbersQuerySchema = searchListQuerySchema.extend({
  status: z.nativeEnum(VerificationStatus).optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(9).max(15).optional(),
  segment: z.string().max(60).optional(),
});

export const updatePlumberSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(9).max(15).optional(),
  bio: z.string().max(1000).optional(),
  yearsExperience: z.coerce.number().int().min(0).max(60).optional(),
});

export const concernTypeParamSchema = z.object({
  type: z.enum(['SERVICE', 'PRODUCT']),
  id: z.string().min(1),
});

export const listConcernsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['ALL', 'SERVICE', 'PRODUCT']).default('ALL'),
  status: z.nativeEnum(ConcernStatus).optional(),
});

export const updateConcernStatusSchema = z.object({
  status: z.nativeEnum(ConcernStatus),
});

export const resolveConcernSchema = z.object({
  resolutionNote: z.string().min(1),
  outcome: z.enum(['RESOLVED_CUSTOMER', 'RESOLVED_OTHER_PARTY', 'DISMISSED']),
});

export const analyticsTrendsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export const billingHistoryQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.nativeEnum(PaymentType).optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
});

export const updatePartnerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(9).max(15).optional(),
  businessName: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(60).optional(),
  location: z.string().max(200).optional(),
});
