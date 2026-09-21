import { prisma } from '../db/index.js';
import { matchBooking } from '../modules/bookings/matching.service.js';
import { emitBookingUpdate } from '../realtime/socket.js';
import { JOB_OFFER_TIMEOUT_SECONDS } from '../config/constants.js';

// Replaces the old 20s cron, which queried the DB every tick around the
// clock and so kept a serverless Postgres (Neon) awake permanently. One
// timer is armed for the earliest PENDING offer's deadline; when there are
// no pending offers there is no timer and no query at all.
//
// Timers live in memory, so `startOfferTimeouts` re-arms from the DB at boot
// (a redeploy would otherwise lose them), and each sweep re-arms from the DB
// afterwards.

// setTimeout's ceiling (~24.8 days); a longer delay would fire immediately.
const MAX_TIMER_MS = 2_147_483_647;

let timer: NodeJS.Timeout | null = null;

function arm(deadlineMs: number): void {
  if (timer) clearTimeout(timer);
  const delay = Math.min(Math.max(deadlineMs - Date.now(), 1000), MAX_TIMER_MS);
  timer = setTimeout(() => {
    timer = null;
    void sweepThenRearm();
  }, delay);
}

async function sweepThenRearm(): Promise<void> {
  try {
    await sweepExpiredOffers();
  } catch (err) {
    console.error('[offer-timeouts] sweep failed:', err);
  }
  try {
    await armFromDb();
  } catch (err) {
    console.error('[offer-timeouts] re-arm failed:', err);
  }
}

async function sweepExpiredOffers(): Promise<void> {
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
      emitBookingUpdate(b.id);
    }
  }
}

async function armFromDb(): Promise<void> {
  const next = await prisma.jobOffer.findFirst({
    where: { status: 'PENDING' },
    orderBy: { offeredAt: 'asc' },
    select: { offeredAt: true },
  });
  if (!next) {
    if (timer) clearTimeout(timer);
    timer = null;
    return;
  }
  arm(next.offeredAt.getTime() + JOB_OFFER_TIMEOUT_SECONDS * 1000);
}

/// Call right after creating new PENDING offers. New offers are always the
/// latest deadline, so if a timer is already armed for an earlier one there
/// is nothing to do — and no DB query is needed either way.
export function scheduleOfferTimeout(offeredAt: Date): void {
  if (timer) return;
  arm(offeredAt.getTime() + JOB_OFFER_TIMEOUT_SECONDS * 1000);
}

export function startOfferTimeouts(): void {
  void sweepThenRearm();
}
