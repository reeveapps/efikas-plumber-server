// Mount path: /conversations
import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './conversations.controller.js';
import * as v from './conversations.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: v.listQuerySchema }), controller.listMyConversations);

// Only customers can start a CUSTOMER_PLUMBER conversation from a plumber's
// public profile today — plumber-initiated pre-booking chat isn't a UI
// surface yet, so this stays customer-only until that's built.
router.post(
  '/with-plumber/:plumberId',
  requireRole(Role.CUSTOMER),
  validate({ params: v.plumberIdParamSchema }),
  controller.startWithPlumber
);

// Both customer and plumber can start a supplier conversation (product page
// today for customers; plumber-initiated supplier chat is the planned future
// addition this module was built generic enough to already support).
router.post(
  '/with-supplier/:partnerId',
  requireRole(Role.CUSTOMER, Role.PLUMBER),
  validate({ params: v.partnerIdParamSchema, query: v.startWithSupplierQuerySchema }),
  controller.startWithSupplier
);

router.get('/:id/messages', validate({ params: v.conversationIdParamSchema, query: v.listQuerySchema }), controller.listMessages);
router.post(
  '/:id/messages',
  validate({ params: v.conversationIdParamSchema, body: v.messageSchema }),
  controller.createMessage
);
router.post(
  '/:id/messages/read',
  validate({ params: v.conversationIdParamSchema }),
  controller.markMessagesRead
);

export default router;
