import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { AdminPermission, ConcernStatus, Prisma, Role, VerificationStatus } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';
import { sendPush } from '../../utils/push.js';
import { sendSms } from '../../utils/sms.js';
import { generateAccessToken, generateRefreshToken } from '../../utils/jwt.js';
import {
  sendAdminInviteEmail,
  sendPartnerAccountApprovedEmail,
  sendProductApprovedEmail,
} from '../../utils/email/index.js';
import { env } from '../../config/env.js';

type CursorArgs = { take: number; skip?: number; cursor?: { id: string } };

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function logAdminAction(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: object
) {
  await prisma.adminAuditLog.create({
    data: { actorId, action, targetType, targetId, metadata: metadata as Prisma.InputJsonValue | undefined },
  });
}


export async function getMe(userId: string, profileId: string) {
  const [user, adminProfile] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true, phone: true } }),
    prisma.adminProfile.findUniqueOrThrow({ where: { id: profileId } }),
  ]);
  return {
    user,
    isSuperAdmin: adminProfile.isSuperAdmin,
    permissions: adminProfile.permissions,
    isActive: adminProfile.isActive,
  };
}

export async function listUsers(params: {
  cursor?: string;
  limit: number;
  role?: Role;
  status?: 'active' | 'banned' | 'inactive';
  search?: string;
}) {
  const { cursor, limit, role, status, search } = params;

  const statusFilter =
    status === 'banned'
      ? { isBanned: true }
      : status === 'inactive'
        ? { isActive: false }
        : status === 'active'
          ? { isActive: true, isBanned: false }
          : {};

  const searchFilter = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const rows = await prisma.user.findMany({
    where: {
      ...(role ? { role } : {}),
      ...statusFilter,
      ...searchFilter,
    },
    orderBy: { id: 'asc' },
    ...(cursorArgs(cursor, limit) as CursorArgs),
  });

  const safeRows = rows.map(({ passwordHash: _passwordHash, ...rest }) => rest);
  return paginateResults(safeRows, limit);
}

export async function banUser(
  actorId: string,
  userId: string,
  data: { banned: boolean; reason?: string }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createError('User not found', 404);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isBanned: data.banned, bannedReason: data.reason ?? null },
  });

  await logAdminAction(actorId, data.banned ? 'BAN_USER' : 'UNBAN_USER', 'User', userId, {
    reason: data.reason,
  });

  const { passwordHash: _passwordHash, ...safeUser } = updated;
  return safeUser;
}

// --- Customers (docs/06 section 4.4) ---

function searchUserFilter(search: string | undefined) {
  return search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};
}

export async function listCustomers(cursor: string | undefined, limit: number, search: string | undefined) {
  const rows = await prisma.customerProfile.findMany({
    where: { user: { ...searchUserFilter(search) } },
    orderBy: { id: 'asc' },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, isBanned: true, createdAt: true } },
      _count: { select: { bookings: true } },
    },
    ...(cursorArgs(cursor, limit) as CursorArgs),
  });
  return paginateResults(rows, limit);
}

export async function getCustomerDetail(id: string) {
  const profile = await prisma.customerProfile.findUnique({
    where: { id },
    include: {
      user: true,
      savedLocations: true,
      bookings: { orderBy: { createdAt: 'desc' }, take: 20 },
      disputesFiled: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!profile) throw createError('Customer not found', 404);
  const { user, ...rest } = profile;
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return { ...rest, user: safeUser };
}

export async function updateCustomer(
  actorId: string,
  id: string,
  data: { name?: string; email?: string; phone?: string; segment?: string }
) {
  const profile = await prisma.customerProfile.findUnique({ where: { id } });
  if (!profile) throw createError('Customer not found', 404);

  const { name, email, phone, segment } = data;
  const [, updatedProfile] = await prisma.$transaction([
    prisma.user.update({ where: { id: profile.userId }, data: { name, email, phone } }),
    prisma.customerProfile.update({ where: { id }, data: { segment }, include: { user: true } }),
  ]);

  await logAdminAction(actorId, 'EDIT_CUSTOMER', 'CustomerProfile', id, data);
  const { passwordHash: _passwordHash, ...safeUser } = updatedProfile.user;
  return { ...updatedProfile, user: safeUser };
}

// --- Plumbers (docs/06 section 4.4) ---

export async function listPlumbers(
  cursor: string | undefined,
  limit: number,
  search: string | undefined,
  status: VerificationStatus | undefined
) {
  const rows = await prisma.plumberProfile.findMany({
    where: {
      user: { ...searchUserFilter(search) },
      ...(status ? { verificationStatus: status } : {}),
    },
    orderBy: { id: 'asc' },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, isBanned: true } },
      company: { select: { name: true } },
    },
    ...(cursorArgs(cursor, limit) as CursorArgs),
  });
  return paginateResults(rows, limit);
}

export async function getPlumberDetail(id: string) {
  const profile = await prisma.plumberProfile.findUnique({
    where: { id },
    include: {
      user: true,
      company: { select: { name: true } },
      bookings: { orderBy: { createdAt: 'desc' }, take: 20 },
      disputesAgainst: { orderBy: { createdAt: 'desc' }, take: 20 },
      reviewsReceived: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!profile) throw createError('Plumber not found', 404);
  const { user, ...rest } = profile;
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return { ...rest, user: safeUser };
}

export async function updatePlumber(
  actorId: string,
  id: string,
  data: { name?: string; email?: string; phone?: string; bio?: string; yearsExperience?: number }
) {
  const profile = await prisma.plumberProfile.findUnique({ where: { id } });
  if (!profile) throw createError('Plumber not found', 404);

  const { name, email, phone, bio, yearsExperience } = data;
  const [, updatedProfile] = await prisma.$transaction([
    prisma.user.update({ where: { id: profile.userId }, data: { name, email, phone } }),
    prisma.plumberProfile.update({ where: { id }, data: { bio, yearsExperience }, include: { user: true } }),
  ]);

  await logAdminAction(actorId, 'EDIT_PLUMBER', 'PlumberProfile', id, data);
  const { passwordHash: _passwordHash, ...safeUser } = updatedProfile.user;
  return { ...updatedProfile, user: safeUser };
}

// --- Partners (docs/06 section 4.4) ---

export async function listPartners(cursor: string | undefined, limit: number, search: string | undefined) {
  const rows = await prisma.partnerProfile.findMany({
    where: { user: { ...searchUserFilter(search) } },
    orderBy: { id: 'asc' },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, isBanned: true } },
      _count: { select: { products: true } },
    },
    ...(cursorArgs(cursor, limit) as CursorArgs),
  });
  return paginateResults(rows, limit);
}

export async function getPartnerDetail(id: string) {
  const profile = await prisma.partnerProfile.findUnique({
    where: { id },
    include: {
      user: true,
      products: { orderBy: { id: 'desc' }, take: 50, include: { ads: { orderBy: { id: 'desc' }, take: 5 } } },
    },
  });
  if (!profile) throw createError('Partner not found', 404);
  const { user, ...rest } = profile;
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return { ...rest, user: safeUser };
}

export async function updatePartner(
  actorId: string,
  id: string,
  data: { name?: string; email?: string; phone?: string; businessName?: string; category?: string; location?: string }
) {
  const profile = await prisma.partnerProfile.findUnique({ where: { id } });
  if (!profile) throw createError('Partner not found', 404);

  const { name, email, phone, businessName, category, location } = data;
  const [, updatedProfile] = await prisma.$transaction([
    prisma.user.update({ where: { id: profile.userId }, data: { name, email, phone } }),
    prisma.partnerProfile.update({ where: { id }, data: { businessName, category, location }, include: { user: true } }),
  ]);

  await logAdminAction(actorId, 'EDIT_PARTNER', 'PartnerProfile', id, data);
  const { passwordHash: _passwordHash, ...safeUser } = updatedProfile.user;
  return { ...updatedProfile, user: safeUser };
}

export async function listPendingKyc(cursor: string | undefined, limit: number) {
  const rows = await prisma.plumberProfile.findMany({
    where: { verificationStatus: VerificationStatus.PENDING },
    orderBy: { id: 'asc' },
    include: {
      user: { select: { name: true, phone: true } },
      company: { select: { name: true, registrationNumber: true } },
    },
    ...(cursorArgs(cursor, limit) as CursorArgs),
  });

  return paginateResults(rows, limit);
}

// Best-effort push telling plumbers their KYC review finished. The app's
// pending-review screen no longer polls for this — it tells the plumber a
// notification is coming (plus a manual Refresh), so this push is what
// actually delivers that promise.
async function notifyPlumbersOfKycDecision(plumberIds: string[], approved: boolean): Promise<void> {
  try {
    const tokens = await prisma.deviceToken.findMany({
      where: { user: { plumberProfile: { id: { in: plumberIds } } } },
      select: { fcmToken: true },
    });
    await sendPush(
      tokens.map((t) => t.fcmToken),
      approved
        ? { title: "You're approved!", body: 'Your account has been verified. You can now go online and accept jobs.', data: { type: 'kyc_approved' } }
        : { title: 'Verification update', body: 'We could not approve your documents. Open the app to see what to fix.', data: { type: 'kyc_rejected' } }
    );
  } catch (err) {
    console.error('[PUSH] KYC decision notify failed:', err);
  }
}

// Approving a company-affiliated plumber approves every plumber under that
// same Company in one action, not just the row that was clicked — a company
// isn't meaningfully "half verified", and there's no separate per-company
// approval screen, so this is the only trigger point for it.
export async function approveKyc(actorId: string, plumberId: string) {
  const plumber = await prisma.plumberProfile.findUnique({ where: { id: plumberId } });
  if (!plumber) throw createError('Plumber profile not found', 404);

  const now = new Date();

  if (plumber.companyId) {
    const toApprove = await prisma.plumberProfile.findMany({
      where: { companyId: plumber.companyId, verificationStatus: { not: VerificationStatus.APPROVED } },
      select: { id: true },
    });
    const [, updated] = await prisma.$transaction([
      prisma.company.update({
        where: { id: plumber.companyId },
        data: { verificationStatus: VerificationStatus.APPROVED },
      }),
      prisma.plumberProfile.updateMany({
        where: { companyId: plumber.companyId, verificationStatus: { not: VerificationStatus.APPROVED } },
        data: { verificationStatus: VerificationStatus.APPROVED, verifiedAt: now, verifiedById: actorId },
      }),
    ]);

    await logAdminAction(actorId, 'APPROVE_KYC', 'Company', plumber.companyId, {
      approvedPlumberCount: updated.count,
    });
    await notifyPlumbersOfKycDecision(toApprove.map((p) => p.id), true);

    return prisma.plumberProfile.findUniqueOrThrow({ where: { id: plumberId } });
  }

  const updated = await prisma.plumberProfile.update({
    where: { id: plumberId },
    data: {
      verificationStatus: VerificationStatus.APPROVED,
      verifiedAt: now,
      verifiedById: actorId,
    },
  });

  await logAdminAction(actorId, 'APPROVE_KYC', 'PlumberProfile', plumberId);
  await notifyPlumbersOfKycDecision([plumberId], true);

  return updated;
}

export async function rejectKyc(actorId: string, plumberId: string, reason: string) {
  const plumber = await prisma.plumberProfile.findUnique({ where: { id: plumberId } });
  if (!plumber) throw createError('Plumber profile not found', 404);

  const updated = await prisma.plumberProfile.update({
    where: { id: plumberId },
    data: { verificationStatus: VerificationStatus.REJECTED },
  });

  await logAdminAction(actorId, 'REJECT_KYC', 'PlumberProfile', plumberId, { reason });
  await notifyPlumbersOfKycDecision([plumberId], false);

  return updated;
}

// --- Billing (docs/06 section 4.7) ---

// Payment has no declared relation to User (userId is a plain column, no
// `@relation` — see schema.prisma) so the user info is joined manually here
// rather than via `include`.
export async function getBillingHistory(
  cursor: string | undefined,
  limit: number,
  type: Prisma.PaymentWhereInput['type'],
  status: Prisma.PaymentWhereInput['status']
) {
  const rows = await prisma.payment.findMany({
    where: { ...(type ? { type } : {}), ...(status ? { status } : {}) },
    orderBy: { id: 'asc' },
    ...(cursorArgs(cursor, limit) as CursorArgs),
  });
  const page = paginateResults(rows, limit);

  const userIds = Array.from(new Set(page.items.map((p) => p.userId)));
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return { ...page, items: page.items.map((p) => ({ ...p, user: userById.get(p.userId) ?? null })) };
}

export async function listSubscriptions(cursor: string | undefined, limit: number) {
  const rows = await prisma.subscription.findMany({
    orderBy: { id: 'asc' },
    include: {
      plan: true,
      company: { select: { name: true } },
    },
    ...(cursorArgs(cursor, limit) as CursorArgs),
  });

  const revenueAggregate = await prisma.payment.aggregate({
    where: { type: 'SUBSCRIPTION', status: 'SUCCESS' },
    _sum: { amountKes: true },
    _count: true,
  });

  return {
    ...paginateResults(rows, limit),
    revenueOverview: {
      totalRevenueKes: revenueAggregate._sum.amountKes ?? 0,
      paymentCount: revenueAggregate._count,
    },
  };
}

// True retention/churn cohort analysis is out of scope for this pass — it would need
// a dedicated analytics job rather than ad-hoc counts computed on request. The
// proxies below (completionRate, customerRepeatRate, plumberActiveRate) are
// honest, directly-computable stand-ins, not full cohort retention curves.
export async function getAnalyticsOverview() {
  const [
    totalBookings,
    bookingsByStatus,
    totalUsers,
    usersByRole,
    revenueAggregate,
    activeSubscriptions,
    completedBookings,
    repeatCustomerRows,
    totalCustomersWithBookings,
    plumbersEverCompleted,
    plumbersActiveLast30d,
    activeSubs,
  ] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.groupBy({ by: ['status'], _count: true }),
    prisma.user.count(),
    prisma.user.groupBy({ by: ['role'], _count: true }),
    prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amountKes: true } }),
    prisma.subscription.count({ where: { status: 'ACTIVE' } }),
    prisma.booking.count({ where: { status: 'COMPLETED' } }),
    // "Repeat" = has more than one booking — computed via a raw count since
    // Prisma has no `having count > 1` on a relation count directly.
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT "customerId" FROM "Booking" GROUP BY "customerId" HAVING COUNT(*) > 1
      ) sub
    `,
    prisma.customerProfile.count({ where: { bookings: { some: {} } } }),
    prisma.plumberProfile.count({ where: { jobsCompletedCount: { gt: 0 } } }),
    prisma.plumberProfile.count({
      where: { bookings: { some: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } } },
    }),
    prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
      include: { plan: { select: { priceKes: true, billingCycle: true } } },
    }),
  ]);

  const repeatCustomers = Number(repeatCustomerRows[0]?.count ?? 0);
  const mrrKes = activeSubs.reduce(
    (sum, s) => sum + (s.plan.billingCycle === 'YEARLY' ? s.plan.priceKes / 12 : s.plan.priceKes),
    0
  );

  return {
    totalBookings,
    bookingsByStatus: bookingsByStatus.map((row) => ({ status: row.status, count: row._count })),
    totalUsers,
    usersByRole: usersByRole.map((row) => ({ role: row.role, count: row._count })),
    totalRevenueKes: revenueAggregate._sum.amountKes ?? 0,
    activeSubscriptions,
    completionRate: totalBookings > 0 ? completedBookings / totalBookings : 0,
    customerRepeatRate: totalCustomersWithBookings > 0 ? repeatCustomers / totalCustomersWithBookings : 0,
    plumberActiveRate: plumbersEverCompleted > 0 ? plumbersActiveLast30d / plumbersEverCompleted : 0,
    mrrKes: Math.round(mrrKes),
  };
}

// Daily booking volume + dispute count, for the "bookings over time" and
// "dispute rate trend" charts (PRD section 12: "Dispute rate < 5% of bookings").
export async function getAnalyticsTrends(days: number) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceUtcMidnight = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));

  const [bookingRows, disputeRows] = await Promise.all([
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS count
      FROM "Booking" WHERE "createdAt" >= ${sinceUtcMidnight} GROUP BY day ORDER BY day ASC
    `,
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS count
      FROM "Dispute" WHERE "createdAt" >= ${sinceUtcMidnight} GROUP BY day ORDER BY day ASC
    `,
  ]);

  const byDay = new Map<string, { date: string; bookings: number; disputes: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(sinceUtcMidnight);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { date: key, bookings: 0, disputes: 0 });
  }
  for (const row of bookingRows) {
    const point = byDay.get(row.day.toISOString().slice(0, 10));
    if (point) point.bookings = Number(row.count);
  }
  for (const row of disputeRows) {
    const point = byDay.get(row.day.toISOString().slice(0, 10));
    if (point) point.disputes = Number(row.count);
  }
  return Array.from(byDay.values());
}

// Subscription vs. ad-campaign revenue, day-bucketed.
export async function getRevenueBreakdown(days: number) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceUtcMidnight = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));

  const rows = await prisma.$queryRaw<{ day: Date; type: string; total: bigint }[]>`
    SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day, "type", COALESCE(SUM("amountKes"), 0)::bigint AS total
    FROM "Payment"
    WHERE "createdAt" >= ${sinceUtcMidnight} AND "status" = 'SUCCESS'
    GROUP BY day, "type"
    ORDER BY day ASC
  `;

  const byDay = new Map<string, { date: string; subscriptionRevenueKes: number; campaignRevenueKes: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(sinceUtcMidnight);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { date: key, subscriptionRevenueKes: 0, campaignRevenueKes: 0 });
  }
  for (const row of rows) {
    const point = byDay.get(row.day.toISOString().slice(0, 10));
    if (!point) continue;
    if (row.type === 'SUBSCRIPTION') point.subscriptionRevenueKes = Number(row.total);
    else if (row.type === 'AD_CAMPAIGN') point.campaignRevenueKes = Number(row.total);
  }
  return Array.from(byDay.values());
}

// Rating-distribution histogram (only plumbers with at least one rating are
// counted) plus the platform-wide average response rate.
export async function getPlumberPerformance() {
  const rated = await prisma.plumberProfile.findMany({
    where: { ratingCount: { gt: 0 } },
    select: { ratingAverage: true, responseRate: true },
  });

  const buckets = [
    { label: '1–2', min: 1, max: 2, count: 0 },
    { label: '2–3', min: 2, max: 3, count: 0 },
    { label: '3–4', min: 3, max: 4, count: 0 },
    { label: '4–5', min: 4, max: 5.001, count: 0 },
  ];
  for (const p of rated) {
    const bucket = buckets.find((b) => p.ratingAverage >= b.min && p.ratingAverage < b.max);
    if (bucket) bucket.count++;
  }

  const avgResponseRate = rated.length ? rated.reduce((sum, p) => sum + p.responseRate, 0) / rated.length : 0;
  const averageRating = rated.length ? rated.reduce((sum, p) => sum + p.ratingAverage, 0) / rated.length : 0;

  return {
    ratingDistribution: buckets.map(({ label, count }) => ({ label, count })),
    averageResponseRate: avgResponseRate,
    averageRating,
    ratedPlumberCount: rated.length,
  };
}

export async function requireSuperAdmin(profileId: string | undefined): Promise<void> {
  if (!profileId) throw createError('Super admin access required', 403);
  const adminProfile = await prisma.adminProfile.findUnique({ where: { id: profileId } });
  if (!adminProfile || !adminProfile.isSuperAdmin) {
    throw createError('Super admin access required', 403);
  }
}

export async function listAuditLogs(
  cursor: string | undefined,
  limit: number,
  filters: { actorId?: string; action?: string }
) {
  const rows = await prisma.adminAuditLog.findMany({
    where: {
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.action ? { action: { contains: filters.action, mode: 'insensitive' } } : {}),
    },
    orderBy: { id: 'asc' },
    include: {
      actor: { select: { name: true } },
    },
    ...(cursorArgs(cursor, limit) as CursorArgs),
  });

  return paginateResults(rows, limit);
}

export async function listAuditLogActors() {
  const rows = await prisma.adminAuditLog.findMany({
    distinct: ['actorId'],
    select: { actorId: true, actor: { select: { name: true } } },
    orderBy: { actorId: 'asc' },
  });
  return rows.map((row) => ({ id: row.actorId, name: row.actor.name }));
}

// --- Partner KYC ---

export async function listPendingPartnerKyc(cursor: string | undefined, limit: number) {
  const rows = await prisma.partnerProfile.findMany({
    where: { verificationStatus: VerificationStatus.PENDING },
    orderBy: { id: 'asc' },
    include: { user: { select: { name: true, email: true, phone: true } } },
    ...(cursorArgs(cursor, limit) as CursorArgs),
  });
  return paginateResults(rows, limit);
}

export async function approvePartnerKyc(actorId: string, partnerId: string) {
  const partner = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    include: { user: { select: { email: true } } },
  });
  if (!partner) throw createError('Partner profile not found', 404);

  const updated = await prisma.partnerProfile.update({
    where: { id: partnerId },
    data: { verificationStatus: VerificationStatus.APPROVED },
  });

  await logAdminAction(actorId, 'APPROVE_PARTNER_KYC', 'PartnerProfile', partnerId);

  if (partner.user.email) {
    try {
      await sendPartnerAccountApprovedEmail({ to: partner.user.email, partnerName: partner.businessName });
    } catch (err) {
      console.error('[EMAIL] partner account approval notify failed:', err);
    }
  }

  return updated;
}

export async function rejectPartnerKyc(actorId: string, partnerId: string, reason: string) {
  const partner = await prisma.partnerProfile.findUnique({ where: { id: partnerId } });
  if (!partner) throw createError('Partner profile not found', 404);

  const updated = await prisma.partnerProfile.update({
    where: { id: partnerId },
    data: { verificationStatus: VerificationStatus.REJECTED },
  });

  await logAdminAction(actorId, 'REJECT_PARTNER_KYC', 'PartnerProfile', partnerId, { reason });
  return updated;
}

// --- Product moderation ---

export async function listPendingProducts(cursor: string | undefined, limit: number) {
  const rows = await prisma.product.findMany({
    where: { status: 'PENDING_APPROVAL' },
    orderBy: { id: 'asc' },
    include: { partner: { select: { businessName: true } } },
    ...(cursorArgs(cursor, limit) as CursorArgs),
  });
  return paginateResults(rows, limit);
}

export async function approveProduct(actorId: string, productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { partner: { select: { businessName: true, user: { select: { email: true } } } } },
  });
  if (!product) throw createError('Product not found', 404);

  const updated = await prisma.product.update({ where: { id: productId }, data: { status: 'ACTIVE' } });
  await logAdminAction(actorId, 'APPROVE_PRODUCT', 'Product', productId);

  if (product.partner.user.email) {
    try {
      await sendProductApprovedEmail({
        to: product.partner.user.email,
        partnerName: product.partner.businessName,
        productName: product.name,
      });
    } catch (err) {
      console.error('[EMAIL] product approval notify failed:', err);
    }
  }

  return updated;
}

export async function rejectProduct(actorId: string, productId: string, reason: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw createError('Product not found', 404);

  const updated = await prisma.product.update({ where: { id: productId }, data: { status: 'REJECTED' } });
  await logAdminAction(actorId, 'REJECT_PRODUCT', 'Product', productId, { reason });
  return updated;
}

// --- Dashboard ---

// "Needs your attention" merges every pending-review queue into one prioritized
// count so an admin doesn't have to remember to check five separate sections —
// docs/06-admin-web-app.md section 4.2.
export async function getDashboardSummary() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    bookingsToday,
    activePlumbers,
    activeCampaigns,
    openConcerns,
    pendingPlumberKyc,
    pendingPartnerKyc,
    pendingProducts,
    pendingCampaigns,
    pendingTrainingContent,
  ] = await Promise.all([
    prisma.booking.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.plumberProfile.count({ where: { isOnline: true } }),
    prisma.ad.count({ where: { isActive: true, endDate: { gte: new Date() } } }),
    prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
    prisma.plumberProfile.count({ where: { verificationStatus: VerificationStatus.PENDING } }),
    prisma.partnerProfile.count({ where: { verificationStatus: VerificationStatus.PENDING } }),
    prisma.product.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.ad.count({ where: { isApproved: false } }),
    prisma.trainingContent.count({ where: { status: 'PENDING_APPROVAL' } }),
  ]);

  return {
    bookingsToday,
    activePlumbers,
    activeCampaigns,
    openConcerns,
    needsAttention: [
      { type: 'plumber_kyc', label: 'Plumber KYC reviews', count: pendingPlumberKyc, href: '/verify/plumbers' },
      { type: 'partner_kyc', label: 'Partner KYC reviews', count: pendingPartnerKyc, href: '/verify/partners' },
      { type: 'products', label: 'Products awaiting approval', count: pendingProducts, href: '/verify/products' },
      { type: 'campaigns', label: 'Campaigns awaiting approval', count: pendingCampaigns, href: '/verify/campaigns' },
      {
        type: 'training_content',
        label: 'Training content awaiting review',
        count: pendingTrainingContent,
        href: '/verify/training-content',
      },
      { type: 'concerns', label: 'Open concerns', count: openConcerns, href: '/concerns' },
    ].filter((item) => item.count > 0),
  };
}

// --- Admin management (invites, permissions) ---

// One-time bootstrap: creates the first super admin before any admin account
// exists (invites can only be sent by an existing admin, so something has to
// break the chicken-and-egg problem). Gated by SUPER_ADMIN_SETUP_SECRET and
// refuses once a super admin already exists, so it can't be reused to mint
// further super admins even if the secret leaks later.
export async function createSuperAdmin(data: {
  setupSecret: string;
  name: string;
  email?: string;
  phone?: string;
  password: string;
}) {
  if (!env.SUPER_ADMIN_SETUP_SECRET || data.setupSecret !== env.SUPER_ADMIN_SETUP_SECRET) {
    throw createError('Not authorized to set up a super admin', 403);
  }

  const existingSuperAdmin = await prisma.adminProfile.findFirst({ where: { isSuperAdmin: true } });
  if (existingSuperAdmin) throw createError('A super admin already exists', 409);

  if (data.email) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw createError('An account with this email already exists', 409);
  }
  if (data.phone) {
    const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (existing) throw createError('An account with this phone number already exists', 409);
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash,
      role: Role.ADMIN,
      emailVerifiedAt: data.email ? new Date() : null,
      adminProfile: {
        create: {
          isSuperAdmin: true,
          permissions: [],
          isActive: true,
        },
      },
    },
  });

  const adminProfile = await prisma.adminProfile.findUniqueOrThrow({ where: { userId: user.id } });
  await logAdminAction(user.id, 'CREATE_SUPER_ADMIN', 'AdminProfile', adminProfile.id, { bootstrap: true });

  const payload = { userId: user.id, role: Role.ADMIN, profileId: adminProfile.id };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

export async function listAdmins(cursor: string | undefined, limit: number) {
  const rows = await prisma.adminProfile.findMany({
    orderBy: { id: 'asc' },
    include: { user: { select: { name: true, email: true, phone: true } } },
    ...(cursorArgs(cursor, limit) as CursorArgs),
  });
  const pendingInvites = await prisma.adminInvite.findMany({
    where: { acceptedAt: null, revokedAt: null, expiresAt: { gte: new Date() } },
    orderBy: { id: 'asc' },
  });
  return { ...paginateResults(rows, limit), pendingInvites };
}

export async function createAdminInvite(
  invitedById: string,
  data: { name: string; email?: string; phone?: string; permissions: AdminPermission[] }
) {
  if (!data.email && !data.phone) throw createError('Either email or phone is required', 400);

  const token = crypto.randomBytes(32).toString('hex');
  const invite = await prisma.adminInvite.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      permissions: data.permissions,
      invitedById,
      token,
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
    },
  });

  const inviteUrl = `${env.ADMIN_APP_URL}/invite/${token}`;
  if (data.email) {
    await sendAdminInviteEmail({ to: data.email, name: data.name, inviteUrl });
  }
  if (data.phone) {
    try {
      await sendSms(data.phone, `You've been invited to the Efikas Plumber admin console. Set your password: ${inviteUrl}`);
    } catch (err) {
      // `inviteUrl` is still returned below, so the admin can share it by hand
      // rather than an SMS hiccup making the whole invite fail.
      console.error('[SMS] admin invite notify failed:', err);
    }
  }

  await logAdminAction(invitedById, 'INVITE_ADMIN', 'AdminInvite', invite.id, {
    name: data.name,
    permissions: data.permissions,
  });

  return { ...invite, inviteUrl };
}

export async function updateAdminPermissions(actorId: string, adminId: string, permissions: AdminPermission[]) {
  const admin = await prisma.adminProfile.findUnique({ where: { id: adminId } });
  if (!admin) throw createError('Admin not found', 404);

  const updated = await prisma.adminProfile.update({ where: { id: adminId }, data: { permissions } });
  await logAdminAction(actorId, 'UPDATE_ADMIN_PERMISSIONS', 'AdminProfile', adminId, { permissions });
  return updated;
}

export async function setAdminActive(actorId: string, adminId: string, isActive: boolean) {
  const admin = await prisma.adminProfile.findUnique({ where: { id: adminId } });
  if (!admin) throw createError('Admin not found', 404);
  if (admin.isSuperAdmin) throw createError('Cannot deactivate a super admin', 400);

  const updated = await prisma.adminProfile.update({ where: { id: adminId }, data: { isActive } });
  await logAdminAction(actorId, isActive ? 'REACTIVATE_ADMIN' : 'DEACTIVATE_ADMIN', 'AdminProfile', adminId);
  return updated;
}

export async function revokeAdminInvite(actorId: string, inviteId: string) {
  const invite = await prisma.adminInvite.findUnique({ where: { id: inviteId } });
  if (!invite) throw createError('Invite not found', 404);

  const updated = await prisma.adminInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
  await logAdminAction(actorId, 'REVOKE_ADMIN_INVITE', 'AdminInvite', inviteId);
  return updated;
}

export async function validateInvite(token: string) {
  const invite = await prisma.adminInvite.findUnique({ where: { token } });
  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw createError('This invite has expired or was already used', 404);
  }
  return { name: invite.name, email: invite.email, phone: invite.phone };
}

export async function acceptInvite(token: string, password: string) {
  const invite = await prisma.adminInvite.findUnique({ where: { token } });
  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw createError('This invite has expired or was already used', 404);
  }
  if (!invite.email && !invite.phone) throw createError('Invite is missing contact info', 400);

  if (invite.email) {
    const existing = await prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) throw createError('An account with this email already exists', 409);
  }
  if (invite.phone) {
    const existing = await prisma.user.findUnique({ where: { phone: invite.phone } });
    if (existing) throw createError('An account with this phone number already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: invite.name,
        email: invite.email,
        phone: invite.phone,
        passwordHash,
        role: Role.ADMIN,
        emailVerifiedAt: invite.email ? new Date() : null,
        adminProfile: {
          create: {
            permissions: invite.permissions,
            invitedById: invite.invitedById,
            isActive: true,
          },
        },
      },
    });
    await tx.adminInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    return created;
  });

  const adminProfile = await prisma.adminProfile.findUniqueOrThrow({ where: { userId: user.id } });
  const payload = { userId: user.id, role: Role.ADMIN, profileId: adminProfile.id };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

// --- Concerns (docs/06 section 4.6) — unified Dispute + ProductConcern inbox ---

export type ConcernType = 'SERVICE' | 'PRODUCT';

const DISPUTE_INCLUDE = {
  booking: { select: { id: true, category: true, address: true, status: true } },
  reporter: { select: { id: true, user: { select: { name: true, phone: true } } } },
  plumber: { select: { id: true, user: { select: { name: true, phone: true } } } },
};

const PRODUCT_CONCERN_INCLUDE = {
  product: { select: { id: true, name: true, imageUrl: true, partner: { select: { businessName: true } } } },
  deliveryRequest: { select: { id: true, quantity: true, address: true, status: true } },
};

function toConcernRow<T extends { id: string; createdAt: Date }>(type: ConcernType, row: T): T & { type: ConcernType } {
  return { type, ...row };
}

// No true cross-table cursor pagination for the merged "ALL" view — each
// table is fetched up to `limit` and merged/sorted/truncated in memory. Fine
// for an admin inbox at this scale; filtering to one type gets real
// per-table cursor pagination via the underlying list functions.
export async function listConcerns(params: {
  type: ConcernType | 'ALL';
  status: ConcernStatus | undefined;
  cursor: string | undefined;
  limit: number;
}) {
  const { type, status, cursor, limit } = params;
  const page = cursorArgs(cursor, limit) as CursorArgs;

  if (type === 'SERVICE') {
    const disputes = await prisma.dispute.findMany({
      where: status ? { status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: DISPUTE_INCLUDE,
      ...page,
    });
    return paginateResults(disputes.map((d) => toConcernRow('SERVICE', d)), limit);
  }

  if (type === 'PRODUCT') {
    const productConcerns = await prisma.productConcern.findMany({
      where: status ? { status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: PRODUCT_CONCERN_INCLUDE,
      ...page,
    });
    return paginateResults(productConcerns.map((p) => toConcernRow('PRODUCT', p)), limit);
  }

  const [disputes, productConcerns] = await Promise.all([
    prisma.dispute.findMany({
      where: status ? { status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: DISPUTE_INCLUDE,
      take: limit,
    }),
    prisma.productConcern.findMany({
      where: status ? { status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: PRODUCT_CONCERN_INCLUDE,
      take: limit,
    }),
  ]);

  const merged = [
    ...disputes.map((d) => toConcernRow('SERVICE', d)),
    ...productConcerns.map((p) => toConcernRow('PRODUCT', p)),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { items: merged.slice(0, limit), nextCursor: null as string | null };
}

export async function getConcernDetail(type: ConcernType, id: string) {
  if (type === 'SERVICE') {
    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: { ...DISPUTE_INCLUDE, booking: true },
    });
    if (!dispute) throw createError('Concern not found', 404);
    return { type, ...dispute };
  }
  const concern = await prisma.productConcern.findUnique({ where: { id }, include: PRODUCT_CONCERN_INCLUDE });
  if (!concern) throw createError('Concern not found', 404);
  return { type, ...concern };
}

export async function updateConcernStatus(type: ConcernType, id: string, status: ConcernStatus) {
  if (type === 'SERVICE') {
    const existing = await prisma.dispute.findUnique({ where: { id } });
    if (!existing) throw createError('Concern not found', 404);
    return { type, ...(await prisma.dispute.update({ where: { id }, data: { status } })) };
  }
  const existing = await prisma.productConcern.findUnique({ where: { id } });
  if (!existing) throw createError('Concern not found', 404);
  return { type, ...(await prisma.productConcern.update({ where: { id }, data: { status } })) };
}

export async function resolveConcern(
  type: ConcernType,
  id: string,
  actorId: string,
  data: { resolutionNote: string; outcome: 'RESOLVED_CUSTOMER' | 'RESOLVED_OTHER_PARTY' | 'DISMISSED' }
) {
  const updateData = {
    status: data.outcome as ConcernStatus,
    resolutionNote: data.resolutionNote,
    resolvedAt: new Date(),
    resolvedById: actorId,
  };

  if (type === 'SERVICE') {
    const existing = await prisma.dispute.findUnique({ where: { id } });
    if (!existing) throw createError('Concern not found', 404);
    const updated = await prisma.dispute.update({ where: { id }, data: updateData });
    await logAdminAction(actorId, 'RESOLVE_CONCERN', 'Dispute', id, data);
    return { type, ...updated };
  }
  const existing = await prisma.productConcern.findUnique({ where: { id } });
  if (!existing) throw createError('Concern not found', 404);
  const updated = await prisma.productConcern.update({ where: { id }, data: updateData });
  await logAdminAction(actorId, 'RESOLVE_CONCERN', 'ProductConcern', id, data);
  return { type, ...updated };
}
