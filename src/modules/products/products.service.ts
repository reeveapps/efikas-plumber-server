import { AdBillingInterval, Role, ServiceCategory } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';
import { sendDeliveryRequestEmail } from '../../utils/email/index.js';
import { emitDeliveryRequest } from '../../realtime/socket.js';

// Day-count based rather than true calendar months/years — avoids Postgres/JS
// calendar-arithmetic edge cases (Jan 31 + 1 month?) and keeps every interval's
// alignment check identical: `endDate` must be startDate + N × these days.
const INTERVAL_DAYS: Record<AdBillingInterval, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
  YEARLY: 365,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CreateProductInput {
  name: string;
  description?: string;
  priceKes?: number;
  imageUrl?: string;
  imageUrls?: string[];
  locationAddress?: string;
  category: ServiceCategory[];
}

export async function createProduct(partnerId: string, data: CreateProductInput) {
  return prisma.product.create({
    data: {
      partnerId,
      name: data.name,
      description: data.description,
      priceKes: data.priceKes,
      imageUrl: data.imageUrl,
      imageUrls: data.imageUrls ?? [],
      locationAddress: data.locationAddress,
      category: data.category,
      status: 'PENDING_APPROVAL', 
    },
  });
}

export async function listMyProducts(partnerId: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.product.findMany({
    where: { partnerId },
    orderBy: { id: 'asc' },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  return paginateResults(rows, limit);
}

// Public-facing (customer search / product details) — only ever surfaces
// ACTIVE products, never a partner's DRAFT/PENDING_APPROVAL/PAUSED/REJECTED
// listings.
const PRODUCT_PUBLIC_INCLUDE = {
  partner: { select: { id: true, businessName: true } },
};

export async function searchProducts(q: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.product.findMany({
    where: { status: 'ACTIVE', name: { contains: q, mode: 'insensitive' } },
    orderBy: [{ id: 'asc' }],
    include: PRODUCT_PUBLIC_INCLUDE,
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  return paginateResults(rows, limit);
}

export async function getPublicProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: PRODUCT_PUBLIC_INCLUDE });
  if (!product || product.status !== 'ACTIVE') throw createError('Product not found', 404);
  return product;
}

// Product ids currently running an approved, paid, in-window ad campaign —
// used to both order the Marketplace feed (sponsored first) and flag each
// product with `sponsored: true` for the client to badge.
async function getSponsoredProductIds(): Promise<Set<string>> {
  const now = new Date();
  const activeAds = await prisma.ad.findMany({
    where: { isApproved: true, isActive: true, startDate: { lte: now }, endDate: { gte: now } },
    select: { productId: true },
    distinct: ['productId'],
  });
  return new Set(activeAds.map((ad) => ad.productId));
}

// Marketplace browse — every ACTIVE product, sponsored ones first. Sponsored
// products are a small, bounded set in practice (paid ad campaigns), so
// they're fetched in full and prepended to the first page only, rather than
// folded into the cursor-paginated query itself (which would need a raw SQL
// "ORDER BY has-active-ad" to paginate correctly across both sets).
export async function browseProducts(category: ServiceCategory | undefined, cursor: string | undefined, limit: number) {
  const sponsoredIds = await getSponsoredProductIds();

  const baseWhere = {
    status: 'ACTIVE' as const,
    ...(category ? { category: { has: category } } : {}),
  };

  const sponsoredProducts = !cursor && sponsoredIds.size
    ? await prisma.product.findMany({
        where: { ...baseWhere, id: { in: Array.from(sponsoredIds) } },
        include: PRODUCT_PUBLIC_INCLUDE,
        orderBy: { id: 'asc' },
      })
    : [];

  const rows = await prisma.product.findMany({
    where: { ...baseWhere, id: { notIn: Array.from(sponsoredIds) } },
    orderBy: [{ id: 'asc' }],
    include: PRODUCT_PUBLIC_INCLUDE,
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  const page = paginateResults(rows, limit);

  const items = [...sponsoredProducts, ...page.items].map((p) => ({ ...p, sponsored: sponsoredIds.has(p.id) }));
  return { items, nextCursor: page.nextCursor };
}

const RELATED_PRODUCTS_LIMIT = 4;

// Up to 4 products sharing a category with `productId`, sponsored ones
// first — powers the "Related Products" section on the product detail page.
export async function getRelatedProducts(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { category: true } });
  if (!product || !product.category.length) return [];

  const sponsoredIds = await getSponsoredProductIds();

  // Small over-fetch so sponsored-first sorting has enough candidates to
  // work with, then trimmed down to the actual limit below.
  const candidates = await prisma.product.findMany({
    where: { status: 'ACTIVE', id: { not: productId }, category: { hasSome: product.category } },
    include: PRODUCT_PUBLIC_INCLUDE,
    take: 20,
  });

  candidates.sort((a, b) => Number(sponsoredIds.has(b.id)) - Number(sponsoredIds.has(a.id)));
  return candidates.slice(0, RELATED_PRODUCTS_LIMIT).map((p) => ({ ...p, sponsored: sponsoredIds.has(p.id) }));
}

async function getOwnedProductOrThrow(id: string, partnerId: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.partnerId !== partnerId) throw createError('Product not found', 404);
  return product;
}

// Same ownership check as the other partner-only product operations, just
// exposed for the "edit product" page's initial fetch (the public endpoint
// only ever returns ACTIVE products, which isn't good enough for an owner
// editing a DRAFT/PAUSED one).
export async function getMyProduct(id: string, partnerId: string) {
  return getOwnedProductOrThrow(id, partnerId);
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  priceKes?: number;
  imageUrl?: string;
  imageUrls?: string[];
  locationAddress?: string;
  category?: ServiceCategory[];
  status?: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'PAUSED' | 'REJECTED';
  stockStatus?: string;
}

export async function updateProduct(id: string, partnerId: string, data: UpdateProductInput) {
  await getOwnedProductOrThrow(id, partnerId);
  return prisma.product.update({ where: { id }, data });
}

export async function deleteProduct(id: string, partnerId: string): Promise<void> {
  await getOwnedProductOrThrow(id, partnerId);

  // Ads, delivery requests, and concerns are real business/audit records —
  // cascading them away on product delete would silently destroy billing and
  // dispute history, so a product with any of that history can't be hard-deleted.
  // Pausing (status: 'PAUSED') hides it from customers/plumbers without losing
  // the history; that's the only option once a product has been advertised,
  // ordered, or reported.
  const [adCount, deliveryRequestCount, concernCount] = await Promise.all([
    prisma.ad.count({ where: { productId: id } }),
    prisma.deliveryRequest.count({ where: { productId: id } }),
    prisma.productConcern.count({ where: { productId: id } }),
  ]);
  if (adCount > 0 || deliveryRequestCount > 0 || concernCount > 0) {
    throw createError(
      'This product has campaign, delivery, or concern history and can\'t be deleted. Pause it instead to hide it from customers and plumbers.',
      409
    );
  }

  await prisma.product.delete({ where: { id } });
}

export interface CreateAdInput {
  actionType: 'CALL' | 'REQUEST_DELIVERY' | 'SAVE_PRODUCT' | 'EXTERNAL_LINK';
  externalUrl?: string;
  targetLocations: string[];
  targetAudience: Role[];
  billingInterval: AdBillingInterval;
  startDate: Date;
  endDate: Date;
}

// Submitting moves the ad to pending-approval only — payment (and thus
// `isActive`) is deliberately requested *after* admin approval, not here, so
// a partner never pays for a campaign that might get rejected. See
// docs/05-partner-portal-web-app.md section 5.4's ordering note.
//
// billingAmountKes is entirely server-computed here (never trust a client
// figure — payments.service.ts's initiateStkPush reads this same column
// rather than any client-supplied amount): endDate must land exactly on a
// multiple of the chosen interval's day-count after startDate (e.g. WEEKLY
// requires exactly 7/14/21/... days), and the total is that many units times
// whatever an admin has set for that interval via PUT /ads/pricing/:interval.
export async function createAd(productId: string, partnerId: string, data: CreateAdInput) {
  await getOwnedProductOrThrow(productId, partnerId);

  const intervalDays = INTERVAL_DAYS[data.billingInterval];
  const diffDays = Math.round((data.endDate.getTime() - data.startDate.getTime()) / MS_PER_DAY);
  if (diffDays <= 0 || diffDays % intervalDays !== 0) {
    throw createError(
      `For a ${data.billingInterval.toLowerCase()} campaign, the end date must be exactly a multiple of ${intervalDays} day(s) after the start date.`,
      400
    );
  }
  const units = diffDays / intervalDays;

  const rate = await prisma.adPricingRate.findUnique({ where: { interval: data.billingInterval } });
  if (!rate) {
    throw createError('Pricing has not been configured for this interval yet — contact an admin.', 409);
  }

  return prisma.ad.create({
    data: {
      productId,
      actionType: 'REQUEST_DELIVERY',//data.actionType,
      externalUrl: data.externalUrl,
      targetLocations: data.targetLocations,
      targetAudience: data.targetAudience,
      startDate: data.startDate,
      endDate: data.endDate,
      billingInterval: data.billingInterval,
      billingAmountKes: rate.priceKes * units,
      isApproved: false,
    },
  });
}

export async function getAdAnalytics(productId: string, adId: string, partnerId: string) {
  await getOwnedProductOrThrow(productId, partnerId);
  const ad = await prisma.ad.findUnique({ where: { id: adId } });
  if (!ad || ad.productId !== productId) throw createError('Ad not found', 404);

  // Approximation: DeliveryRequest has no direct FK back to the Ad that drove it,
  // so "leads" is counted as delivery requests for the same product within the ad's
  // active window — this may over/undercount if multiple ads target the same product.
  const leads = await prisma.deliveryRequest.count({
    where: { productId: ad.productId, createdAt: { gte: ad.startDate, lte: ad.endDate } },
  });

  return { impressions: ad.impressions, clicks: ad.clicks, leads };
}

export interface DailyAnalyticsPoint {
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  deliveryRequests: number;
}

export async function getAdAnalyticsDaily(
  productId: string,
  adId: string,
  partnerId: string,
  days: number
): Promise<DailyAnalyticsPoint[]> {
  await getOwnedProductOrThrow(productId, partnerId);
  const ad = await prisma.ad.findUnique({ where: { id: adId } });
  if (!ad || ad.productId !== productId) throw createError('Ad not found', 404);

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const rows = await prisma.$queryRaw<{ day: Date; type: string; count: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day, "type", COUNT(*)::bigint AS count
    FROM "AdEvent"
    WHERE "adId" = ${adId} AND "createdAt" >= ${since}
    GROUP BY day, "type"
    ORDER BY day ASC
  `;

  const byDay = new Map<string, DailyAnalyticsPoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { date: key, impressions: 0, clicks: 0, deliveryRequests: 0 });
  }

  for (const row of rows) {
    const key = row.day.toISOString().slice(0, 10);
    const point = byDay.get(key);
    if (!point) continue;
    const count = Number(row.count);
    if (row.type === 'IMPRESSION') point.impressions = count;
    else if (row.type === 'CLICK') point.clicks = count;
    else if (row.type === 'DELIVERY_REQUEST') point.deliveryRequests = count;
  }

  return Array.from(byDay.values());
}

export interface CreateDeliveryRequestInput {
  quantity: number;
  address: string;
  contactPhone: string;
  preferredAt?: Date;
}

export async function createDeliveryRequest(
  productId: string,
  requester: { userId: string; role: Role; profileId: string },
  data: CreateDeliveryRequestInput
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { partner: { select: { userId: true, businessName: true, user: { select: { email: true } } } } },
  });
  if (!product) throw createError('Product not found', 404);

  const deliveryRequest = await prisma.deliveryRequest.create({
    data: {
      productId,
      customerId: requester.role === Role.CUSTOMER ? requester.profileId : undefined,
      plumberId: requester.role === Role.PLUMBER ? requester.profileId : undefined,
      quantity: data.quantity,
      address: data.address,
      contactPhone: data.contactPhone,
      preferredAt: data.preferredAt,
    },
  });

  emitDeliveryRequest(product.partner.userId, deliveryRequest.id);

  if (product.partner.user.email) {
    try {
      await sendDeliveryRequestEmail({
        to: product.partner.user.email,
        partnerName: product.partner.businessName,
        productName: product.name,
        quantity: data.quantity,
        address: data.address,
        contactPhone: data.contactPhone,
      });
    } catch (err) {
      console.error('[EMAIL] delivery request notify failed:', err);
    }
  }

  // Same approximation as getAdAnalytics below: DeliveryRequest has no FK back to the
  // Ad that drove it, so attribute the lead to whichever active approved ad is running
  // for this product right now (best-effort, may miss/misattribute if none or several).
  const now = new Date();
  const activeAd = await prisma.ad.findFirst({
    where: { productId, isApproved: true, startDate: { lte: now }, endDate: { gte: now } },
  });
  if (activeAd) {
    await prisma.adEvent.create({
      data: { adId: activeAd.id, type: 'DELIVERY_REQUEST', userRole: requester.role },
    });
  }

  return deliveryRequest;
}
