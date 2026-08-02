import { ConversationType } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';
import { sendPush } from '../../utils/push.js';
import { emitNewConversationMessage } from '../../realtime/socket.js';
import { AuthUser } from '../../types/index.js';

function isParticipant(conversation: { userAId: string; userBId: string }, requester: AuthUser): boolean {
  return conversation.userAId === requester.userId || conversation.userBId === requester.userId;
}

function assertParticipant(conversation: { userAId: string; userBId: string }, requester: AuthUser): void {
  if (!isParticipant(conversation, requester)) throw createError('Conversation not found', 404);
}

/// Finds an existing conversation between the two users (either stored order —
/// there's no fixed "userA is always X" convention) or creates one. Not
/// wrapped in a transaction/advisory lock: a rare concurrent double-create
/// (two near-simultaneous "start chat" taps) would just produce two threads
/// rather than corrupt data, an acceptable tradeoff for this scope.
async function getOrCreateConversation(
  type: ConversationType,
  userAId: string,
  userBId: string,
  productId?: string
) {
  const existing = await prisma.conversation.findFirst({
    where: {
      type,
      productId: productId ?? null,
      OR: [
        { userAId, userBId },
        { userAId: userBId, userBId: userAId },
      ],
    },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: { type, userAId, userBId, productId },
  });
}

export async function startWithPlumber(requester: AuthUser, plumberId: string) {
  const plumber = await prisma.plumberProfile.findUnique({
    where: { id: plumberId },
    select: { userId: true, verificationStatus: true },
  });
  if (!plumber || plumber.verificationStatus !== 'APPROVED') throw createError('Plumber not found', 404);
  if (plumber.userId === requester.userId) throw createError('Cannot start a conversation with yourself', 400);

  return getOrCreateConversation('CUSTOMER_PLUMBER', requester.userId, plumber.userId);
}

export async function startWithSupplier(requester: AuthUser, partnerId: string, productId: string | undefined) {
  const partner = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: { userId: true },
  });
  if (!partner) throw createError('Supplier not found', 404);
  if (partner.userId === requester.userId) throw createError('Cannot start a conversation with yourself', 400);

  if (productId) {
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { partnerId: true } });
    if (!product || product.partnerId !== partnerId) throw createError('Product not found', 404);
  }

  const type: ConversationType = requester.role === 'PLUMBER' ? 'PLUMBER_SUPPLIER' : 'CUSTOMER_SUPPLIER';
  return getOrCreateConversation(type, requester.userId, partner.userId, productId);
}

const CONVERSATION_USER_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  role: true,
  partnerProfile: { select: { businessName: true } },
};

/// Lists every conversation the requester is party to (either side), for a
/// "Chat" tab to merge alongside booking-scoped threads. Each row includes
/// both users' display info — the client picks whichever isn't itself —
/// plus the single most recent message via a `take: 1` relation query (one
/// batched query, not one-per-conversation), same pattern as the booking
/// chat list's last-message preview.
export async function listMyConversations(requester: AuthUser, cursor: string | undefined, limit: number) {
  const rows = await prisma.conversation.findMany({
    where: { OR: [{ userAId: requester.userId }, { userBId: requester.userId }] },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    include: {
      userA: { select: CONVERSATION_USER_SELECT },
      userB: { select: CONVERSATION_USER_SELECT },
      messages: { take: 1, orderBy: { createdAt: 'desc' } },
    },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  return paginateResults(rows, limit);
}

export async function listMessages(conversationId: string, requester: AuthUser, cursor: string | undefined, limit: number) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw createError('Conversation not found', 404);
  assertParticipant(conversation, requester);

  const rows = await prisma.conversationMessage.findMany({
    where: { conversationId },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return paginateResults(rows, limit);
}

export async function createMessage(
  conversationId: string,
  requester: AuthUser,
  data: { body?: string; attachmentUrl?: string }
) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw createError('Conversation not found', 404);
  assertParticipant(conversation, requester);

  const message = await prisma.conversationMessage.create({
    data: { conversationId, senderId: requester.userId, body: data.body, attachmentUrl: data.attachmentUrl },
  });

  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  const recipientUserId = conversation.userAId === requester.userId ? conversation.userBId : conversation.userAId;
  emitNewConversationMessage(conversationId, message, recipientUserId);

  try {
    const tokens = await prisma.deviceToken.findMany({ where: { userId: recipientUserId }, select: { fcmToken: true } });
    if (tokens.length) {
      await sendPush(
        tokens.map((t) => t.fcmToken),
        {
          title: 'New message',
          body: data.body ?? 'Sent an attachment',
          data: { type: 'conversation_message', conversationId },
        }
      );
    }
  } catch (err) {
    console.error('[PUSH] conversation createMessage notify failed:', err);
  }

  return message;
}

export async function markMessagesRead(conversationId: string, requester: AuthUser): Promise<void> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw createError('Conversation not found', 404);
  assertParticipant(conversation, requester);

  await prisma.conversationMessage.updateMany({
    where: { conversationId, senderId: { not: requester.userId }, readAt: null },
    data: { readAt: new Date() },
  });
}
