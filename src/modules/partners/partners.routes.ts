// Mount path: /partners
import { Router } from 'express';
import { authenticate, requirePartner } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { upload } from '../../utils/upload.js';
import * as controller from './partners.controller.js';
import * as v from './partners.validation.js';

const router = Router();

router.use(authenticate);

router.post(
  '/me',
  requirePartner,
  upload.single('logo'),
  validate({ body: v.updateMeSchema }),
  controller.updateMe
);
router.get('/me', requirePartner, controller.getMe);
router.get('/me/ads', requirePartner, validate({ query: v.listQuerySchema }), controller.listMyAds);
router.get('/me/dashboard-summary', requirePartner, controller.getDashboardSummary);
router.get(
  '/me/dashboard-analytics-daily',
  requirePartner,
  validate({ query: v.dashboardAnalyticsDailyQuerySchema }),
  controller.getDashboardAnalyticsDaily
);
router.get('/me/billing-history', requirePartner, validate({ query: v.listQuerySchema }), controller.getBillingHistory);
router.get(
  '/me/training-content',
  requirePartner,
  validate({ query: v.listQuerySchema }),
  controller.listMyTrainingContent
);

export default router;
