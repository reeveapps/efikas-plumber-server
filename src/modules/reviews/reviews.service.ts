import { prisma } from '../../db/index.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';

export async function listPlumberReviews(plumberId: string, cursor: string | undefined, limit: number) {
  const page = cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } };
  const rows = await prisma.review.findMany({
    where: { plumberId, isVisible: true },
    ...page,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      reviewer: { select: { user: { select: { name: true } } } },
    },
  });
  return paginateResults(rows, limit);
}

export async function moderateReview(id: string, data: { isVisible?: boolean; isModerated?: boolean }) {
  return prisma.review.update({ where: { id }, data });
}
