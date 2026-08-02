// Mount path: /products
import { Router } from 'express';
import { authenticate, requirePartner, requireRole } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { upload } from '../../utils/upload.js';
import { Role } from '@prisma/client';
import * as controller from './products.controller.js';
import * as v from './products.validation.js';

const router = Router();

// Public search/browse — registered before the authenticated literal routes
// below so they aren't shadowed, and before the public `/:id` route (last) so
// neither is ever swallowed as an :id.
router.get('/search', validate({ query: v.searchProductsQuerySchema }), controller.searchProducts);
router.get('/', validate({ query: v.browseProductsQuerySchema }), controller.browseProducts);

router.post('/', authenticate, requirePartner, upload.array('images', 4), controller.createProduct);
router.get('/me', authenticate, requirePartner, validate({ query: v.listQuerySchema }), controller.listMyProducts);
router.get(
  '/me/:id',
  authenticate,
  requirePartner,
  validate({ params: v.productIdParamSchema }),
  controller.getMyProduct
);

router.patch(
  '/:id',
  authenticate,
  requirePartner,
  upload.array('images', 4),
  validate({ params: v.productIdParamSchema }),
  controller.updateProduct
);
router.delete(
  '/:id',
  authenticate,
  requirePartner,
  validate({ params: v.productIdParamSchema }),
  controller.deleteProduct
);

router.post(
  '/:id/ads',
  authenticate,
  requirePartner,
  validate({ params: v.productIdParamSchema, body: v.createAdSchema }),
  controller.createAd
);
router.get(
  '/:id/ads/:adId/analytics',
  authenticate,
  requirePartner,
  validate({ params: v.productAdIdParamSchema }),
  controller.getAdAnalytics
);
router.get(
  '/:id/ads/:adId/analytics/daily',
  authenticate,
  requirePartner,
  validate({ params: v.productAdIdParamSchema, query: v.adAnalyticsDailyQuerySchema }),
  controller.getAdAnalyticsDaily
);

// Nested here per spec rather than in the delivery-requests module, since it hangs
// off /products/:id rather than /delivery-requests.
router.post(
  '/:id/delivery-requests',
  authenticate,
  requireRole(Role.CUSTOMER, Role.PLUMBER),
  validate({ params: v.productIdParamSchema, body: v.createDeliveryRequestSchema }),
  controller.createDeliveryRequest
);

router.get('/:id/related', validate({ params: v.productIdParamSchema }), controller.getRelatedProducts);

// Public product-detail route — registered last so it doesn't shadow the
// literal routes above (`/search`, `/me`, ...), matching the same pattern
// plumbers.routes.ts uses for its public `/:id`.
router.get('/:id', validate({ params: v.productIdParamSchema }), controller.getPublicProduct);

export default router;
