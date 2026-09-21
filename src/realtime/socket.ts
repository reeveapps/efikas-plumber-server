import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { prisma } from '../db/index.js';
import { verifyAccessToken, verifySocketToken } from '../utils/jwt.js';
import { corsOriginChecker } from '../utils/cors.js';
import { AuthUser } from '../types/index.js';
import { lastKnownPositionForBooking } from './plumber-location-store.js';

let io: Server | null = null;

function bookingRoom(bookingId: string): string {
  return `booking:${bookingId}`;
}

function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

// Every connected socket auto-joins its own user room (below), independent
// of which booking rooms it's explicitly `chat:join`'d — this is what lets
// `emitNewMessage` notify a recipient of a new message for the unread badge
// even when they don't have that specific booking's chat thread open.
function userRoom(userId: string): string {
  return `user:${userId}`;
}

function isParticipant(booking: { customerId: string; plumberId: string | null }, user: AuthUser): boolean {
  if (user.role === 'CUSTOMER') return booking.customerId === user.profileId;
  if (user.role === 'PLUMBER') return !!booking.plumberId && booking.plumberId === user.profileId;
  return false;
}

/// Attaches a Socket.IO server to the same HTTP server Express listens on.
/// Auth mirrors the REST JWT flow (same access token, verified the same way)
/// so there's no separate credential path to keep in sync; booking-room
/// membership is re-checked per join, same as `assertParticipant` on the
/// REST message endpoints, so a socket can't eavesdrop on a booking its user
/// isn't party to just by guessing an id.
export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: corsOriginChecker, credentials: true },
  });

  io.use((socket, next) => {
    try {
      // Mobile sends its access token; browsers (httpOnly cookies, no JS
      // access to the real token) send a short-lived socket token instead.
      const socketToken = socket.handshake.auth?.socketToken as string | undefined;
      const token = socket.handshake.auth?.token as string | undefined;
      if (socketToken) {
        socket.data.user = verifySocketToken(socketToken);
      } else if (token) {
        socket.data.user = verifyAccessToken(token);
      } else {
        throw new Error('Missing auth token');
      }
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthUser;
    socket.join(userRoom(user.userId));

    socket.on('chat:join', async (bookingId: string) => {
      try {
        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
          select: { customerId: true, plumberId: true },
        });
        if (!booking || !isParticipant(booking, user)) return;
        socket.join(bookingRoom(bookingId));
      } catch (err) {
        console.error('[Socket] chat:join failed:', err);
      }
    });

    socket.on('chat:leave', (bookingId: string) => {
      socket.leave(bookingRoom(bookingId));
    });

    socket.on('conversation:join', async (conversationId: string) => {
      try {
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { userAId: true, userBId: true },
        });
        if (!conversation) return;
        if (conversation.userAId !== user.userId && conversation.userBId !== user.userId) return;
        socket.join(conversationRoom(conversationId));
      } catch (err) {
        console.error('[Socket] conversation:join failed:', err);
      }
    });

    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(conversationRoom(conversationId));
    });

    // Same room as chat:join (both key off bookingId), kept as a distinct
    // event so a customer's live-tracking screen can subscribe to location
    // updates without also joining chat, and vice versa.
    socket.on('location:join', async (bookingId: string) => {
      try {
        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
          select: { customerId: true, plumberId: true },
        });
        if (!booking || !isParticipant(booking, user)) return;
        socket.join(bookingRoom(bookingId));
        // Someone opening tracking mid-job gets the plumber's current spot at
        // once, rather than a blank map until the next ping arrives.
        const last = lastKnownPositionForBooking(bookingId);
        if (last) {
          socket.emit('location:update', {
            bookingId,
            latitude: last.latitude,
            longitude: last.longitude,
            heading: last.heading,
          });
        }
      } catch (err) {
        console.error('[Socket] location:join failed:', err);
      }
    });

    socket.on('location:leave', (bookingId: string) => {
      socket.leave(bookingRoom(bookingId));
    });
  });

  return io;
}

/// Broadcasts a newly created chat message to every connected client in that
/// booking's room (for an open `ChatThreadScreen`), and separately bumps the
/// recipient's unread badge via their user room (reaches them even without
/// that booking's thread open). Called from bookings.service.ts's
/// `createMessage` right after the row is persisted — a no-op if Socket.IO
/// hasn't been initialized (e.g. in a unit-test context that never calls
/// `initSocket`).
export function emitNewMessage(bookingId: string, message: unknown, recipientUserId?: string): void {
  io?.to(bookingRoom(bookingId)).emit('chat:message', message);
  if (recipientUserId) {
    io?.to(userRoom(recipientUserId)).emit('chat:unread', { bookingId });
  }
}

/// Booking-independent counterpart to `emitNewMessage` — broadcasts to the
/// conversation's room (for an open `ConversationThreadScreen`) and bumps the
/// recipient's Chat-tab unread badge via their user room. Called from
/// conversations.service.ts's `createMessage`.
export function emitNewConversationMessage(conversationId: string, message: unknown, recipientUserId: string): void {
  io?.to(conversationRoom(conversationId)).emit('conversation:message', message);
  io?.to(userRoom(recipientUserId)).emit('conversation:unread', { conversationId });
}

/// "Something changed on this booking — refetch it." A signal only, carrying
/// no booking data: REST stays the source of truth, so a missed or duplicated
/// event can never leave a client with wrong state, only a refetch late or
/// early. Replaces the status polling on the matching / tracking / active-job
/// screens, which need to have joined the booking's room (`location:join`).
export function emitBookingUpdate(bookingId: string): void {
  io?.to(bookingRoom(bookingId)).emit('booking:update', { bookingId });
  void notifyBookingParticipants(bookingId);
}

/// Same signal, but over each participant's always-joined user room as
/// `bookings:changed`, for list screens (a plumber's My Jobs tab) that aren't
/// inside any one booking's room. Costs one primary-key lookup per booking
/// state change — a handful per job, versus a poll that queries on a timer.
async function notifyBookingParticipants(bookingId: string): Promise<void> {
  if (!io) return;
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { customer: { select: { userId: true } }, plumber: { select: { userId: true } } },
    });
    if (!booking) return;
    for (const userId of [booking.customer?.userId, booking.plumber?.userId]) {
      if (userId) io.to(userRoom(userId)).emit('bookings:changed', { bookingId });
    }
  } catch (err) {
    console.error('[Socket] notifyBookingParticipants failed:', err);
  }
}

/// Tells a plumber a new job offer exists for them, over their always-joined
/// user room (no room join needed) — replaces the job feed's polling. Push
/// notifications still go out separately for when the app is backgrounded.
export function emitJobOffer(plumberUserId: string, offer: { bookingId: string; offerId: string }): void {
  io?.to(userRoom(plumberUserId)).emit('job:offer', offer);
}

/// Tells a partner a customer/plumber just requested delivery of one of their
/// products — a signal for the portal's live counters to refetch, delivered
/// over the partner's always-joined user room.
export function emitDeliveryRequest(partnerUserId: string, deliveryRequestId: string): void {
  io?.to(userRoom(partnerUserId)).emit('delivery:new', { deliveryRequestId });
}

/// Broadcasts a plumber's live position to everyone in that booking's room
/// (the customer's open LiveTrackingScreen). Called from
/// plumbers.service.ts's `upsertLocation` whenever the push includes a
/// bookingId — i.e. only while the plumber has an active job open, not the
/// general "am I online" location ping.
export function emitPlumberLocation(
  bookingId: string,
  location: { latitude: number; longitude: number; heading?: number }
): void {
  io?.to(bookingRoom(bookingId)).emit('location:update', { bookingId, ...location });
}
