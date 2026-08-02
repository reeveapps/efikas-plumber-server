import { BookingStatus, DisputeReason, PaymentProvider } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';
import { sendPush } from '../../utils/push.js';
import { emitNewMessage } from '../../realtime/socket.js';
import { AuthUser } from '../../types/index.js';
import { matchBooking } from './matching.service.js';

const BOOKING_DETAIL_INCLUDE = {
  customer: { select: { id: true, user: { select: { name: true, phone: true, avatarUrl: true } } } },
  plumber: {
    select: {
      id: true,
      ratingAverage: true,
      ratingCount: true,
      user: { select: { name: true, phone: true, avatarUrl: true } },
    },
  },
  statusLogs: { orderBy: { createdAt: 'asc' as const } },
  review: true,
  dispute: true,
  paymentRecord: true,
} as const;

function isCustomerOwner(booking: { customerId: string }, requester: AuthUser): boolean {
  return requester.role === 'CUSTOMER' && booking.customerId === requester.profileId;
}

function isAssignedPlumber(booking: { plumberId: string | null }, requester: AuthUser): boolean {
  return requester.role === 'PLUMBER' && !!booking.plumberId && booking.plumberId === requester.profileId;
}

function assertParticipant(booking: { customerId: string; plumberId: string | null }, requester: AuthUser): void {
  if (!isCustomerOwner(booking, requester) && !isAssignedPlumber(booking, requester)) {
    throw createError('Booking not found', 404);
  }
}

// Best-effort "your plumber's status changed" push to the customer — used by
// every endpoint that advances a booking's status (updateStatus, agreement
// confirmation, completion), so each one doesn't repeat the token lookup.
async function notifyCustomerOfStatus(customerProfileId: string, bookingId: string, statusLabel: string): Promise<void> {
  try {
    const customer = await prisma.customerProfile.findUnique({ where: { id: customerProfileId }, select: { userId: true } });
    if (!customer) return;
    const tokens = await prisma.deviceToken.findMany({ where: { userId: customer.userId }, select: { fcmToken: true } });
    if (tokens.length === 0) return;
    await sendPush(
      tokens.map((t) => t.fcmToken),
      { title: 'Booking update', body: `Your plumber is now ${statusLabel.toLowerCase()}`, data: { type: 'status_update', bookingId } }
    );
  } catch (err) {
    console.error('[PUSH] status notify failed:', err);
  }
}

interface CreateBookingInput {
  category: import('@prisma/client').ServiceCategory;
  subCategory?: string;
  description?: string;
  voiceNoteUrl?: string;
  address: string;
  latitude: number;
  longitude: number;
  preferredAt?: Date;
  isAsap: boolean;
}

export async function createBooking(customerId: string, data: CreateBookingInput, photoUrls: string[]) {
  const booking = await prisma.booking.create({
    data: {
      customerId,
      category: data.category,
      subCategory: data.subCategory,
      description: data.description,
      voiceNoteUrl: data.voiceNoteUrl,
      photoUrls,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      preferredAt: data.preferredAt,
      isAsap: data.isAsap,
      status: 'REQUESTED',
    },
  });
  await matchBooking(booking.id);
  return prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
}

export async function getBookingDetail(bookingId: string, requester: AuthUser) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_DETAIL_INCLUDE });
  if (!booking) throw createError('Booking not found', 404);
  if (!isCustomerOwner(booking, requester) && !isAssignedPlumber(booking, requester) && requester.role !== 'ADMIN') {
    throw createError('Booking not found', 404);
  }
  return booking;
}

export async function getMatches(bookingId: string, customerId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== customerId) throw createError('Booking not found', 404);

  return prisma.jobOffer.findMany({
    where: { bookingId, status: 'PENDING' },
    orderBy: { distanceKm: 'asc' },
    include: {
      plumber: {
        select: {
          id: true,
          ratingAverage: true,
          ratingCount: true,
          user: { select: { name: true, avatarUrl: true } },
        },
      },
    },
  });
}

export async function selectPlumber(bookingId: string, customerId: string, plumberId: string | undefined) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== customerId) throw createError('Booking not found', 404);
  if (booking.status !== 'REQUESTED' && booking.status !== 'MATCHING') {
    throw createError('Booking is no longer accepting plumber selection', 409);
  }

  if (plumberId) {
    const plumber = await prisma.plumberProfile.findUnique({ where: { id: plumberId } });
    if (!plumber || plumber.verificationStatus !== 'APPROVED') {
      throw createError('Plumber not available', 400);
    }

    const now = new Date();
    const [, createdOffer] = await prisma.$transaction([
      prisma.jobOffer.updateMany({
        where: { bookingId, status: 'PENDING' },
        data: { status: 'TIMED_OUT', respondedAt: now },
      }),
      prisma.jobOffer.create({
        data: { bookingId, plumberId, status: 'PENDING', offeredAt: now },
      }),
      prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'MATCHING', requestedPlumberId: plumberId },
      }),
    ]);

    try {
      const tokens = await prisma.deviceToken.findMany({ where: { userId: plumber.userId }, select: { fcmToken: true } });
      if (tokens.length) {
        await sendPush(
          tokens.map((t) => t.fcmToken),
          {
            title: 'New job nearby',
            body: `${booking.category} request`,
            data: { type: 'job_offer', bookingId, offerId: createdOffer.id },
          }
        );
      }
    } catch (err) {
      console.error('[PUSH] selectPlumber notify failed:', err);
    }
  } else {
    await matchBooking(bookingId);
  }

  return prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
}

const NON_CANCELLABLE_STATUSES: BookingStatus[] = ['COMPLETED', 'CANCELLED', 'DISPUTED', 'EXPIRED'];

export async function cancelBooking(bookingId: string, requester: AuthUser, reason: string | undefined) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw createError('Booking not found', 404);
  assertParticipant(booking, requester);
  if (NON_CANCELLABLE_STATUSES.includes(booking.status)) {
    throw createError('Booking cannot be cancelled in its current state', 409);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED', cancelledAt: now, cancelledReason: reason },
    }),
    prisma.jobOffer.updateMany({
      where: { bookingId, status: 'PENDING' },
      data: { status: 'TIMED_OUT', respondedAt: now },
    }),
    prisma.bookingStatusLog.create({ data: { bookingId, status: 'CANCELLED', note: reason } }),
  ]);

  return prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
}

const STATUS_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus>> = {
  ACCEPTED: 'EN_ROUTE',
  EN_ROUTE: 'ARRIVED',
  ARRIVED: 'INSPECTING',
  AGREEMENT_REACHED: 'IN_PROGRESS',
};

interface UpdateStatusInput {
  status: 'EN_ROUTE' | 'ARRIVED' | 'INSPECTING' | 'IN_PROGRESS';
  latitude?: number;
  longitude?: number;
  note?: string;
}

export async function updateStatus(bookingId: string, plumberId: string, data: UpdateStatusInput) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.plumberId !== plumberId) throw createError('Booking not found', 404);

  const expectedNext = STATUS_TRANSITIONS[booking.status];
  if (expectedNext !== data.status) {
    throw createError(`Invalid status transition from ${booking.status}`, 409);
  }

  await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { status: data.status } }),
    prisma.bookingStatusLog.create({
      data: { bookingId, status: data.status, latitude: data.latitude, longitude: data.longitude, note: data.note },
    }),
  ]);

  await notifyCustomerOfStatus(booking.customerId, bookingId, data.status);

  return prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
}

export async function plumberConfirmAgreement(bookingId: string, plumberId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.plumberId !== plumberId) throw createError('Booking not found', 404);
  if (booking.status !== 'INSPECTING') throw createError('Booking is not in INSPECTING state', 409);

  const bothConfirmed = booking.agreementConfirmedByCustomer;
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      agreementConfirmedByPlumber: true,
      ...(bothConfirmed ? { status: 'AGREEMENT_REACHED', agreementConfirmedAt: new Date() } : {}),
    },
  });

  if (bothConfirmed) {
    await prisma.bookingStatusLog.create({ data: { bookingId, status: 'AGREEMENT_REACHED' } });
    await notifyCustomerOfStatus(booking.customerId, bookingId, 'AGREEMENT_REACHED');
  }

  return updated;
}

export async function customerConfirmAgreement(bookingId: string, customerId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== customerId) throw createError('Booking not found', 404);
  if (booking.status !== 'INSPECTING') throw createError('Booking is not in INSPECTING state', 409);

  const bothConfirmed = booking.agreementConfirmedByPlumber;
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      agreementConfirmedByCustomer: true,
      ...(bothConfirmed ? { status: 'AGREEMENT_REACHED', agreementConfirmedAt: new Date() } : {}),
    },
  });

  if (bothConfirmed) {
    await prisma.bookingStatusLog.create({ data: { bookingId, status: 'AGREEMENT_REACHED' } });
  }

  return updated;
}

export async function completeBooking(bookingId: string, plumberId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.plumberId !== plumberId) throw createError('Booking not found', 404);
  if (booking.status !== 'IN_PROGRESS') throw createError('Booking is not IN_PROGRESS', 409);

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED', completedAt: now } }),
    prisma.plumberProfile.update({ where: { id: plumberId }, data: { jobsCompletedCount: { increment: 1 } } }),
    prisma.bookingStatusLog.create({ data: { bookingId, status: 'COMPLETED' } }),
  ]);

  await notifyCustomerOfStatus(booking.customerId, bookingId, 'COMPLETED');

  return updated;
}

export async function getTimeline(bookingId: string, requester: AuthUser) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw createError('Booking not found', 404);
  if (!isCustomerOwner(booking, requester) && !isAssignedPlumber(booking, requester) && requester.role !== 'ADMIN') {
    throw createError('Booking not found', 404);
  }
  return prisma.bookingStatusLog.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
}

export async function createPaymentRecord(
  bookingId: string,
  plumberId: string,
  data: { amountKes: number; method: PaymentProvider }
) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.plumberId !== plumberId) throw createError('Booking not found', 404);

  return prisma.paymentRecord.upsert({
    where: { bookingId },
    create: { bookingId, amountKes: data.amountKes, method: data.method, reportedByPlumberAt: new Date() },
    update: { amountKes: data.amountKes, method: data.method, reportedByPlumberAt: new Date() },
  });
}

export async function confirmPaymentRecord(bookingId: string, customerId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== customerId) throw createError('Booking not found', 404);

  const record = await prisma.paymentRecord.findUnique({ where: { bookingId } });
  if (!record) throw createError('Payment record not found', 404);

  const updated = await prisma.paymentRecord.update({ where: { bookingId }, data: { confirmedByCustomerAt: new Date() } });

  if (booking.plumberId) {
    const existingEarnings = await prisma.earningsEntry.findUnique({ where: { bookingId } });
    if (!existingEarnings) {
      await prisma.earningsEntry.create({
        data: { plumberId: booking.plumberId, bookingId, amountKes: record.amountKes },
      });
    }
  }

  return updated;
}

export async function disputePaymentRecord(bookingId: string, customerId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== customerId) throw createError('Booking not found', 404);

  const record = await prisma.paymentRecord.findUnique({ where: { bookingId } });
  if (!record) throw createError('Payment record not found', 404);

  return prisma.paymentRecord.update({ where: { bookingId }, data: { disputedAt: new Date() } });
}

interface ReviewInput {
  punctualityRating: number;
  professionalismRating: number;
  qualityRating: number;
  valueRating: number;
  comment?: string;
}

export async function createReview(bookingId: string, customerId: string, data: ReviewInput) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== customerId) throw createError('Booking not found', 404);
  if (booking.status !== 'COMPLETED') throw createError('Booking is not completed', 409);
  if (!booking.plumberId) throw createError('Booking has no assigned plumber', 409);

  const existing = await prisma.review.findUnique({ where: { bookingId } });
  if (existing) throw createError('Review already submitted for this booking', 409);

  const review = await prisma.review.create({
    data: {
      bookingId,
      reviewerId: customerId,
      plumberId: booking.plumberId,
      punctualityRating: data.punctualityRating,
      professionalismRating: data.professionalismRating,
      qualityRating: data.qualityRating,
      valueRating: data.valueRating,
      comment: data.comment,
    },
  });

  const agg = await prisma.review.aggregate({
    where: { plumberId: booking.plumberId, isVisible: true },
    _avg: {
      punctualityRating: true,
      professionalismRating: true,
      qualityRating: true,
      valueRating: true,
    },
    _count: true,
  });

  const ratingAverage =
    agg._count > 0
      ? ((agg._avg.punctualityRating ?? 0) +
          (agg._avg.professionalismRating ?? 0) +
          (agg._avg.qualityRating ?? 0) +
          (agg._avg.valueRating ?? 0)) /
        4
      : 0;

  await prisma.plumberProfile.update({
    where: { id: booking.plumberId },
    data: { ratingAverage, ratingCount: agg._count },
  });

  return review;
}

interface DisputeInput {
  reason: DisputeReason;
  description: string;
  photoUrls: string[];
}

export async function createDispute(bookingId: string, customerId: string, data: DisputeInput) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.customerId !== customerId) throw createError('Booking not found', 404);
  if (!booking.plumberId) throw createError('Booking has no assigned plumber', 409);

  const existing = await prisma.dispute.findUnique({ where: { bookingId } });
  if (existing) throw createError('A dispute already exists for this booking', 409);

  const [dispute] = await prisma.$transaction([
    prisma.dispute.create({
      data: {
        bookingId,
        reporterId: customerId,
        plumberId: booking.plumberId,
        reason: data.reason,
        description: data.description,
        photoUrls: data.photoUrls,
      },
    }),
    prisma.booking.update({ where: { id: bookingId }, data: { status: 'DISPUTED' } }),
  ]);

  return dispute;
}

export async function listMessages(bookingId: string, requester: AuthUser, cursor: string | undefined, limit: number) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw createError('Booking not found', 404);
  assertParticipant(booking, requester);

  const page = cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } };
  const rows = await prisma.message.findMany({
    where: { bookingId },
    ...page,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  return paginateResults(rows, limit);
}

export async function createMessage(
  bookingId: string,
  requester: AuthUser,
  data: { body?: string; attachmentUrl?: string }
) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw createError('Booking not found', 404);
  assertParticipant(booking, requester);

  const message = await prisma.message.create({
    data: { bookingId, senderId: requester.userId, body: data.body, attachmentUrl: data.attachmentUrl },
  });

  const otherProfileId = requester.role === 'CUSTOMER' ? booking.plumberId : booking.customerId;
  const otherUser = otherProfileId
    ? await (requester.role === 'CUSTOMER'
        ? prisma.plumberProfile.findUnique({ where: { id: otherProfileId }, select: { userId: true } })
        : prisma.customerProfile.findUnique({ where: { id: otherProfileId }, select: { userId: true } }))
    : null;

  emitNewMessage(bookingId, message, otherUser?.userId);

  try {
    if (otherUser) {
      const tokens = await prisma.deviceToken.findMany({ where: { userId: otherUser.userId }, select: { fcmToken: true } });
      if (tokens.length) {
        await sendPush(
          tokens.map((t) => t.fcmToken),
          {
            title: 'New message',
            body: data.body ?? 'Sent an attachment',
            data: { type: 'chat_message', bookingId },
          }
        );
      }
    }
  } catch (err) {
    console.error('[PUSH] createMessage notify failed:', err);
  }

  return message;
}

export async function markMessagesRead(bookingId: string, requester: AuthUser): Promise<void> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw createError('Booking not found', 404);
  assertParticipant(booking, requester);

  await prisma.message.updateMany({
    where: { bookingId, senderId: { not: requester.userId }, readAt: null },
    data: { readAt: new Date() },
  });
}

const CALL_ALLOWED_STATUSES: BookingStatus[] = [
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'INSPECTING',
  'AGREEMENT_REACHED',
  'IN_PROGRESS',
  'COMPLETED',
];


export async function revealNumber(bookingId: string, requester: AuthUser) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: { select: { user: { select: { phone: true } } } },
      plumber: { select: { user: { select: { phone: true } } } },
    },
  });
  if (!booking) throw createError('Booking not found', 404);
  assertParticipant(booking, requester);

  if (!CALL_ALLOWED_STATUSES.includes(booking.status)) {
    throw createError('Calling is not available yet for this booking', 400);
  }

  const other = requester.role === 'CUSTOMER' ? booking.plumber : booking.customer;
  if (!other) throw createError('Other participant not found', 404);

  return { phone: other.user.phone };
}
