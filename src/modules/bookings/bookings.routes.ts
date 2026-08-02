// Mount path: /bookings
import { Router } from 'express';
import { authenticate, requireCustomer, requirePlumber } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { upload } from '../../utils/upload.js';
import * as controller from './bookings.controller.js';
import * as v from './bookings.validation.js';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  requireCustomer,
  upload.fields([
    { name: 'photos', maxCount: 6 },
    { name: 'voiceNote', maxCount: 1 },
  ]) as unknown as import('express').RequestHandler,
  validate({ body: v.createBookingSchema }),
  controller.createBooking
);

router.get('/:id', validate({ params: v.idParamSchema }), controller.getBookingDetail);
router.get('/:id/matches', requireCustomer, validate({ params: v.idParamSchema }), controller.getMatches);
router.post(
  '/:id/select-plumber',
  requireCustomer,
  validate({ params: v.idParamSchema, body: v.selectPlumberSchema }),
  controller.selectPlumber
);
router.post(
  '/:id/cancel',
  validate({ params: v.idParamSchema, body: v.cancelBookingSchema }),
  controller.cancelBooking
);
router.patch(
  '/:id/status',
  requirePlumber,
  validate({ params: v.idParamSchema, body: v.updateStatusSchema }),
  controller.updateStatus
);
router.post(
  '/:id/agreement/plumber-confirm',
  requirePlumber,
  validate({ params: v.idParamSchema }),
  controller.plumberConfirmAgreement
);
router.post(
  '/:id/agreement/customer-confirm',
  requireCustomer,
  validate({ params: v.idParamSchema }),
  controller.customerConfirmAgreement
);
router.post('/:id/complete', requirePlumber, validate({ params: v.idParamSchema }), controller.completeBooking);
router.get('/:id/timeline', validate({ params: v.idParamSchema }), controller.getTimeline);

router.post(
  '/:id/payment-record',
  requirePlumber,
  validate({ params: v.idParamSchema, body: v.paymentRecordSchema }),
  controller.createPaymentRecord
);
router.post(
  '/:id/payment-record/confirm',
  requireCustomer,
  validate({ params: v.idParamSchema }),
  controller.confirmPaymentRecord
);
router.post(
  '/:id/payment-record/dispute',
  requireCustomer,
  validate({ params: v.idParamSchema }),
  controller.disputePaymentRecord
);
router.post(
  '/:bookingId/review',
  requireCustomer,
  validate({ params: v.bookingIdParamSchema, body: v.reviewSchema }),
  controller.createReview
);
router.post(
  '/:bookingId/dispute',
  requireCustomer,
  validate({ params: v.bookingIdParamSchema, body: v.disputeSchema }),
  controller.createDispute
);

router.get(
  '/:bookingId/messages',
  validate({ params: v.bookingIdParamSchema, query: v.listQuerySchema }),
  controller.listMessages
);
router.post(
  '/:bookingId/messages',
  validate({ params: v.bookingIdParamSchema, body: v.messageSchema }),
  controller.createMessage
);
router.post(
  '/:bookingId/messages/read',
  validate({ params: v.bookingIdParamSchema }),
  controller.markMessagesRead
);
router.post(
  '/:bookingId/call/reveal-number',
  validate({ params: v.bookingIdParamSchema }),
  controller.revealNumber
);

export default router;
