import { Router } from 'express';
import { authenticate, requireAdmin, requirePermission } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './notifications.controller.js';
import * as v from './notifications.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: v.listQuerySchema }), controller.list);
router.post('/:id/read', validate({ params: v.idParamSchema }), controller.markRead);
router.post('/read-all', controller.markAllRead);

export default router;

// mount at /admin/notifications
const adminRouter = Router();

adminRouter.use(authenticate, requireAdmin);

adminRouter.post(
  '/broadcast',
  requirePermission('SEND_COMMUNICATIONS'),
  validate({ body: v.broadcastSchema }),
  controller.broadcast
);
adminRouter.get(
  '/broadcast-history',
  requirePermission('SEND_COMMUNICATIONS'),
  validate({ query: v.broadcastHistoryQuerySchema }),
  controller.getBroadcastHistory
);

export const adminNotificationsRouter = adminRouter;
