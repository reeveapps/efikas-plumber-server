// Mount path: /companies
import { Router } from 'express';
import { authenticate, requireServiceManager } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './companies.controller.js';
import * as v from './companies.validation.js';

const router = Router();

router.use(authenticate, requireServiceManager);

router.post('/', validate({ body: v.createCompanySchema }), controller.createCompany);
router.get('/me', controller.getMyCompany);
router.patch('/me', validate({ body: v.updateCompanySchema }), controller.updateMyCompany);

router.post('/me/plumbers', validate({ body: v.addPlumberSchema }), controller.addPlumber);
router.get('/me/plumbers', validate({ query: v.paginationQuerySchema }), controller.listMyPlumbers);
router.delete(
  '/me/plumbers/:plumberId',
  validate({ params: v.plumberIdParamSchema }),
  controller.removePlumber
);
router.get('/me/plumbers/map', controller.getMyPlumbersMap);

router.post(
  '/me/jobs/:bookingId/assign',
  validate({ params: v.assignBookingParamSchema, body: v.assignBookingSchema }),
  controller.assignBooking
);

router.get('/me/reports', validate({ query: v.reportsQuerySchema }), controller.getMyReports);
router.get(
  '/me/reports/export',
  validate({ query: v.reportsExportQuerySchema }),
  controller.exportMyReports
);

router.get('/me/subscription', validate({ query: v.paginationQuerySchema }), controller.getMySubscription);
router.post('/me/subscription', validate({ body: v.subscribeSchema }), controller.subscribe);
router.post('/me/subscription/cancel', controller.cancelSubscription);

export default router;
