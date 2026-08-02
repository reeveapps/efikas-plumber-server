import { prisma } from '../../db/index.js';

// Public endpoint: list active subscription plans (Basic/Pro/Company).
// Small, bounded result set — no pagination needed.
export async function listActivePlans() {
  return prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { priceKes: 'asc' },
  });
}
