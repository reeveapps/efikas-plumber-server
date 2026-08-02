// Mount path: /ads
import { Router } from 'express';
import { authenticate, optionalAuthenticate, requireAdmin } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './ads.controller.js';
import * as v from './ads.validation.js';

const router = Router();

router.get('/feed', optionalAuthenticate, validate({ query: v.feedQuerySchema }), controller.getFeed);

// Random small carousel (Home tab / plumber Jobs discover tab) — skill-biased
// for a PLUMBER caller, hence optionalAuthenticate rather than public.
router.get(
  '/spotlight',
  optionalAuthenticate,
  validate({ query: v.spotlightQuerySchema }),
  controller.getSpotlightAds
);

// Public — lets the partner portal's campaign form (and any future public
// pricing page) show current per-interval rates without needing admin auth.
router.get('/pricing', controller.listPricing);
router.patch(
  '/pricing/:interval',
  authenticate,
  requireAdmin,
  validate({ params: v.pricingIntervalParamSchema, body: v.setPricingSchema }),
  controller.setPricing
);

router.post('/:id/impression', authenticate, validate({ params: v.adIdParamSchema }), controller.recordImpression);
router.post('/:id/click', authenticate, validate({ params: v.adIdParamSchema }), controller.recordClick);

router.get('/pending', authenticate, requireAdmin, validate({ query: v.listQuerySchema }), controller.listPending);
router.patch(
  '/:id/approve',
  authenticate,
  requireAdmin,
  validate({ params: v.adIdParamSchema, body: v.approveSchema }),
  controller.approve
);

export default router;
