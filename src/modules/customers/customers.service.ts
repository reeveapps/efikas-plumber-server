import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';

export async function listLocations(customerId: string) {
  return prisma.savedLocation.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createLocation(
  customerId: string,
  data: { label: string; address: string; latitude: number; longitude: number; isDefault?: boolean }
) {
  if (data.isDefault) {
    return prisma.$transaction(async (tx) => {
      await tx.savedLocation.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.savedLocation.create({
        data: { ...data, customerId },
      });
    });
  }
  return prisma.savedLocation.create({ data: { ...data, customerId } });
}

async function assertOwnedLocation(customerId: string, id: string) {
  const location = await prisma.savedLocation.findUnique({ where: { id } });
  if (!location || location.customerId !== customerId) {
    throw createError('Saved location not found', 404);
  }
  return location;
}

export async function updateLocation(
  customerId: string,
  id: string,
  data: { label?: string; address?: string; latitude?: number; longitude?: number; isDefault?: boolean }
) {
  await assertOwnedLocation(customerId, id);

  if (data.isDefault) {
    return prisma.$transaction(async (tx) => {
      await tx.savedLocation.updateMany({
        where: { customerId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      return tx.savedLocation.update({ where: { id }, data });
    });
  }
  return prisma.savedLocation.update({ where: { id }, data });
}

export async function deleteLocation(customerId: string, id: string): Promise<void> {
  await assertOwnedLocation(customerId, id);
  await prisma.savedLocation.delete({ where: { id } });
}

const PLUMBER_SUMMARY_SELECT = {
  id: true,
  ratingAverage: true,
  ratingCount: true,
  user: { select: { name: true, avatarUrl: true } },
};

export async function listBookings(customerId: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.booking.findMany({
    where: { customerId },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      plumber: { select: PLUMBER_SUMMARY_SELECT },
      // Single row per booking via a `take: 1` relation query (Prisma runs
      // this as one batched query, not one-per-booking) — feeds the Chat
      // tab's last-message preview without an N+1 request-per-thread cost.
      messages: { take: 1, orderBy: { createdAt: 'desc' } },
    },
  });
  return paginateResults(rows, limit);
}

export async function getBookingDetail(customerId: string, id: string) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      plumber: {
        select: {
          id: true,
          bio: true,
          skills: true,
          yearsExperience: true,
          ratingAverage: true,
          ratingCount: true,
          jobsCompletedCount: true,
          user: { select: { name: true, avatarUrl: true } },
        },
      },
      statusLogs: { orderBy: { createdAt: 'asc' } },
      review: true,
      dispute: true,
      paymentRecord: true,
    },
  });

  // Don't leak existence of bookings that belong to other customers — 404 either way.
  if (!booking || booking.customerId !== customerId) {
    throw createError('Booking not found', 404);
  }
  return booking;
}
