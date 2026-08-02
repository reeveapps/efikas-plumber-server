// Mount path: /delivery-requests
// Note: POST /products/:id/delivery-requests (creation) lives in the products module
// per its URL nesting — this module only owns the two routes below.
import { Router } from 'express';
import { authenticate, requirePartner } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './delivery-requests.controller.js';
import * as v from './delivery-requests.validation.js';

const router = Router();

router.use(authenticate);

router.get('/me', validate({ query: v.listQuerySchema }), controller.listMine);
router.get('/:id', validate({ params: v.deliveryRequestIdParamSchema }), controller.getById);
router.patch(
  '/:id/status',
  requirePartner,
  validate({ params: v.deliveryRequestIdParamSchema, body: v.updateStatusSchema }),
  controller.updateStatus
);

export default router;
