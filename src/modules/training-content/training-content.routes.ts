// Two routers from one module, mirroring reviews.routes.ts's pattern:
// `trainingContentRouter` mounts at /training (public feed + partner submit),
// `trainingContentAdminRouter` mounts at /admin/training-content (moderation queue).
import { Router } from 'express';
import { authenticate, requirePartner, requireAdmin, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { upload } from '../../utils/upload.js';
import * as controller from './training-content.controller.js';
import * as v from './training-content.validation.js';

const uploadFields = upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'guidePdf', maxCount: 1 },
]);

export const trainingContentRouter = Router();

// Public/plumber-facing feed — APPROVED content only (enforced in the service).
trainingContentRouter.get(
  '/content',
  optionalAuthenticate,
  validate({ query: v.publicListQuerySchema }),
  controller.listPublicContent
);
trainingContentRouter.post(
  '/content/:id/view',
  optionalAuthenticate,
  validate({ params: v.contentIdParamSchema }),
  controller.recordView
);

trainingContentRouter.post(
  '/content',
  authenticate,
  requirePartner,
  uploadFields,
  controller.submitContent
);
trainingContentRouter.patch(
  '/content/:id',
  authenticate,
  requirePartner,
  uploadFields,
  validate({ params: v.contentIdParamSchema }),
  controller.updateAndResubmit
);

export const trainingContentAdminRouter = Router();
trainingContentAdminRouter.use(authenticate, requireAdmin);
trainingContentAdminRouter.get(
  '/pending',
  validate({ query: v.listQuerySchema }),
  controller.listPendingAdmin
);
trainingContentAdminRouter.patch(
  '/:id/approve',
  validate({ params: v.contentIdParamSchema }),
  controller.approve
);
trainingContentAdminRouter.patch(
  '/:id/reject',
  validate({ params: v.contentIdParamSchema, body: v.rejectContentSchema }),
  controller.reject
);
