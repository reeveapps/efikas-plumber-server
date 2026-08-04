import { PlumberAccountType, Prisma, Role, ServiceCategory } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { boundingBox, haversineDistanceKm } from '../../utils/geo.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';
import { sendPush } from '../../utils/push.js';
import { uploadToR2, UploadedFile } from '../../utils/r2.js';
import formatPhoneNumber from '../../utils/formatPhoneNumber.js';
import { emitPlumberLocation } from '../../realtime/socket.js';

// Public-safe fields only — never expose idNumber/idDocumentUrl/certificateUrls/businessRegUrl.
const PLUMBER_PUBLIC_SELECT = {
  id: true,
  bio: true,
  skills: true,
  yearsExperience: true,
  ratingAverage: true,
  ratingCount: true,
  jobsCompletedCount: true,
  user: { select: { name: true, avatarUrl: true } },
};

const PLUMBER_GEO_SELECT = {
  ...PLUMBER_PUBLIC_SELECT,
  currentLocation: { select: { latitude: true, longitude: true } },
};

interface ListPlumbersParams {
  q?: string;
  category?: ServiceCategory;
  lat?: number;
  lng?: number;
  radiusKm: number;
  minRating?: number;
  cursor?: string;
  limit: number;
}

export async function listPlumbers(params: ListPlumbersParams) {
  const { q, category, lat, lng, radiusKm, minRating, cursor, limit } = params;

  const baseWhere: Prisma.PlumberProfileWhereInput = {
    verificationStatus: 'APPROVED',
    ...(category ? { skills: { has: category } } : {}),
    ...(minRating !== undefined ? { ratingAverage: { gte: minRating } } : {}),
    ...(q ? { user: { name: { contains: q, mode: 'insensitive' } } } : {}),
  };

  if (lat !== undefined && lng !== undefined) {
    // Geo search MVP simplification (no PostGIS): cheap SQL bounding-box pre-filter
    // on PlumberLocation lat/lng, then exact Haversine distance calc + sort + manual
    // cursor slicing in application code. True DB-level cursor pagination on a
    // computed distance column isn't practical without PostGIS, so we page over the
    // already-sorted in-memory array using the cursor as a plumber id marker.
    const box = boundingBox(lat, lng, radiusKm);
    const candidates = await prisma.plumberProfile.findMany({
      where: {
        ...baseWhere,
        currentLocation: {
          latitude: { gte: box.minLat, lte: box.maxLat },
          longitude: { gte: box.minLng, lte: box.maxLng },
        },
      },
      select: PLUMBER_GEO_SELECT,
    });

    const withDistance = candidates
      .map((p) => {
        const loc = p.currentLocation!;
        const distanceKm = haversineDistanceKm(lat, lng, loc.latitude, loc.longitude);
        const { currentLocation: _currentLocation, ...rest } = p;
        return { ...rest, distanceKm };
      })
      .filter((p) => p.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    let startIndex = 0;
    if (cursor) {
      const idx = withDistance.findIndex((p) => p.id === cursor);
      startIndex = idx >= 0 ? idx + 1 : 0;
    }
    const page = withDistance.slice(startIndex, startIndex + limit + 1);
    const hasMore = page.length > limit;
    const items = hasMore ? page.slice(0, limit) : page;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  const rows = await prisma.plumberProfile.findMany({
    where: baseWhere,
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
    orderBy: [{ ratingAverage: 'desc' }, { id: 'desc' }],
    select: PLUMBER_PUBLIC_SELECT,
  });
  return paginateResults(rows, limit);
}

export async function getPlumberPublicProfile(id: string) {
  const plumber = await prisma.plumberProfile.findUnique({
    where: { id },
    select: { ...PLUMBER_PUBLIC_SELECT, verificationStatus: true },
  });
  if (!plumber || plumber.verificationStatus !== 'APPROVED') {
    throw createError('Plumber not found', 404);
  }
  const { verificationStatus: _verificationStatus, ...publicProfile } = plumber;
  return publicProfile;
}

interface OnboardFiles {
  idDocument?: UploadedFile[];
  certificates?: UploadedFile[];
  businessReg?: UploadedFile[];
}

export async function onboardPlumber(
  plumberId: string,
  data: {
    accountType: PlumberAccountType;
    idNumber?: string;
    businessRegNumber?: string;
    bio?: string;
    skills: ServiceCategory[];
    yearsExperience?: number;
  },
  files: OnboardFiles
) {
  const now = new Date(Date.now());
  const updateData: Prisma.PlumberProfileUpdateInput = {
    accountType: data.accountType,
    // Only the field relevant to the chosen account type is ever set —
    // switching type on a resubmission clears the other one out rather than
    // leaving stale data from a prior choice.
    idNumber: data.accountType === 'INDIVIDUAL' ? data.idNumber : null,
    businessRegNumber: data.accountType === 'COMPANY' ? data.businessRegNumber : null,
    bio: data.bio,
    skills: data.skills,
    yearsExperience: data.yearsExperience,
    verificationStatus: 'PENDING', // Change to pending after verification
    verifiedAt:now, // Remove this
  };

  if (files.idDocument?.[0]) {
    updateData.idDocumentUrl = await uploadToR2(files.idDocument[0], 'kyc/id');
  }
  if (files.certificates?.length) {
    updateData.certificateUrls = await Promise.all(
      files.certificates.map((f) => uploadToR2(f, 'kyc/certificates'))
    );
  }
  if (files.businessReg?.[0]) {
    updateData.businessRegUrl = await uploadToR2(files.businessReg[0], 'kyc/business-reg');
  }

  return prisma.plumberProfile.update({ where: { id: plumberId }, data: updateData });
}

export async function getOwnProfile(plumberId: string) {
  const profile = await prisma.plumberProfile.findUnique({
    where: { id: plumberId },
    include: {
      company: true,
      currentLocation: true,
      user: { select: { name: true, avatarUrl: true, phone: true, email: true } },
      // The roster owner (a COMPANY-type plumber) this plumber was added
      // under via "Manage Team" — distinct from `company` above (the real,
      // service-manager-owned Company). A team member's own accountType is
      // always INDIVIDUAL, so `companyOwner` is the only signal that they're
      // actually affiliated with someone's team roster.
      companyOwner: { select: { id: true, user: { select: { name: true } } } },
    },
  });
  if (!profile) throw createError('Plumber profile not found', 404);
  return profile;
}

export async function updateOwnProfile(
  plumberId: string,
  data: { bio?: string; skills?: ServiceCategory[]; customSkills?: string[]; yearsExperience?: number }
) {
  return prisma.plumberProfile.update({ where: { id: plumberId }, data });
}

export async function updateAvailability(
  plumberId: string,
  data: {
    isOnline?: boolean;
    serviceRadiusKm?: number;
    workingDays?: number[];
    workingHoursStart?: string;
    workingHoursEnd?: string;
  }
) {
  return prisma.plumberProfile.update({ where: { id: plumberId }, data });
}

const TERMINAL_BOOKING_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'DISPUTED', 'EXPIRED']);

// `bookingId` is optional — the general "am I online" ping from the Map tab
// (browsing nearby jobs) omits it and only ever updates PlumberLocation for
// the discovery bounding-box query. Passing it (from ActiveJobScreen while a
// job is accepted/en route/etc.) additionally broadcasts the position live
// to that booking's room, for the customer's LiveTrackingScreen — this is
// deliberately checked server-side (not trusted from the client) so a
// plumber can't push location updates to a booking that isn't theirs or has
// already finished.
export async function upsertLocation(
  plumberId: string,
  data: { latitude: number; longitude: number; heading?: number; bookingId?: string }
) {
  const { bookingId, ...location } = data;

  const updated = await prisma.plumberLocation.upsert({
    where: { plumberId },
    create: { plumberId, ...location },
    update: location,
  });

  if (bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { plumberId: true, status: true } });
    if (booking && booking.plumberId === plumberId && !TERMINAL_BOOKING_STATUSES.has(booking.status)) {
      emitPlumberLocation(bookingId, location);
    }
  }

  return updated;
}

export async function getJobFeed(plumberId: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.jobOffer.findMany({
    where: { plumberId, status: 'PENDING' },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
    orderBy: [{ offeredAt: 'desc' }, { id: 'desc' }],
    include: {
      booking: {
        select: {
          id: true,
          category: true,
          subCategory: true,
          description: true,
          photoUrls: true,
          voiceNoteUrl: true,
          address: true,
          isAsap: true,
          latitude: true,
          longitude: true,
          createdAt: true,
        },
      },
    },
  });
  return paginateResults(rows, limit);
}

// Bookings this plumber is/was assigned to — active + history, for the "My
// Jobs" tab. Deliberately a full-row select on Booking itself (no partial
// projection like getJobFeed's pre-accept masking) since a plumber is fully
// entitled to see complete details on their own assigned jobs; only the
// nested customer relation is trimmed to a public-safe summary.
export async function listMyBookings(plumberId: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.booking.findMany({
    where: { plumberId },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      customer: { select: { id: true, user: { select: { name: true, avatarUrl: true } } } },
      // Single row per booking via a `take: 1` relation query (one batched
      // query, not one-per-booking) — feeds the plumber Chat tab's
      // last-message preview, same as the customer side's listBookings.
      messages: { take: 1, orderBy: { createdAt: 'desc' } },
    },
  });
  return paginateResults(rows, limit);
}

export async function acceptJobOffer(plumberId: string, offerId: string) {
  const updatedOffer = await prisma.$transaction(async (tx) => {
    const offer = await tx.jobOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.plumberId !== plumberId || offer.status !== 'PENDING') {
      throw createError('Job offer not available', 409);
    }

    const now = new Date();

    const updated = await tx.jobOffer.update({
      where: { id: offerId },
      data: { status: 'ACCEPTED', respondedAt: now },
    });

    await tx.booking.update({
      where: { id: offer.bookingId },
      data: { plumberId, status: 'ACCEPTED' },
    });

    await tx.jobOffer.updateMany({
      where: { bookingId: offer.bookingId, status: 'PENDING', id: { not: offerId } },
      data: { status: 'TIMED_OUT', respondedAt: now },
    });

    await tx.bookingStatusLog.create({
      data: { bookingId: offer.bookingId, status: 'ACCEPTED' },
    });

    return updated;
  });

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: updatedOffer.bookingId },
      select: { customer: { select: { userId: true } } },
    });
    if (booking?.customer) {
      const tokens = await prisma.deviceToken.findMany({
        where: { userId: booking.customer.userId },
        select: { fcmToken: true },
      });
      if (tokens.length) {
        await sendPush(
          tokens.map((t) => t.fcmToken),
          {
            title: 'Plumber found!',
            body: "You've been matched with a plumber",
            data: { type: 'booking_matched', bookingId: updatedOffer.bookingId },
          }
        );
      }
    }
  } catch (err) {
    console.error('[PUSH] acceptJobOffer notify failed:', err);
  }

  return updatedOffer;
}

export async function declineJobOffer(plumberId: string, offerId: string) {
  const offer = await prisma.jobOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.plumberId !== plumberId || offer.status !== 'PENDING') {
    throw createError('Job offer not available', 409);
  }
  return prisma.jobOffer.update({
    where: { id: offerId },
    data: { status: 'DECLINED', respondedAt: new Date() },
  });
}

export async function getEarnings(
  plumberId: string,
  cursor: string | undefined,
  limit: number,
  from?: Date,
  to?: Date
) {
  const dateFilter =
    from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {};

  const where: Prisma.EarningsEntryWhereInput = { plumberId, ...dateFilter };

  const [rows, summary] = await Promise.all([
    prisma.earningsEntry.findMany({
      where,
      ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.earningsEntry.aggregate({
      where,
      _sum: { amountKes: true, tipKes: true },
      _count: true,
    }),
  ]);

  const page = paginateResults(rows, limit);
  return {
    ...page,
    summary: {
      totalAmountKes: summary._sum.amountKes ?? 0,
      totalTipKes: summary._sum.tipKes ?? 0,
      count: summary._count,
    },
  };
}

// Rolling/real-time performance recalculation is out of scope for this pass —
// this returns the plumber's stored aggregate fields directly.
export async function getPerformance(plumberId: string) {
  const profile = await prisma.plumberProfile.findUnique({
    where: { id: plumberId },
    select: { ratingAverage: true, ratingCount: true, jobsCompletedCount: true, responseRate: true },
  });
  if (!profile) throw createError('Plumber profile not found', 404);
  return profile;
}

export async function getSubscriptionStatus(plumberId: string) {
  const profile = await prisma.plumberProfile.findUnique({
    where: { id: plumberId },
    select: { companyId: true },
  });
  if (!profile) throw createError('Plumber profile not found', 404);

  // Independent plumbers (no companyId) are free/unrestricted per product decision.
  if (!profile.companyId) {
    return { status: 'NONE' as const, unlimited: true };
  }

  const subscription = await prisma.subscription.findFirst({
    where: { companyId: profile.companyId, status: 'ACTIVE', endDate: { gt: new Date() } },
    orderBy: { endDate: 'desc' },
  });

  if (!subscription) {
    return { status: 'EXPIRED' as const, unlimited: false };
  }
  return { status: subscription.status, unlimited: false, subscription };
}

// --- Team roster (COMPANY-type plumbers only) ---

async function requireCompanyAccount(plumberId: string) {
  const owner = await prisma.plumberProfile.findUnique({ where: { id: plumberId } });
  if (!owner) throw createError('Plumber profile not found', 404);
  if (owner.accountType !== 'COMPANY') {
    throw createError('Only a company account can manage a team roster', 403);
  }
  return owner;
}

export async function listTeamMembers(companyOwnerId: string) {
  await requireCompanyAccount(companyOwnerId);
  return prisma.plumberProfile.findMany({
    where: { companyOwnerId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      idNumber: true,
      verificationStatus: true,
      createdAt: true,
      user: { select: { name: true, phone: true, email: true } },
    },
  });
}

export interface TeamMemberInput {
  firstName: string;
  lastName: string;
  phone: string;
  idNumber: string;
  email?: string;
}

// Pre-creates a full User + PlumberProfile for the employee — they never see
// a registration screen at all, just log in later with their phone via the
// normal OTP flow (`requestOtp` finds this existing row by phone rather than
// creating a blank one). Same "trust the account that vouches for them"
// shortcut as onboardPlumber's own APPROVED-on-submit behavior.
export async function addTeamMember(companyOwnerId: string, data: TeamMemberInput) {
  await requireCompanyAccount(companyOwnerId);

  const normalizedPhone = formatPhoneNumber(data.phone);
  if (!normalizedPhone) throw createError(`Invalid phone number: ${data.phone}`, 400);

  const existing = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
  if (existing) throw createError(`An account already exists for phone ${data.phone}`, 409);

  const user = await prisma.user.create({
    data: {
      phone: normalizedPhone,
      name: `${data.firstName.trim()} ${data.lastName.trim()}`.trim(),
      email: data.email,
      role: Role.PLUMBER,
      plumberProfile: {
        create: {
          idNumber: data.idNumber.trim(),
          accountType: 'INDIVIDUAL',
          companyOwnerId,
          verificationStatus: 'APPROVED',
          verifiedAt: new Date(),
        },
      },
    },
    include: { plumberProfile: true },
  });

  return user.plumberProfile;
}

export interface BulkTeamMemberResult {
  row: number;
  phone: string;
  status: 'created' | 'skipped';
  reason?: string;
}

// Rows are processed sequentially (not Promise.all) so one bad row can't
// race a duplicate-phone check against another — CSV bulk uploads are a rare,
// small-N, human-triggered operation, not a hot path worth parallelizing.
// `row` is the original CSV row number (1-based, header excluded) — the
// caller may have already filtered out invalid rows before this point, so
// it's tracked explicitly rather than re-derived from array position.
export async function bulkAddTeamMembers(
  companyOwnerId: string,
  rows: { row: number; data: TeamMemberInput }[]
): Promise<{ createdCount: number; skippedCount: number; results: BulkTeamMemberResult[] }> {
  await requireCompanyAccount(companyOwnerId);

  const results: BulkTeamMemberResult[] = [];
  for (const { row: rowNumber, data: row } of rows) {
    try {
      const normalizedPhone = formatPhoneNumber(row.phone);
      if (!normalizedPhone) throw new Error('Invalid phone number');

      const existing = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
      if (existing) throw new Error('Phone number already registered');

      await prisma.user.create({
        data: {
          phone: normalizedPhone,
          name: `${row.firstName.trim()} ${row.lastName.trim()}`.trim(),
          email: row.email,
          role: Role.PLUMBER,
          plumberProfile: {
            create: {
              idNumber: row.idNumber.trim(),
              accountType: 'INDIVIDUAL',
              companyOwnerId,
              verificationStatus: 'APPROVED',
              verifiedAt: new Date(),
            },
          },
        },
      });
      results.push({ row: rowNumber, phone: row.phone, status: 'created' });
    } catch (err) {
      results.push({
        row: rowNumber,
        phone: row.phone,
        status: 'skipped',
        reason: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return {
    createdCount: results.filter((r) => r.status === 'created').length,
    skippedCount: results.filter((r) => r.status === 'skipped').length,
    results,
  };
}
