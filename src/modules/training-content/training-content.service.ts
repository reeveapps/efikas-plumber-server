import { TrainingCategory } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';
import { sendContentApprovedEmail } from '../../utils/email/index.js';

export interface SubmitContentInput {
  title: string;
  description?: string;
  category: TrainingCategory;
  videoUrl?: string;
  videoFileUrl?: string;
  guidePdfUrl?: string;
  downloadable?: boolean;
}

// Always PENDING_APPROVAL, whether this is a first submission or an
// edit-and-resubmit of a rejected one — see docs/05-partner-portal-web-app.md
// section 5.8: the submit button is deliberately labeled "Submit for Review",
// never "Publish", so this is never a surprise.
export async function submitContent(partnerId: string, data: SubmitContentInput) {
  return prisma.trainingContent.create({
    data: { ...data, partnerId, status: 'PENDING_APPROVAL' },
  });
}

export async function listMyContent(partnerId: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.trainingContent.findMany({
    where: { partnerId },
    orderBy: [{ id: 'asc' }],
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  return paginateResults(rows, limit);
}

async function getOwnedContentOrThrow(id: string, partnerId: string) {
  const content = await prisma.trainingContent.findUnique({ where: { id } });
  if (!content || content.partnerId !== partnerId) throw createError('Training content not found', 404);
  return content;
}

export async function updateAndResubmit(id: string, partnerId: string, data: Partial<SubmitContentInput>) {
  await getOwnedContentOrThrow(id, partnerId);
  return prisma.trainingContent.update({
    where: { id },
    data: { ...data, status: 'PENDING_APPROVAL', rejectionReason: null },
  });
}

// Public/plumber-facing — only ever APPROVED content, never a partner's
// pending or rejected submissions.
export async function listPublicContent(
  category: TrainingCategory | undefined,
  cursor: string | undefined,
  limit: number
) {
  const rows = await prisma.trainingContent.findMany({
    where: { status: 'APPROVED', ...(category ? { category } : {}) },
    orderBy: [{ id: 'asc' }],
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  return paginateResults(rows, limit);
}

export async function incrementViewCount(id: string): Promise<void> {
  await prisma.trainingContent.updateMany({ where: { id, status: 'APPROVED' }, data: { viewCount: { increment: 1 } } });
}

export async function listPendingAdmin(cursor: string | undefined, limit: number) {
  const rows = await prisma.trainingContent.findMany({
    where: { status: 'PENDING_APPROVAL' },
    orderBy: [{ id: 'asc' }],
    include: { partner: { select: { id: true, businessName: true } } },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  return paginateResults(rows, limit);
}

export async function approve(id: string) {
  const content = await prisma.trainingContent.findUnique({
    where: { id },
    include: { partner: { select: { businessName: true, user: { select: { email: true } } } } },
  });
  if (!content) throw createError('Training content not found', 404);

  const updated = await prisma.trainingContent.update({
    where: { id },
    data: { status: 'APPROVED', rejectionReason: null },
  });

  // partner is optional — Admin can author content directly with no partner attached.
  if (content.partner?.user.email) {
    try {
      await sendContentApprovedEmail({
        to: content.partner.user.email,
        partnerName: content.partner.businessName,
        contentTitle: content.title,
      });
    } catch (err) {
      console.error('[EMAIL] content approval notify failed:', err);
    }
  }

  return updated;
}

export async function reject(id: string, reason: string) {
  const content = await prisma.trainingContent.findUnique({ where: { id } });
  if (!content) throw createError('Training content not found', 404);
  return prisma.trainingContent.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: reason } });
}
