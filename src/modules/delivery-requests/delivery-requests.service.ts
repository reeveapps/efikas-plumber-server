import { DeliveryRequestStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';

export async function listMine(role: Role, profileId: string, cursor: string | undefined, limit: number) {
  let where: Prisma.DeliveryRequestWhereInput;

  if (role === Role.CUSTOMER) {
    where = { customerId: profileId };
  } else if (role === Role.PLUMBER) {
    where = { plumberId: profileId };
  } else if (role === Role.PARTNER) {
    where = { product: { partnerId: profileId } };
  } else {
    // Other roles (SERVICE_MANAGER, ADMIN) have no notion of "my" delivery requests.
    return { items: [], nextCursor: null };
  }

  const rows = await prisma.deliveryRequest.findMany({
    where,
    orderBy: { id: 'asc' },
    include: {
      product: { select: { id: true, name: true, imageUrl: true } },
      customer: { select: { id: true, user: { select: { name: true } } } },
      plumber: { select: { id: true, user: { select: { name: true } } } },
    },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  return paginateResults(rows, limit);
}

export async function getById(id: string, role: Role, profileId: string) {
  const deliveryRequest = await prisma.deliveryRequest.findUnique({
    where: { id },
    include: {
      product: {
        include: {
          partner: { select: { id: true, businessName: true, location: true, user: { select: { phone: true } } } },
        },
      },
      customer: { select: { id: true, user: { select: { name: true } } } },
      plumber: { select: { id: true, user: { select: { name: true } } } },
    },
  });
  if (!deliveryRequest) throw createError('Order not found', 404);

  const isOwner =
    (role === Role.CUSTOMER && deliveryRequest.customerId === profileId) ||
    (role === Role.PLUMBER && deliveryRequest.plumberId === profileId) ||
    (role === Role.PARTNER && deliveryRequest.product.partnerId === profileId);
  if (!isOwner) throw createError('Order not found', 404);

  return deliveryRequest;
}

export async function updateStatus(id: string, partnerId: string, status: DeliveryRequestStatus) {
  const deliveryRequest = await prisma.deliveryRequest.findUnique({
    where: { id },
    include: { product: true },
  });
  if (!deliveryRequest || deliveryRequest.product.partnerId !== partnerId) {
    throw createError('Delivery request not found', 404);
  }

  return prisma.deliveryRequest.update({
    where: { id },
    data: { status },
  });
}
