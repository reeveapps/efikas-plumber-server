import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';

export interface UpdatePartnerInput {
  businessName?: string;
  category?: string;
  location?: string;
  logoUrl?: string;
}


export async function updateMe(userId: string, data: UpdatePartnerInput) {
  const profile = await prisma.partnerProfile.update({ where: { userId }, data });
  return profile;
}

export async function getMe(userId: string) {
  const profile = await prisma.partnerProfile.findUnique({ where: { userId } });
  if (!profile) throw createError('Partner profile not found', 404);
  return profile;
}

export async function listMyAds(partnerId: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.ad.findMany({
    where: { product: { partnerId } },
    orderBy: [{ id: 'asc' }],
    include: { product: { select: { id: true, name: true, imageUrl: true } } },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  return paginateResults(rows, limit);
}


export async function getDashboardSummary(partnerId: string, userId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    activeCampaigns,
    productsListed,
    leadsThisMonth,
    spendResult,
    unfulfilledRequestsCount,
    unreadConversationIds,
  ] = await Promise.all([
    prisma.ad.count({ where: { product: { partnerId }, isActive: true, endDate: { gte: now } } }),
    prisma.product.count({ where: { partnerId } }),
    prisma.deliveryRequest.count({ where: { product: { partnerId }, createdAt: { gte: monthStart } } }),
    prisma.payment.aggregate({
      where: { userId, type: 'AD_CAMPAIGN', status: 'SUCCESS' },
      _sum: { amountKes: true },
    }),
    // "Unfulfilled" = still awaiting the partner's action, not yet declined/fulfilled.
    prisma.deliveryRequest.count({ where: { product: { partnerId }, status: { in: ['PENDING', 'CONFIRMED'] } } }),
    prisma.conversationMessage.findMany({
      where: {
        senderId: { not: userId },
        readAt: null,
        conversation: { OR: [{ userAId: userId }, { userBId: userId }] },
      },
      distinct: ['conversationId'],
      select: { conversationId: true },
    }),
  ]);

  return {
    activeCampaigns,
    productsListed,
    leadsThisMonth,
    totalSpendKes: spendResult._sum.amountKes ?? 0,
    unfulfilledRequestsCount,
    unreadChatsCount: unreadConversationIds.length,
  };
}

export async function getDashboardAnalyticsDaily(partnerId: string, days: number) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceUtcMidnight = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));

  const [adEventRows, deliveryRequestRows] = await Promise.all([
    prisma.$queryRaw<{ day: Date; type: string; count: bigint }[]>`
      SELECT date_trunc('day', "AdEvent"."createdAt" AT TIME ZONE 'UTC') AS day, "AdEvent"."type", COUNT(*)::bigint AS count
      FROM "AdEvent"
      INNER JOIN "Ad" ON "Ad"."id" = "AdEvent"."adId"
      INNER JOIN "Product" ON "Product"."id" = "Ad"."productId"
      WHERE "Product"."partnerId" = ${partnerId} AND "AdEvent"."createdAt" >= ${sinceUtcMidnight}
      GROUP BY day, "AdEvent"."type"
      ORDER BY day ASC
    `,
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "DeliveryRequest"."createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS count
      FROM "DeliveryRequest"
      INNER JOIN "Product" ON "Product"."id" = "DeliveryRequest"."productId"
      WHERE "Product"."partnerId" = ${partnerId} AND "DeliveryRequest"."createdAt" >= ${sinceUtcMidnight}
      GROUP BY day
      ORDER BY day ASC
    `,
  ]);

  const byDay = new Map<string, { date: string; impressions: number; clicks: number; deliveryRequests: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(sinceUtcMidnight);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { date: key, impressions: 0, clicks: 0, deliveryRequests: 0 });
  }

  for (const row of adEventRows) {
    const key = row.day.toISOString().slice(0, 10);
    const point = byDay.get(key);
    if (!point) continue;
    const count = Number(row.count);
    if (row.type === 'IMPRESSION') point.impressions = count;
    else if (row.type === 'CLICK') point.clicks = count;
  }

  for (const row of deliveryRequestRows) {
    const key = row.day.toISOString().slice(0, 10);
    const point = byDay.get(key);
    if (point) point.deliveryRequests = Number(row.count);
  }

  return Array.from(byDay.values());
}

export async function getBillingHistory(userId: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.payment.findMany({
    where: { userId, type: 'AD_CAMPAIGN' },
    orderBy: [{ id: 'desc' }],
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  return paginateResults(rows, limit);
}
