import { BillingCycle, BookingStatus, SubscriptionOwnerType } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';

const TERMINAL_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
  BookingStatus.DISPUTED,
  BookingStatus.EXPIRED,
];

// Resolves the company a given ServiceManagerProfile is attached to, either as
// owner (ownedCompany) or as staff (companyId -> company). Returns null if neither.
export async function resolveCompanyForManager(profileId: string) {
  const manager = await prisma.serviceManagerProfile.findUnique({
    where: { id: profileId },
    include: { ownedCompany: true, company: true },
  });
  if (!manager) return null;
  return manager.ownedCompany ?? manager.company ?? null;
}

async function getCompanyOrThrow(profileId: string) {
  const company = await resolveCompanyForManager(profileId);
  if (!company) throw createError('You are not linked to a company', 404);
  return company;
}

export async function createCompany(
  profileId: string,
  data: { name: string; registrationNumber?: string }
) {
  const existing = await prisma.company.findUnique({ where: { ownerId: profileId } });
  if (existing) throw createError('You already own a company', 409);

  return prisma.company.create({
    data: {
      name: data.name,
      registrationNumber: data.registrationNumber,
      ownerId: profileId,
      verificationStatus: 'PENDING',
    },
  });
}

export async function getMyCompany(profileId: string) {
  return getCompanyOrThrow(profileId);
}

export async function updateMyCompany(
  profileId: string,
  data: { name?: string; registrationNumber?: string; logoUrl?: string }
) {
  const company = await prisma.company.findUnique({ where: { ownerId: profileId } });
  if (!company) throw createError('You do not own a company', 404);

  return prisma.company.update({ where: { id: company.id }, data });
}

// NOTE: This is a direct-attach, not an invitation flow. The schema has no Invite
// model, so we best-effort match an existing plumber account by phone/email and
// link them immediately without requiring the plumber's consent. This is a known
// simplification for this pass — a real invite/consent-token flow should replace it.
export async function addPlumberToMyCompany(
  profileId: string,
  data: { phone?: string; email?: string }
) {
  const company = await getCompanyOrThrow(profileId);

  const user = await prisma.user.findFirst({
    where: {
      role: 'PLUMBER',
      OR: [
        data.phone ? { phone: data.phone } : undefined,
        data.email ? { email: data.email } : undefined,
      ].filter((clause): clause is { phone: string } | { email: string } => Boolean(clause)),
    },
    include: { plumberProfile: true },
  });

  if (!user || !user.plumberProfile) {
    throw createError('No plumber account found with that phone/email', 404);
  }

  if (user.plumberProfile.companyId) {
    throw createError('This plumber is already linked to a company', 409);
  }

  return prisma.plumberProfile.update({
    where: { id: user.plumberProfile.id },
    data: { companyId: company.id },
  });
}

export async function listMyPlumbers(profileId: string, cursor: string | undefined, limit: number) {
  const company = await getCompanyOrThrow(profileId);

  const rows = await prisma.plumberProfile.findMany({
    where: { companyId: company.id },
    orderBy: { id: 'asc' },
    include: {
      user: { select: { name: true, phone: true, avatarUrl: true } },
    },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });

  return paginateResults(rows, limit);
}

export async function removePlumberFromMyCompany(profileId: string, plumberId: string) {
  const company = await getCompanyOrThrow(profileId);

  const plumber = await prisma.plumberProfile.findUnique({ where: { id: plumberId } });
  if (!plumber || plumber.companyId !== company.id) {
    throw createError('Plumber not found in this company', 404);
  }

  await prisma.plumberProfile.update({ where: { id: plumberId }, data: { companyId: null } });
}

export async function getMyPlumbersMap(profileId: string) {
  const company = await getCompanyOrThrow(profileId);

  const plumbers = await prisma.plumberProfile.findMany({
    where: { companyId: company.id, isOnline: true },
    include: {
      user: { select: { name: true } },
      currentLocation: true,
    },
  });

  return plumbers
    .filter((p) => p.currentLocation)
    .map((p) => ({
      plumberId: p.id,
      name: p.user.name,
      latitude: p.currentLocation!.latitude,
      longitude: p.currentLocation!.longitude,
      heading: p.currentLocation!.heading,
      updatedAt: p.currentLocation!.updatedAt,
    }));
}

export async function assignBookingToPlumber(
  profileId: string,
  bookingId: string,
  plumberId: string
) {
  const company = await getCompanyOrThrow(profileId);

  const plumber = await prisma.plumberProfile.findUnique({ where: { id: plumberId } });
  if (!plumber || plumber.companyId !== company.id) {
    throw createError('Plumber not found in this company', 404);
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw createError('Booking not found', 404);
  if (TERMINAL_BOOKING_STATUSES.includes(booking.status)) {
    throw createError('Booking is already in a terminal state', 409);
  }

  const [updatedBooking] = await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { plumberId, status: 'ACCEPTED' },
    }),
    prisma.jobOffer.updateMany({
      where: { bookingId, status: 'PENDING' },
      data: { status: 'TIMED_OUT', respondedAt: new Date() },
    }),
    prisma.bookingStatusLog.create({
      data: { bookingId, status: 'ACCEPTED', note: 'Manually assigned by company' },
    }),
  ]);

  return updatedBooking;
}

async function buildReport(profileId: string, from?: string, to?: string) {
  const company = await getCompanyOrThrow(profileId);

  const createdAtFilter =
    from || to
      ? {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        }
      : undefined;

  const bookingWhere = {
    plumber: { companyId: company.id },
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
  };

  const volumeByStatus = await prisma.booking.groupBy({
    by: ['status'],
    where: bookingWhere,
    _count: { _all: true },
  });

  const totalJobs = volumeByStatus.reduce((sum, row) => sum + row._count._all, 0);
  const completedJobs = volumeByStatus.find((row) => row.status === 'COMPLETED')?._count._all ?? 0;
  const completionRate = totalJobs > 0 ? completedJobs / totalJobs : 0;

  const offers = await prisma.jobOffer.findMany({
    where: {
      plumber: { companyId: company.id },
      respondedAt: { not: null },
      ...(createdAtFilter ? { offeredAt: createdAtFilter } : {}),
    },
    select: { offeredAt: true, respondedAt: true },
  });

  const avgResponseTimeSeconds =
    offers.length > 0
      ? offers.reduce((sum, o) => sum + (o.respondedAt!.getTime() - o.offeredAt.getTime()) / 1000, 0) /
        offers.length
      : 0;

  return {
    jobVolume: volumeByStatus.map((row) => ({ status: row.status, count: row._count._all })),
    totalJobs,
    completedJobs,
    completionRate,
    avgResponseTimeSeconds,
  };
}

export async function getMyReports(profileId: string, from?: string, to?: string) {
  return buildReport(profileId, from, to);
}

export async function getMyReportsCsv(profileId: string, from?: string, to?: string): Promise<string> {
  const report = await buildReport(profileId, from, to);

  const toCsvRow = (fields: (string | number)[]): string =>
    fields
      .map((field) => {
        const str = String(field);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      })
      .join(',') + '\n';

  let csv = toCsvRow(['metric', 'value']);
  csv += toCsvRow(['totalJobs', report.totalJobs]);
  csv += toCsvRow(['completedJobs', report.completedJobs]);
  csv += toCsvRow(['completionRate', report.completionRate]);
  csv += toCsvRow(['avgResponseTimeSeconds', report.avgResponseTimeSeconds]);
  csv += '\n';
  csv += toCsvRow(['status', 'count']);
  for (const row of report.jobVolume) {
    csv += toCsvRow([row.status, row.count]);
  }

  return csv;
}

export async function getMySubscription(profileId: string, cursor: string | undefined, limit: number) {
  const company = await getCompanyOrThrow(profileId);

  const subscription =
    (await prisma.subscription.findFirst({
      where: { companyId: company.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    })) ??
    (await prisma.subscription.findFirst({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    }));

  const payments = subscription
    ? await prisma.payment.findMany({
        where: { subscriptionId: subscription.id },
        orderBy: { id: 'asc' },
        ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
      })
    : [];

  return {
    subscription,
    payments: paginateResults(payments, limit),
  };
}

export async function subscribeMyCompany(profileId: string, planId: string) {
  const company = await prisma.company.findUnique({ where: { ownerId: profileId } });
  if (!company) throw createError('You do not own a company', 404);

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive || plan.ownerType !== SubscriptionOwnerType.COMPANY) {
    throw createError('Subscription plan not found or not available for companies', 404);
  }

  const now = new Date();
  const endDate = new Date(now);
  if (plan.billingCycle === BillingCycle.MONTHLY) {
    endDate.setDate(endDate.getDate() + 30);
  } else {
    endDate.setDate(endDate.getDate() + 365);
  }

  return prisma.subscription.create({
    data: {
      companyId: company.id,
      planId: plan.id,
      status: 'ACTIVE',
      startDate: now,
      endDate,
      autoRenew: true,
    },
  });
}

export async function cancelMySubscription(profileId: string) {
  const company = await prisma.company.findUnique({ where: { ownerId: profileId } });
  if (!company) throw createError('You do not own a company', 404);

  const subscription =
    (await prisma.subscription.findFirst({
      where: { companyId: company.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    })) ??
    (await prisma.subscription.findFirst({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
    }));

  if (!subscription) throw createError('No subscription found for this company', 404);

  // Status intentionally stays 'ACTIVE' until endDate — there is no cron job in this
  // pass to auto-expire subscriptions once endDate passes.
  return prisma.subscription.update({
    where: { id: subscription.id },
    data: { autoRenew: false, cancelledAt: new Date() },
  });
}
