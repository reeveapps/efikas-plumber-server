import { Request, Response } from 'express';
import { ServiceCategory } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import { uploadToR2 } from '../../utils/r2.js';
import { createProductSchema, updateProductSchema } from './products.validation.js';
import * as productsService from './products.service.js';

// category arrives as a JSON string in multipart form-data, or as a real array
// in a plain JSON body — parse defensively, falling back to treating it as-is.
function parseCategory(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  let imageUrls = req.body.imageUrls as string[] | undefined;
  if (files.length) {
    imageUrls = await Promise.all(
      files.map((f) => uploadToR2({ buffer: f.buffer, mimetype: f.mimetype, originalname: f.originalname }, 'products'))
    );
  }

  const parsed = createProductSchema.parse({
    ...req.body,
    category: parseCategory(req.body.category) ?? [],
    imageUrls,
    imageUrl: imageUrls?.[0],
  });

  const product = await productsService.createProduct(req.user!.profileId, parsed);
  sendSuccess(res, product, undefined, 201);
});

export const listMyProducts = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await productsService.listMyProducts(req.user!.profileId, cursor, limit);
  sendSuccess(res, page);
});

export const getMyProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productsService.getMyProduct(req.params.id, req.user!.profileId);
  sendSuccess(res, product);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  let imageUrls: string[] | undefined;
  if (files.length) {
    imageUrls = await Promise.all(
      files.map((f) => uploadToR2({ buffer: f.buffer, mimetype: f.mimetype, originalname: f.originalname }, 'products'))
    );
  }

  const parsed = updateProductSchema.parse({
    ...req.body,
    ...(req.body.category !== undefined ? { category: parseCategory(req.body.category) } : {}),
    ...(imageUrls !== undefined ? { imageUrls, imageUrl: imageUrls[0] } : {}),
  });

  const product = await productsService.updateProduct(req.params.id, req.user!.profileId, parsed);
  sendSuccess(res, product);
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  await productsService.deleteProduct(req.params.id, req.user!.profileId);
  sendSuccess(res, null, 'Product deleted');
});

export const createAd = asyncHandler(async (req: Request, res: Response) => {
  const ad = await productsService.createAd(req.params.id, req.user!.profileId, req.body);
  sendSuccess(res, ad, undefined, 201);
});

export const getAdAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const analytics = await productsService.getAdAnalytics(req.params.id, req.params.adId, req.user!.profileId);
  sendSuccess(res, analytics);
});

export const getAdAnalyticsDaily = asyncHandler(async (req: Request, res: Response) => {
  const { days } = req.query as unknown as { days: number };
  const analytics = await productsService.getAdAnalyticsDaily(
    req.params.id,
    req.params.adId,
    req.user!.profileId,
    days
  );
  sendSuccess(res, analytics);
});

export const createDeliveryRequest = asyncHandler(async (req: Request, res: Response) => {
  const deliveryRequest = await productsService.createDeliveryRequest(req.params.id, req.user!, req.body);
  sendSuccess(res, deliveryRequest, undefined, 201);
});

export const searchProducts = asyncHandler(async (req: Request, res: Response) => {
  const { q, cursor, limit } = req.query as unknown as { q: string; cursor?: string; limit: number };
  const page = await productsService.searchProducts(q, cursor, limit);
  sendSuccess(res, page);
});

export const getPublicProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productsService.getPublicProduct(req.params.id);
  sendSuccess(res, product);
});

export const browseProducts = asyncHandler(async (req: Request, res: Response) => {
  const { category, cursor, limit } = req.query as unknown as {
    category?: ServiceCategory;
    cursor?: string;
    limit: number;
  };
  const page = await productsService.browseProducts(category, cursor, limit);
  sendSuccess(res, page);
});

export const getRelatedProducts = asyncHandler(async (req: Request, res: Response) => {
  const products = await productsService.getRelatedProducts(req.params.id);
  sendSuccess(res, products);
});
