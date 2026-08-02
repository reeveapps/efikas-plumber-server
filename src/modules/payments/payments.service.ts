import { PaymentType, PaymentProvider, PaymentStatus, SubscriptionStatus, Role } from '@prisma/client';
import { prisma } from '../../db/index.js';
import { createError } from '../../middleware/error.middleware.js';
import { cursorArgs, paginateResults } from '../../utils/pagination.js';
import { stkPush, checkTransactionStatus, parseStkCallback } from '../../utils/daraja-payments/index.js';
import { env } from '../../config/env.js';

interface StkPushBody {
  type: 'SUBSCRIPTION' | 'AD_CAMPAIGN';
  subscriptionId?: string;
  adId?: string;
  amountKes: number;
  phone: string;
}

export async function initiateStkPush(
  userId: string,
  role: Role,
  profileId: string,
  body: StkPushBody,
  idempotencyKey: string | undefined
) {
  
  void idempotencyKey;

  if (body.type === 'SUBSCRIPTION') {
    const subscription = await prisma.subscription.findUnique({
      where: { id: body.subscriptionId! },
      include: { company: true },
    });
    if (!subscription) throw createError('Subscription not found', 404);
    if (subscription.company && subscription.company.ownerId !== profileId) {
      throw createError('You do not own this subscription', 403);
    }
  }

  let adId: string | null = null;
  let amountKes = body.amountKes;
  if (body.type === 'AD_CAMPAIGN') {
    if (role !== Role.PARTNER) throw createError('Only partners can pay for ad campaigns', 403);
    const ad = await prisma.ad.findUnique({
      where: { id: body.adId! },
      include: { product: { select: { partnerId: true } } },
    });
    if (!ad || ad.product.partnerId !== profileId) throw createError('Campaign not found', 404);
    if (!ad.isApproved) throw createError('Campaign has not been approved yet', 409);
    if (ad.isActive) throw createError('Campaign is already active', 409);
    if (ad.billingAmountKes == null) throw createError('Campaign has no billing amount set', 500);
    adId = ad.id;
    amountKes = ad.billingAmountKes;
  }

  const payment = await prisma.payment.create({
    data: {
      userId,
      type: body.type as PaymentType,
      provider: PaymentProvider.MPESA,
      amountKes,
      status: PaymentStatus.PENDING,
      subscriptionId: body.type === 'SUBSCRIPTION' ? body.subscriptionId : undefined,
    },
  });

  // Linked from the Ad side (Ad.paymentId), not the Payment side — lets
  // `applyStkResult` find and activate the right campaign on success without
  // needing a new column on Payment itself.
  if (adId) {
    await prisma.ad.update({ where: { id: adId }, data: { paymentId: payment.id } });
  }

  try {
    const result = await stkPush({
      phone: body.phone,
      amount: amountKes,
      accountRef: payment.id,
      description: body.type === 'SUBSCRIPTION' ? 'Subscription' : 'Ad campaign',
      callbackUrl: `${process.env.DARAJA_CALLBACK_URL ?? ''}/api/v1/payments/mpesa/callback/${env.MPESA_CALLBACK_SECRET}`,
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { mpesaCheckoutRequestId: result.CheckoutRequestID },
    });

    return { id: updated.id, checkoutRequestId: result.CheckoutRequestID };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'STK push failed';
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED, failureReason: message },
    });
    throw createError(`Failed to initiate M-Pesa payment: ${message}`, 502);
  }
}


async function applyStkResult(
  paymentId: string,
  result: {
    success: boolean;
    resultDesc: string;
    receiptNumber?: string;
  },
  rawCallbackPayload?: unknown
) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return null;

  if (payment.status !== PaymentStatus.PENDING) {
    // Already resolved — most likely by queryMpesaStatus's active-poll path,
    // which can confirm SUCCESS (ResultCode 0) but, unlike this callback,
    // has no CallbackMetadata to pull a receipt number from. If that's what
    // happened, backfill just the receipt/raw-payload fields the poll
    // couldn't have set, rather than silently dropping this callback's data.
    if (
      result.success &&
      payment.status === PaymentStatus.SUCCESS &&
      !payment.mpesaReceiptNumber &&
      result.receiptNumber
    ) {
      return prisma.payment.update({
        where: { id: paymentId },
        data: { mpesaReceiptNumber: result.receiptNumber, rawCallbackPayload: rawCallbackPayload as never },
      });
    }
    return payment; // already resolved, avoid double-processing
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: result.success
      ? {
          status: PaymentStatus.SUCCESS,
          mpesaReceiptNumber: result.receiptNumber,
          rawCallbackPayload: rawCallbackPayload as never,
        }
      : {
          status: PaymentStatus.FAILED,
          failureReason: result.resultDesc,
          rawCallbackPayload: rawCallbackPayload as never,
        },
  });

  if (!result.success && payment.type === PaymentType.SUBSCRIPTION && payment.subscriptionId) {
    await prisma.subscription.update({
      where: { id: payment.subscriptionId },
      data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
    });
  }


  if (result.success && payment.type === PaymentType.AD_CAMPAIGN) {
    await prisma.ad.updateMany({ where: { paymentId: payment.id }, data: { isActive: true } });
  }

  return updated;
}

export async function handleMpesaCallback(secret: string, body: unknown): Promise<boolean> {
  if (secret !== env.MPESA_CALLBACK_SECRET) {
    return false;
  }

  const parsed = parseStkCallback(
    body as Parameters<typeof parseStkCallback>[0]
  );

  const payment = await prisma.payment.findUnique({
    where: { mpesaCheckoutRequestId: parsed.checkoutRequestId },
  });

  if (!payment) {
    console.warn(`[payments] M-Pesa callback for unknown CheckoutRequestID: ${parsed.checkoutRequestId}`);
    return true;
  }

  await applyStkResult(
    payment.id,
    { success: parsed.success, resultDesc: parsed.resultDesc, receiptNumber: parsed.receiptNumber },
    body
  );

  return true;
}

export async function getPaymentStatus(userId: string, paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.userId !== userId) throw createError('Payment not found', 404);
  return payment;
}

export async function listMyPayments(userId: string, cursor: string | undefined, limit: number) {
  const rows = await prisma.payment.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    ...(cursorArgs(cursor, limit) as { take: number; skip?: number; cursor?: { id: string } }),
  });
  return paginateResults(rows, limit);
}

export async function queryMpesaStatus(userId: string, paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.userId !== userId) throw createError('Payment not found', 404);
  if (payment.status !== PaymentStatus.PENDING) return payment; // already resolved, most likely by the M-Pesa callback
  if (!payment.mpesaCheckoutRequestId) {
    throw createError('Payment has no associated M-Pesa checkout request', 400);
  }

  const result = await checkTransactionStatus(payment.mpesaCheckoutRequestId);
  if (result.ResultCode === '0') {
    return applyStkResult(payment.id, { success: true, resultDesc: result.ResultDesc });
  }

  // A non-zero ResultCode here is ambiguous, not necessarily a real failure:
  // Daraja returns this same shape (e.g. ResultDesc "The transaction is
  // still under processing") while the STK prompt is still awaiting the
  // user's PIN, which is routinely still true seconds after push-out — this
  // is not distinguishable from a genuine decline/cancel/timeout by
  // ResultCode alone. Resolving to FAILED here would be a one-way door:
  // applyStkResult's idempotency guard means the real M-Pesa callback (which
  // *does* reliably report the definitive final result) would later no-op
  // against an already-FAILED payment, permanently leaving a genuinely-paid
  // campaign stuck inactive. So this path only ever resolves SUCCESS itself;
  // FAILURE is left entirely to handleMpesaCallback, and this just reports
  // the still-PENDING status back for the frontend to keep polling.
  return payment;
}
