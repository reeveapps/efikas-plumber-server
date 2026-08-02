// Mount path: /disputes
import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, requireRole, requireAdmin } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './disputes.controller.js';
import * as v from './disputes.validation.js';

const router = Router();

router.use(authenticate);

router.get(
  '/me',
  requireRole(Role.CUSTOMER, Role.PLUMBER),
  validate({ query: v.listQuerySchema }),
  controller.listMyDisputes
);

router.get('/', requireAdmin, validate({ query: v.adminListQuerySchema }), controller.listDisputes);

router.get('/:id', validate({ params: v.idParamSchema }), controller.getDispute);

router.patch(
  '/:id/status',
  requireAdmin,
  validate({ params: v.idParamSchema, body: v.updateStatusSchema }),
  controller.updateStatus
);

router.post(
  '/:id/resolve',
  requireAdmin,
  validate({ params: v.idParamSchema, body: v.resolveDisputeSchema }),
  controller.resolveDispute
);

export default router;
