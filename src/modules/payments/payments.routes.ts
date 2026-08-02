import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './payments.controller.js';
import * as v from './payments.validation.js';

const router = Router();

// Public — Daraja server calls this, no auth. Secret is verified in the controller/service.
router.post(
  '/mpesa/callback/:secret',
  validate({ params: v.callbackSecretParamSchema }),
  controller.mpesaCallback
);

router.use(authenticate);

router.post(
  '/mpesa/stk-push',
  requireRole(Role.SERVICE_MANAGER, Role.PARTNER),
  validate({ body: v.stkPushSchema }),
  controller.stkPushController
);

router.post('/mpesa/query', validate({ body: v.mpesaQuerySchema }), controller.mpesaQuery);

router.get('/me', validate({ query: v.listMyPaymentsQuerySchema }), controller.listMyPayments);

router.get('/:id/status', validate({ params: v.paymentIdParamSchema }), controller.getPaymentStatus);

export default router;
