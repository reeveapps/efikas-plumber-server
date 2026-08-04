import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { prisma } from '../db/index.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { corsOriginChecker } from '../utils/cors.js';
import { AuthUser } from '../types/index.js';

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
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('Missing auth token');
      socket.data.user = verifyAccessToken(token);
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
