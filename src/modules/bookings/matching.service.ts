import { prisma } from '../../db/index.js';
import { boundingBox, haversineDistanceKm } from '../../utils/geo.js';
import { sendPush } from '../../utils/push.js';
import { JOB_OFFER_MAX_CANDIDATES } from '../../config/constants.js';
import { VerificationStatus } from '@prisma/client';

const MAX_BOUNDING_RADIUS_KM = 30;

export async function matchBooking(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;
  if (booking.status !== 'REQUESTED' && booking.status !== 'MATCHING') return;

  const box = boundingBox(booking.latitude, booking.longitude, MAX_BOUNDING_RADIUS_KM);

  const candidateFilter = {
      verificationStatus: 'APPROVED' as VerificationStatus ,
      isOnline: true,
      currentLocation: {
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
      },
      // Excludes any plumber already offered this booking (not just PENDING) —
      // otherwise the 20s matching cron re-matches and re-notifies the same
      // nearby plumber every time their previous offer times out, in an
      // infinite "New job nearby" loop instead of expanding to new candidates.
      jobOffers: {
        none: { bookingId },
      },
    }
  

  const candidates = await prisma.plumberProfile.findMany({
    where: booking.category == 'OTHER' ?
    candidateFilter :
    {
      ...candidateFilter,skills:{ 
        has: booking.category 
      } 
    },
    select: {
      id: true,
      userId: true,
      serviceRadiusKm: true,
      currentLocation: { select: { latitude: true, longitude: true } },
    },
  });

  const ranked = candidates
    .map((c) => {
      const loc = c.currentLocation!;
      const distanceKm = haversineDistanceKm(booking.latitude, booking.longitude, loc.latitude, loc.longitude);
      return { ...c, distanceKm };
    })
    .filter((c) => c.distanceKm <= c.serviceRadiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, JOB_OFFER_MAX_CANDIDATES);

  if (ranked.length === 0) {
    const respondedCount = await prisma.jobOffer.count({
      where: { bookingId, status: { not: 'PENDING' } },
    });
    if (respondedCount > 0) {
      await prisma.booking.updateMany({
        where: { id: bookingId, status: { in: ['REQUESTED', 'MATCHING'] } },
        data: { status: 'EXPIRED' },
      });
    } else {
      await prisma.booking.updateMany({
        where: { id: bookingId, status: 'REQUESTED' },
        data: { status: 'MATCHING' },
      });
    }
    return;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.booking.findUnique({ where: { id: bookingId }, select: { status: true } });
    if (!fresh || (fresh.status !== 'REQUESTED' && fresh.status !== 'MATCHING')) return;

    await tx.jobOffer.createMany({
      data: ranked.map((c) => ({
        bookingId,
        plumberId: c.id,
        distanceKm: c.distanceKm,
        status: 'PENDING',
        offeredAt: now,
      })),
    });

    await tx.booking.update({ where: { id: bookingId }, data: { status: 'MATCHING' } });
  });

  const createdOffers = await prisma.jobOffer.findMany({
    where: { bookingId, status: 'PENDING', plumberId: { in: ranked.map((c) => c.id) } },
    select: { id: true, plumberId: true },
  });
  const offerIdByPlumberId = new Map(createdOffers.map((o) => [o.plumberId, o.id]));

  for (const c of ranked) {
    const offerId = offerIdByPlumberId.get(c.id);
    if (!offerId) continue;
    try {
      const tokens = await prisma.deviceToken.findMany({ where: { userId: c.userId }, select: { fcmToken: true } });
      if (tokens.length === 0) continue;
      await sendPush(
        tokens.map((t) => t.fcmToken),
        { title: 'New job nearby', body: `${booking.category} request`, data: { type: 'job_offer', bookingId, offerId } }
      );
    } catch (err) {
      console.error('[PUSH] matchBooking notify failed:', err);
    }
  }
}
