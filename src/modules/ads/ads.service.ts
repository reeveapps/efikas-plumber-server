import { AdBillingInterval, Prisma, Role, ServiceCategory } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';
import { sendCampaignApprovedEmail } from '../../utils/email/index.js';

export interface FeedFilters {
  category?: ServiceCategory;
  location?: string;
  callerRole?: Role;
}

export async function getFeed(filters: FeedFilters, cursor: string | undefined, limit: number) {
  const now = new Date();
  const where: Prisma.AdWhereInput = {
    isApproved: true,
    startDate: { lte: now },
    endDate: { gte: now },
  };

  if (filters.category) {
    where.product = { category: { has: filters.category } };
  }

  if (filters.location) {
    where.OR = [{ targetLocations: { isEmpty: true } }, { targetLocations: { has: filters.location } }];
  }

  // Audience targeting only makes sense for CUSTOMER/PLUMBER; anonymous callers or
  // other roles see all approved ads regardless of targetAudience.
  if (filters.callerRole === Role.CUSTOMER || filters.callerRole === Role.PLUMBER) {
    where.targetAudience = { has: filters.callerRole };
  }

  const rows = await prisma.ad.findMany({
    where,
    orderBy: { id: 'asc' },
    include: { product: { select: { name: true, imageUrl: true, priceKes: true } } },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });

  return paginateResults(rows, limit);
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const SPOTLIGHT_POOL_SIZE = 50;

export interface SpotlightAd {
  id: string;
  productId: string;
  imageUrl: string | null;
  priceKes: number | null;
}


export async function getSpotlightAds(
  callerRole: Role | undefined,
  callerProfileId: string | undefined,
  limit: number
): Promise<SpotlightAd[]> {
  const now = new Date();
  const where: Prisma.AdWhereInput = {
    isApproved: true,
    isActive: true,
    startDate: { lte: now },
    endDate: { gte: now },
  };
  if (callerRole === Role.CUSTOMER || callerRole === Role.PLUMBER) {
    where.targetAudience = { has: callerRole };
  }

  const pool = await prisma.ad.findMany({
    where,
    take: SPOTLIGHT_POOL_SIZE,
    include: { product: { select: { id: true, imageUrl: true, priceKes: true, category: true } } },
  });

  const shuffled = shuffle(pool);

  if (callerRole === Role.PLUMBER && callerProfileId) {
    const profile = await prisma.plumberProfile.findUnique({
      where: { id: callerProfileId },
      select: { skills: true },
    });
    const skills = profile?.skills ?? [];
    if (skills.length) {
      shuffled.sort((a, b) => {
        const aMatches = a.product.category.some((c) => skills.includes(c)) ? 1 : 0;
        const bMatches = b.product.category.some((c) => skills.includes(c)) ? 1 : 0;
        return bMatches - aMatches;
      });
    }
  }

  return shuffled.slice(0, limit).map((ad) => ({
    id: ad.id,
    productId: ad.product.id,
    imageUrl: ad.product.imageUrl,
    priceKes: ad.product.priceKes,
  }));
}

export async function recordImpression(id: string, userRole: Role | undefined) {
  const ad = await prisma.ad.findUnique({ where: { id } });
  if (!ad) throw createError('Ad not found', 404);
  await prisma.adEvent.create({ data: { adId: id, type: 'IMPRESSION', userRole } });
  return prisma.ad.update({ where: { id }, data: { impressions: { increment: 1 } } });
}

export async function recordClick(id: string, userRole: Role | undefined) {
  const ad = await prisma.ad.findUnique({ where: { id } });
  if (!ad) throw createError('Ad not found', 404);
  await prisma.adEvent.create({ data: { adId: id, type: 'CLICK', userRole } });
  return prisma.ad.update({ where: { id }, data: { clicks: { increment: 1 } } });
}

export async function listPending(cursor: string | undefined, limit: number) {
  const rows = await prisma.ad.findMany({
    where: { isApproved: false },
    orderBy: { id: 'asc' },
    include: {
      product: { select: { id: true, name: true, imageUrl: true, partner: { select: { businessName: true } } } },
    },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  return paginateResults(rows, limit);
}

export async function approve(id: string, approve: boolean, adminUserId: string) {
  const ad = await prisma.ad.findUnique({
    where: { id },
    include: { product: { include: { partner: { select: { businessName: true, user: { select: { email: true } } } } } } },
  });
  if (!ad) throw createError('Ad not found', 404);

  if (!approve) {
    // The schema only models `isApproved: Boolean` — there's no rejected state with a
    // reason to persist. Treat `approve: false` as a no-op and return the ad unchanged.
    // A true rejection flow would need a schema change (e.g. a status enum on Ad).
    return ad;
  }

  const updated = await prisma.ad.update({ where: { id }, data: { isApproved: true, approvedById: adminUserId } });

  if (ad.product.partner.user.email) {
    try {
      await sendCampaignApprovedEmail({
        to: ad.product.partner.user.email,
        partnerName: ad.product.partner.businessName,
        productName: ad.product.name,
      });
    } catch (err) {
      console.error('[EMAIL] campaign approval notify failed:', err);
    }
  }

  return updated;
}


export async function listPricing() {
  return prisma.adPricingRate.findMany({ orderBy: { interval: 'asc' } });
}

export async function setPricing(interval: AdBillingInterval, priceKes: number) {
  return prisma.adPricingRate.upsert({
    where: { interval },
    create: { interval, priceKes },
    update: { priceKes },
  });
}
