import { prisma } from '../db/index.js';

// While a plumber is on an active job their live position only needs to reach
// the customer's map, which happens over Socket.IO straight from these pushes.
// Writing every ping to Postgres bought nothing for that, so during a job the
// position lives here, in memory, and is written to `PlumberLocation` once —
// when the job completes or is cancelled (`finishBooking`). Outside a job the
// throttled write in plumbers.service.ts still applies.
//
// Everything here resets on a restart, which is harmless: the plumber's app
// pushes again within seconds and repopulates it.

export interface Position {
  latitude: number;
  longitude: number;
  heading?: number;
}

interface Remembered extends Position {
  plumberId: string;
  bookingId: string;
  at: number;
}

const byBooking = new Map<string, Remembered>();
const byPlumber = new Map<string, Remembered>();

// A new position for the same booking or plumber replaces the previous one
// (same map key), so this never holds more than one entry per active job and
// one per plumber. The only things that can linger are entries for jobs that
// ended by a route that doesn't call `finishBooking` (a dispute, an admin
// edit, a row deleted by hand); the sweep below removes those.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function rememberPosition(bookingId: string, plumberId: string, position: Position): void {
  const entry: Remembered = { ...position, plumberId, bookingId, at: Date.now() };
  byBooking.set(bookingId, entry);
  byPlumber.set(plumberId, entry);
}

// --- Outside a job: is a database write of the "I'm online" position due? ---
//
// Throttled so a burst of pings (older app versions push every 30s) doesn't
// write every time. Entries only matter for as long as the throttle window, so
// the sweep drops anything older than that.

export const DATABASE_WRITE_INTERVAL_MS = 30_000;
const lastDatabaseWriteAt = new Map<string, number>();

export function isDatabaseWriteDue(plumberId: string): boolean {
  return Date.now() - (lastDatabaseWriteAt.get(plumberId) ?? 0) >= DATABASE_WRITE_INTERVAL_MS;
}

export function markDatabaseWrite(plumberId: string): void {
  lastDatabaseWriteAt.set(plumberId, Date.now());
}

/// For a customer opening the tracking screen mid-job: gives them the plumber's
/// current spot immediately instead of a blank map until the next ping.
export function lastKnownPositionForBooking(bookingId: string): Position | undefined {
  return byBooking.get(bookingId);
}

/// A plumber on a job isn't writing to the database, so their `PlumberLocation`
/// goes stale; matching uses this to rank them by where they actually are.
export function lastKnownPositionForPlumber(plumberId: string): Position | undefined {
  return byPlumber.get(plumberId);
}

// --- Is this push for a real, active job of this plumber? ---
//
// The check needs a booking lookup, cached briefly so a 5s push cadence costs
// one read per CHECK_TTL_MS rather than one per ping.

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'DISPUTED', 'EXPIRED']);
const CHECK_TTL_MS = 30_000;
const checkCache = new Map<string, { plumberId: string | null; terminal: boolean; checkedAt: number }>();

export async function checkBooking(bookingId: string): Promise<{ plumberId: string | null; terminal: boolean }> {
  const now = Date.now();
  const cached = checkCache.get(bookingId);
  if (cached && now - cached.checkedAt < CHECK_TTL_MS) return cached;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { plumberId: true, status: true },
  });
  const fresh = {
    plumberId: booking?.plumberId ?? null,
    terminal: !booking || TERMINAL_STATUSES.has(booking.status),
    checkedAt: now,
  };
  checkCache.set(bookingId, fresh);
  return fresh;
}

function sweep(now: number): void {
  for (const [bookingId, entry] of byBooking) {
    if (now - entry.at > STALE_AFTER_MS) {
      byBooking.delete(bookingId);
      if (byPlumber.get(entry.plumberId)?.bookingId === bookingId) byPlumber.delete(entry.plumberId);
    }
  }
  for (const [bookingId, entry] of checkCache) {
    if (now - entry.checkedAt > CHECK_TTL_MS) checkCache.delete(bookingId);
  }
  for (const [plumberId, at] of lastDatabaseWriteAt) {
    if (now - at > DATABASE_WRITE_INTERVAL_MS) lastDatabaseWriteAt.delete(plumberId);
  }
}

/// Starts the daily cleanup of everything above, independent of traffic (the
/// old cleanup only ran when a new ping arrived). Daily is plenty: what it
/// removes is a few small leftover entries, and a restart clears them anyway.
/// `unref` so this timer alone never keeps the process alive at shutdown.
export function startLocationStoreSweep(): void {
  setInterval(() => sweep(Date.now()), SWEEP_INTERVAL_MS).unref();
}

/// Call when a job completes or is cancelled: writes the plumber's last
/// position to the database (so matching starts from where they finished) and
/// stops treating the job as active, so a late ping can't start remembering it
/// again with nothing left to flush it.
export async function finishBooking(bookingId: string): Promise<void> {
  const existing = checkCache.get(bookingId);
  checkCache.set(bookingId, { plumberId: existing?.plumberId ?? null, terminal: true, checkedAt: Date.now() });

  const entry = byBooking.get(bookingId);
  if (!entry) return;
  byBooking.delete(bookingId);
  if (byPlumber.get(entry.plumberId)?.bookingId === bookingId) byPlumber.delete(entry.plumberId);

  const { plumberId, latitude, longitude, heading } = entry;
  try {
    await prisma.plumberLocation.upsert({
      where: { plumberId },
      create: { plumberId, latitude, longitude, heading },
      update: { latitude, longitude, heading },
    });
  } catch (err) {
    // Best effort: failing to save the final position must never fail the
    // job completion or cancellation that triggered it.
    console.error('[location] persisting final position failed:', err);
  }
}
