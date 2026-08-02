import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './reviews.controller.js';
import * as v from './reviews.validation.js';

// Mount path: /plumbers
export const plumberReviewsRouter = Router();
plumberReviewsRouter.get(
  '/:id/reviews',
  validate({ params: v.plumberIdParamSchema, query: v.listQuerySchema }),
  controller.listPlumberReviews
);

// Mount path: /reviews
export const reviewsAdminRouter = Router();
reviewsAdminRouter.patch(
  '/:id/moderate',
  authenticate,
  requireAdmin,
  validate({ params: v.reviewIdParamSchema, body: v.moderateReviewSchema }),
  controller.moderateReview
);
