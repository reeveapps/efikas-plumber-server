import { ConcernStatus } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';
import { AuthUser } from '../../types/index.js';

export async function listMyDisputes(requester: AuthUser, cursor: string | undefined, limit: number) {
  const where = requester.role === 'CUSTOMER' ? { reporterId: requester.profileId } : { plumberId: requester.profileId };

  const page = cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } };
  const rows = await prisma.dispute.findMany({
    where,
    ...page,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      booking: { select: { id: true, category: true, address: true, status: true } },
    },
  });

  return paginateResults(rows, limit);
}

export async function getDispute(id: string, requester: AuthUser) {
  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      booking: true,
      reporter: { select: { id: true, user: { select: { name: true, phone: true } } } },
      plumber: { select: { id: true, user: { select: { name: true, phone: true } } } },
    },
  });
  if (!dispute) throw createError('Dispute not found', 404);

  const isReporter = requester.role === 'CUSTOMER' && dispute.reporterId === requester.profileId;
  const isPlumber = requester.role === 'PLUMBER' && dispute.plumberId === requester.profileId;
  if (!isReporter && !isPlumber && requester.role !== 'ADMIN') {
    throw createError('Dispute not found', 404);
  }

  return dispute;
}

export async function listDisputes(status: ConcernStatus | undefined, cursor: string | undefined, limit: number) {
  const page = cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } };
  const rows = await prisma.dispute.findMany({
    where: status ? { status } : {},
    ...page,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      booking: { select: { id: true, category: true, address: true, status: true } },
      reporter: { select: { id: true, user: { select: { name: true, phone: true } } } },
      plumber: { select: { id: true, user: { select: { name: true, phone: true } } } },
    },
  });

  return paginateResults(rows, limit);
}

export async function updateStatus(id: string, status: ConcernStatus) {
  const existing = await prisma.dispute.findUnique({ where: { id } });
  if (!existing) throw createError('Dispute not found', 404);
  return prisma.dispute.update({ where: { id }, data: { status } });
}

export async function resolveDispute(
  id: string,
  adminUserId: string,
  data: { resolutionNote: string; outcome: 'RESOLVED_CUSTOMER' | 'RESOLVED_OTHER_PARTY' | 'DISMISSED' }
) {
  const existing = await prisma.dispute.findUnique({ where: { id } });
  if (!existing) throw createError('Dispute not found', 404);

  return prisma.dispute.update({
    where: { id },
    data: {
      status: data.outcome,
      resolutionNote: data.resolutionNote,
      resolvedAt: new Date(),
      resolvedById: adminUserId,
    },
  });
}
