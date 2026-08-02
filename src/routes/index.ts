import { Router } from 'express';

import authRoutes from '../modules/auth/auth.routes.js';
import usersRoutes from '../modules/users/users.routes.js';
import customersRoutes from '../modules/customers/customers.routes.js';
import plumbersRoutes from '../modules/plumbers/plumbers.routes.js';
import companiesRoutes from '../modules/companies/companies.routes.js';
import bookingsRoutes from '../modules/bookings/bookings.routes.js';
import { plumberReviewsRouter, reviewsAdminRouter } from '../modules/reviews/reviews.routes.js';
import disputesRoutes from '../modules/disputes/disputes.routes.js';
import partnersRoutes from '../modules/partners/partners.routes.js';
import productsRoutes from '../modules/products/products.routes.js';
import adsRoutes from '../modules/ads/ads.routes.js';
import deliveryRequestsRoutes from '../modules/delivery-requests/delivery-requests.routes.js';
import paymentsRoutes from '../modules/payments/payments.routes.js';
import { subscriptionPlansRouter } from '../modules/subscriptions/subscriptions.routes.js';
import notificationsRoutes, { adminNotificationsRouter } from '../modules/notifications/notifications.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import conversationsRoutes from '../modules/conversations/conversations.routes.js';
import { trainingContentRouter, trainingContentAdminRouter } from '../modules/training-content/training-content.routes.js';
import contentRoutes from '../modules/content/content.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/customers', customersRoutes);

// Two routers share the /plumbers prefix: the plumbers module itself, and the
// nested public `GET /plumbers/:id/reviews` route from the reviews module.
router.use('/plumbers', plumbersRoutes);
router.use('/plumbers', plumberReviewsRouter);

router.use('/companies', companiesRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/reviews', reviewsAdminRouter);
router.use('/disputes', disputesRoutes);
router.use('/partners', partnersRoutes);
router.use('/products', productsRoutes);
router.use('/ads', adsRoutes);
router.use('/delivery-requests', deliveryRequestsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/subscription-plans', subscriptionPlansRouter);
router.use('/notifications', notificationsRoutes);
router.use('/admin/notifications', adminNotificationsRouter);
router.use('/admin/training-content', trainingContentAdminRouter);
router.use('/admin/content', contentRoutes);
router.use('/admin', adminRoutes);
router.use('/conversations', conversationsRoutes);
router.use('/training', trainingContentRouter);

export default router;
