import { NotificationChannel, Role } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';
import { sendPush } from '../../utils/push.js';
import { sendSms } from '../../utils/sms.js';
import { sendEmail } from '../../utils/email.js';

export async function listMyNotifications(userId: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });

  return paginateResults(rows, limit);
}

export async function markAsRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId) {
    throw createError('Notification not found', 404);
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function broadcastNotification(data: {
  title: string;
  body: string;
  channels: NotificationChannel[];
  segment?: { role?: Role; isGuest?: boolean };
}): Promise<{ notifiedCount: number }> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      isBanned: false,
      ...(data.segment?.role ? { role: data.segment.role } : {}),
      ...(data.segment?.isGuest !== undefined ? { isGuest: data.segment.isGuest } : {}),
    },
    include: { devices: true },
  });

  // MVP simplification: no queue infrastructure — broadcasts to large segments run as a
  // straightforward sequential/allSettled loop in-request rather than being enqueued as jobs.
  // One Notification row per (user, channel) — `Notification.channel` is a single value, so a
  // 3-channel broadcast to the same user creates 3 rows, matching how per-event notifications
  // already work elsewhere in the app.
  const now = new Date();
  await Promise.allSettled(
    users.flatMap((user) =>
      data.channels.map(async (channel) => {
        await prisma.notification.create({
          data: { userId: user.id, title: data.title, body: data.body, channel, sentAt: now },
        });

        if (channel === NotificationChannel.PUSH) {
          try {
            const tokens = user.devices.map((d) => d.fcmToken);
            await sendPush(tokens, { title: data.title, body: data.body });
          } catch (err) {
            console.error(`[broadcast] push failed for user ${user.id}:`, err);
          }
        } else if (channel === NotificationChannel.SMS) {
          if (user.phone) {
            try {
              await sendSms(user.phone, `${data.title}: ${data.body}`);
            } catch (err) {
              console.error(`[broadcast] sms failed for user ${user.id}:`, err);
            }
          }
        } else if (channel === NotificationChannel.EMAIL) {
          if (user.email) {
            try {
              await sendEmail(user.email, data.title, data.body);
            } catch (err) {
              console.error(`[broadcast] email failed for user ${user.id}:`, err);
            }
          }
        }
      })
    )
  );

  return { notifiedCount: users.length };
}

// Reconstructs a "broadcast" as a group of Notification rows sharing the same
// (title, body, sentAt) — there's no dedicated Broadcast/campaign table, so
// history is derived from the rows the send itself created.
export async function getBroadcastHistory(cursor: string | undefined, limit: number) {
  const rows = await prisma.$queryRaw<
    { title: string; body: string; sentAt: Date; channels: string[]; recipientCount: bigint }[]
  >`
    SELECT "title", "body", "sentAt", array_agg(DISTINCT "channel"::text) AS channels, COUNT(*)::bigint AS "recipientCount"
    FROM "Notification"
    WHERE "sentAt" IS NOT NULL
    GROUP BY "title", "body", "sentAt"
    ORDER BY "sentAt" DESC
    LIMIT ${limit}
  `;

  return {
    items: rows.map((r) => ({
      title: r.title,
      body: r.body,
      sentAt: r.sentAt,
      channels: r.channels,
      recipientCount: Number(r.recipientCount),
    })),
    nextCursor: null as string | null,
  };
}
