import { z } from 'zod';
import { AdActionType, AdBillingInterval, ProductStatus, Role, ServiceCategory } from '@prisma/client';

export const categoryArraySchema = z.array(
  z.enum(['LEAK', 'BLOCKAGE', 'INSTALLATION', 'REPAIR', 'GEYSER', 'EMERGENCY', 'OTHER'])
);

// Multipart form-data delivers `category` as a JSON-encoded string; plain JSON bodies
// send it as an actual array. Parse defensively in the controller before validating.
export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priceKes: z.coerce.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).max(4).optional(),
  locationAddress: z.string().max(500).optional(),
  category: categoryArraySchema.default([]),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  priceKes: z.coerce.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).max(4).optional(),
  locationAddress: z.string().max(500).optional(),
  category: categoryArraySchema.optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  stockStatus: z.enum(['in_stock', 'out_of_stock']).optional(),
});

export const productIdParamSchema = z.object({
  id: z.string().min(1),
});

export const productAdIdParamSchema = z.object({
  id: z.string().min(1),
  adId: z.string().min(1),
});

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchProductsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const browseProductsQuerySchema = z.object({
  category: z.nativeEnum(ServiceCategory).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// billingAmountKes is never accepted from the client — createAd computes it
// server-side from the admin-set AdPricingRate for `billingInterval`, times
// the number of interval units between startDate/endDate.
export const createAdSchema = z.object({
  actionType: z.nativeEnum(AdActionType),
  externalUrl: z.string().url().optional(),
  targetLocations: z.array(z.string()).default([]),
  targetAudience: z.array(z.nativeEnum(Role)).default([Role.CUSTOMER, Role.PLUMBER]),
  billingInterval: z.nativeEnum(AdBillingInterval),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

export const adAnalyticsDailyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export const createDeliveryRequestSchema = z.object({
  quantity: z.coerce.number().int().positive().default(1),
  address: z.string().min(1).max(500),
  contactPhone: z.string().min(1).max(30),
  preferredAt: z.coerce.date().optional(),
});
