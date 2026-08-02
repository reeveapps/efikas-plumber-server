import { Router } from 'express';
import { authenticate, requireAdmin, requirePermission } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as controller from './admin.controller.js';
import * as v from './admin.validation.js';

const router = Router();

// Public — invite token validation/acceptance happens before the invitee has
// any account at all, so these two can't sit behind `authenticate`.
router.get('/invite/:token', validate({ params: v.inviteTokenParamSchema }), controller.validateInvite);
router.post(
  '/invite/:token/accept',
  validate({ params: v.inviteTokenParamSchema, body: v.acceptInviteSchema }),
  controller.acceptInvite
);

// Public but self-gating — see createSuperAdmin's doc comment in admin.service.ts.
router.post('/setup-super-admin', validate({ body: v.createSuperAdminSchema }), controller.createSuperAdmin);

router.use(authenticate, requireAdmin);

router.get('/me', controller.getMe);

router.get('/users', requirePermission('VIEW_USERS'), validate({ query: v.listUsersQuerySchema }), controller.listUsers);
router.patch(
  '/users/:id/ban',
  requirePermission('BAN_USERS'),
  validate({ params: v.idParamSchema, body: v.banUserSchema }),
  controller.banUser
);

router.get(
  '/customers',
  requirePermission('VIEW_USERS'),
  validate({ query: v.searchListQuerySchema }),
  controller.listCustomers
);
router.get(
  '/customers/:id',
  requirePermission('VIEW_USERS'),
  validate({ params: v.idParamSchema }),
  controller.getCustomerDetail
);
router.patch(
  '/customers/:id',
  requirePermission('EDIT_USERS'),
  validate({ params: v.idParamSchema, body: v.updateCustomerSchema }),
  controller.updateCustomer
);

router.get(
  '/plumbers',
  requirePermission('VIEW_USERS'),
  validate({ query: v.listPlumbersQuerySchema }),
  controller.listPlumbersAdmin
);
router.get(
  '/plumbers/:id',
  requirePermission('VIEW_USERS'),
  validate({ params: v.idParamSchema }),
  controller.getPlumberDetail
);
router.patch(
  '/plumbers/:id',
  requirePermission('EDIT_USERS'),
  validate({ params: v.idParamSchema, body: v.updatePlumberSchema }),
  controller.updatePlumber
);

router.get(
  '/partners',
  requirePermission('VIEW_USERS'),
  validate({ query: v.searchListQuerySchema }),
  controller.listPartnersAdmin
);
router.get(
  '/partners/:id',
  requirePermission('VIEW_USERS'),
  validate({ params: v.idParamSchema }),
  controller.getPartnerDetail
);
router.patch(
  '/partners/:id',
  requirePermission('EDIT_USERS'),
  validate({ params: v.idParamSchema, body: v.updatePartnerSchema }),
  controller.updatePartner
);

router.get(
  '/kyc/pending',
  requirePermission('APPROVE_PLUMBER_KYC'),
  validate({ query: v.listQuerySchema }),
  controller.listPendingKyc
);
router.patch(
  '/kyc/:plumberId/approve',
  requirePermission('APPROVE_PLUMBER_KYC'),
  validate({ params: v.plumberIdParamSchema }),
  controller.approveKyc
);
router.patch(
  '/kyc/:plumberId/reject',
  requirePermission('APPROVE_PLUMBER_KYC'),
  validate({ params: v.plumberIdParamSchema, body: v.rejectKycSchema }),
  controller.rejectKyc
);

router.get(
  '/kyc/partners/pending',
  requirePermission('APPROVE_PARTNER_KYC'),
  validate({ query: v.listQuerySchema }),
  controller.listPendingPartnerKyc
);
router.patch(
  '/kyc/partners/:partnerId/approve',
  requirePermission('APPROVE_PARTNER_KYC'),
  validate({ params: v.partnerIdParamSchema }),
  controller.approvePartnerKyc
);
router.patch(
  '/kyc/partners/:partnerId/reject',
  requirePermission('APPROVE_PARTNER_KYC'),
  validate({ params: v.partnerIdParamSchema, body: v.rejectKycSchema }),
  controller.rejectPartnerKyc
);

router.get(
  '/products/pending',
  requirePermission('MODERATE_PRODUCTS'),
  validate({ query: v.listQuerySchema }),
  controller.listPendingProducts
);
router.patch(
  '/products/:productId/approve',
  requirePermission('MODERATE_PRODUCTS'),
  validate({ params: v.productIdParamSchema }),
  controller.approveProduct
);
router.patch(
  '/products/:productId/reject',
  requirePermission('MODERATE_PRODUCTS'),
  validate({ params: v.productIdParamSchema, body: v.rejectKycSchema }),
  controller.rejectProduct
);

router.get('/subscriptions', requirePermission('MANAGE_BILLING_PRICING', 'VIEW_BILLING'), validate({ query: v.listQuerySchema }), controller.listSubscriptions);
router.get(
  '/billing/history',
  requirePermission('VIEW_BILLING', 'MANAGE_BILLING_PRICING'),
  validate({ query: v.billingHistoryQuerySchema }),
  controller.getBillingHistory
);

router.get('/analytics/overview', requirePermission('VIEW_ANALYTICS'), controller.getAnalyticsOverview);
router.get(
  '/analytics/trends',
  requirePermission('VIEW_ANALYTICS'),
  validate({ query: v.analyticsTrendsQuerySchema }),
  controller.getAnalyticsTrends
);
router.get(
  '/analytics/revenue-breakdown',
  requirePermission('VIEW_ANALYTICS'),
  validate({ query: v.analyticsTrendsQuerySchema }),
  controller.getRevenueBreakdown
);
router.get(
  '/analytics/plumber-performance',
  requirePermission('VIEW_ANALYTICS'),
  controller.getPlumberPerformance
);

router.get('/dashboard-summary', controller.getDashboardSummary);

router.get('/audit-logs', validate({ query: v.listAuditLogsQuerySchema }), controller.listAuditLogs);
router.get('/audit-logs/actors', controller.listAuditLogActors);

// --- Admin management (MANAGE_ADMINS / super admin only in practice) ---
router.get('/admins', requirePermission('MANAGE_ADMINS'), validate({ query: v.listQuerySchema }), controller.listAdmins);
router.post(
  '/admins/invite',
  requirePermission('MANAGE_ADMINS'),
  validate({ body: v.inviteAdminSchema }),
  controller.inviteAdmin
);
router.post(
  '/admins/create-super',
  validate({ body: v.createSuperAdminSchema }),
  controller.createSuperAdmin
);
router.patch(
  '/admins/:id/permissions',
  requirePermission('MANAGE_ADMINS'),
  validate({ params: v.adminIdParamSchema, body: v.updatePermissionsSchema }),
  controller.updateAdminPermissions
);
router.patch(
  '/admins/:id/active',
  requirePermission('MANAGE_ADMINS'),
  validate({ params: v.adminIdParamSchema, body: v.setActiveSchema }),
  controller.setAdminActive
);
router.patch(
  '/admins/invites/:inviteId/revoke',
  requirePermission('MANAGE_ADMINS'),
  validate({ params: v.inviteIdParamSchema }),
  controller.revokeAdminInvite
);

router.get(
  '/concerns',
  requirePermission('RESOLVE_CONCERNS'),
  validate({ query: v.listConcernsQuerySchema }),
  controller.listConcerns
);
router.get(
  '/concerns/:type/:id',
  requirePermission('RESOLVE_CONCERNS'),
  validate({ params: v.concernTypeParamSchema }),
  controller.getConcernDetail
);
router.patch(
  '/concerns/:type/:id/status',
  requirePermission('RESOLVE_CONCERNS'),
  validate({ params: v.concernTypeParamSchema, body: v.updateConcernStatusSchema }),
  controller.updateConcernStatus
);
router.post(
  '/concerns/:type/:id/resolve',
  requirePermission('RESOLVE_CONCERNS'),
  validate({ params: v.concernTypeParamSchema, body: v.resolveConcernSchema }),
  controller.resolveConcern
);

export default router;
