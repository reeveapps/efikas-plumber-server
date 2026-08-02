// Mount path: /customers (mounted by the root router orchestrator)
import { Router } from 'express';
import { authenticate, requireCustomer } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './customers.controller.js';
import * as v from './customers.validation.js';

const router = Router();

router.use(authenticate, requireCustomer);

router.get('/me/locations', controller.listLocations);
router.post('/me/locations', validate({ body: v.createLocationSchema }), controller.createLocation);
router.patch(
  '/me/locations/:id',
  validate({ params: v.locationIdParamSchema, body: v.updateLocationSchema }),
  controller.updateLocation
);
router.delete('/me/locations/:id', validate({ params: v.locationIdParamSchema }), controller.deleteLocation);

router.get('/me/bookings', validate({ query: v.listBookingsQuerySchema }), controller.listBookings);
router.get('/me/bookings/:id', validate({ params: v.bookingIdParamSchema }), controller.getBookingDetail);

export default router;
