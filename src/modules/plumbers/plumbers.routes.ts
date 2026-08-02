// Mount path: /plumbers (mounted by the root router orchestrator)
import { Router } from 'express';
import { authenticate, requirePlumber } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { upload } from '../../utils/upload.js';
import * as controller from './plumbers.controller.js';
import * as v from './plumbers.validation.js';

const router = Router();

// Public discovery route.
router.get('/', validate({ query: v.listPlumbersQuerySchema }), controller.listPlumbers);


router.post(
  '/onboard',
  authenticate,
  requirePlumber,
  upload.fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'certificates', maxCount: 5 },
    { name: 'businessReg', maxCount: 1 },
  ]),
  controller.onboardPlumber
);

router.get('/me', authenticate, requirePlumber, controller.getOwnProfile);
router.patch('/me', authenticate, requirePlumber, validate({ body: v.updateProfileSchema }), controller.updateOwnProfile);
router.patch(
  '/me/availability',
  authenticate,
  requirePlumber,
  validate({ body: v.updateAvailabilitySchema }),
  controller.updateAvailability
);
router.put(
  '/me/location',
  authenticate,
  requirePlumber,
  validate({ body: v.updateLocationSchema }),
  controller.upsertLocation
);

router.get(
  '/me/jobs/feed',
  authenticate,
  requirePlumber,
  validate({ query: v.jobFeedQuerySchema }),
  controller.getJobFeed
);
router.post(
  '/me/jobs/:offerId/accept',
  authenticate,
  requirePlumber,
  validate({ params: v.offerIdParamSchema }),
  controller.acceptJobOffer
);
router.post(
  '/me/jobs/:offerId/decline',
  authenticate,
  requirePlumber,
  validate({ params: v.offerIdParamSchema }),
  controller.declineJobOffer
);

router.get(
  '/me/earnings',
  authenticate,
  requirePlumber,
  validate({ query: v.earningsQuerySchema }),
  controller.getEarnings
);
router.get(
  '/me/bookings',
  authenticate,
  requirePlumber,
  validate({ query: v.myBookingsQuerySchema }),
  controller.listMyBookings
);

router.get('/me/performance', authenticate, requirePlumber, controller.getPerformance);
router.get('/me/subscription-status', authenticate, requirePlumber, controller.getSubscriptionStatus);

// Team roster — COMPANY-type plumber accounts only (enforced in the service).
router.get('/me/roster', authenticate, requirePlumber, controller.listTeamMembers);
router.post(
  '/me/roster',
  authenticate,
  requirePlumber,
  validate({ body: v.addTeamMemberSchema }),
  controller.addTeamMember
);
router.post(
  '/me/roster/bulk',
  authenticate,
  requirePlumber,
  upload.single('file'),
  controller.bulkAddTeamMembers
);
router.get('/:id', validate({ params: v.plumberIdParamSchema }), controller.getPlumberById);

export default router;
