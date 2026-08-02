import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';

// --- FAQs ---

export async function listFaqs() {
  return prisma.faqEntry.findMany({ orderBy: { order: 'asc' } });
}

export async function createFaq(data: { question: string; answer: string }) {
  const max = await prisma.faqEntry.aggregate({ _max: { order: true } });
  return prisma.faqEntry.create({
    data: { ...data, order: (max._max.order ?? -1) + 1 },
  });
}

export async function updateFaq(id: string, data: { question?: string; answer?: string; isActive?: boolean }) {
  const existing = await prisma.faqEntry.findUnique({ where: { id } });
  if (!existing) throw createError('FAQ entry not found', 404);
  return prisma.faqEntry.update({ where: { id }, data });
}

export async function deleteFaq(id: string): Promise<void> {
  const existing = await prisma.faqEntry.findUnique({ where: { id } });
  if (!existing) throw createError('FAQ entry not found', 404);
  await prisma.faqEntry.delete({ where: { id } });
}

// `order` is a list of FAQ ids in their new display order — assigns 0..n-1
// by array position rather than taking client-supplied order numbers directly.
export async function reorderFaqs(orderedIds: string[]) {
  const existing = await prisma.faqEntry.findMany({ where: { id: { in: orderedIds } }, select: { id: true } });
  if (existing.length !== orderedIds.length) throw createError('One or more FAQ ids were not found', 400);

  await prisma.$transaction(orderedIds.map((id, index) => prisma.faqEntry.update({ where: { id }, data: { order: index } })));
  return listFaqs();
}

// --- App copy ---

export async function listAppCopy() {
  return prisma.appCopyEntry.findMany({ orderBy: { key: 'asc' } });
}

export async function setAppCopy(key: string, value: string) {
  return prisma.appCopyEntry.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
