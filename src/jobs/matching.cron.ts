import cron from 'node-cron';
import { prisma } from '../db/index.js';
import { matchBooking } from '../modules/bookings/matching.service.js';
import { JOB_OFFER_TIMEOUT_SECONDS } from '../config/constants.js';

// Sweeps stale PENDING job offers every 20s: times them out, then re-drives the
// matching engine for any booking left with zero pending offers (next batch or expiry).
export function startMatchingCron(): void {
  cron.schedule('*/20 * * * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - JOB_OFFER_TIMEOUT_SECONDS * 1000);
      const timedOut = await prisma.jobOffer.findMany({
        where: { status: 'PENDING', offeredAt: { lt: cutoff } },
        select: { id: true, bookingId: true },
      });

      if (timedOut.length === 0) return;

      await prisma.jobOffer.updateMany({
        where: { id: { in: timedOut.map((o) => o.id) } },
        data: { status: 'TIMED_OUT', respondedAt: new Date() },
      });

      const bookingIds = [...new Set(timedOut.map((o) => o.bookingId))];
      const stillMatching = await prisma.booking.findMany({
        where: { id: { in: bookingIds }, status: 'MATCHING' },
        select: { id: true },
      });

      for (const b of stillMatching) {
        const pendingCount = await prisma.jobOffer.count({ where: { bookingId: b.id, status: 'PENDING' } });
        if (pendingCount === 0) {
          await matchBooking(b.id);
        }
      }
    } catch (err) {
      console.error('[matching.cron] tick failed:', err);
    }
  });
}
