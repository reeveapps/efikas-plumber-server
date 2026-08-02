import { Request, Response } from 'express';
import { PaymentStatus, PaymentType, Role, VerificationStatus } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as adminService from './admin.service.js';

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const me = await adminService.getMe(req.user!.userId, req.user!.profileId);
  sendSuccess(res, me);
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit, role, status, search } = req.query as unknown as {
    cursor?: string;
    limit: number;
    role?: Role;
    status?: 'active' | 'banned' | 'inactive';
    search?: string;
  };
  const result = await adminService.listUsers({ cursor, limit, role, status, search });
  sendSuccess(res, result);
});

export const banUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await adminService.banUser(req.user!.userId, req.params.id, req.body);
  sendSuccess(res, user);
});

// --- Customers ---

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit, search } = req.query as unknown as { cursor?: string; limit: number; search?: string };
  const result = await adminService.listCustomers(cursor, limit, search);
  sendSuccess(res, result);
});

export const getCustomerDetail = asyncHandler(async (req: Request, res: Response) => {
  const customer = await adminService.getCustomerDetail(req.params.id);
  sendSuccess(res, customer);
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customer = await adminService.updateCustomer(req.user!.userId, req.params.id, req.body);
  sendSuccess(res, customer);
});

// --- Plumbers ---

export const listPlumbersAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit, search, status } = req.query as unknown as {
    cursor?: string;
    limit: number;
    search?: string;
    status?: VerificationStatus;
  };
  const result = await adminService.listPlumbers(cursor, limit, search, status);
  sendSuccess(res, result);
});

export const getPlumberDetail = asyncHandler(async (req: Request, res: Response) => {
  const plumber = await adminService.getPlumberDetail(req.params.id);
  sendSuccess(res, plumber);
});

export const updatePlumber = asyncHandler(async (req: Request, res: Response) => {
  const plumber = await adminService.updatePlumber(req.user!.userId, req.params.id, req.body);
  sendSuccess(res, plumber);
});

// --- Partners ---

export const listPartnersAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit, search } = req.query as unknown as { cursor?: string; limit: number; search?: string };
  const result = await adminService.listPartners(cursor, limit, search);
  sendSuccess(res, result);
});

export const getPartnerDetail = asyncHandler(async (req: Request, res: Response) => {
  const partner = await adminService.getPartnerDetail(req.params.id);
  sendSuccess(res, partner);
});

export const updatePartner = asyncHandler(async (req: Request, res: Response) => {
  const partner = await adminService.updatePartner(req.user!.userId, req.params.id, req.body);
  sendSuccess(res, partner);
});

export const listPendingKyc = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const result = await adminService.listPendingKyc(cursor, limit);
  sendSuccess(res, result);
});

export const approveKyc = asyncHandler(async (req: Request, res: Response) => {
  const plumber = await adminService.approveKyc(req.user!.userId, req.params.plumberId);
  sendSuccess(res, plumber);
});

export const rejectKyc = asyncHandler(async (req: Request, res: Response) => {
  const plumber = await adminService.rejectKyc(req.user!.userId, req.params.plumberId, req.body.reason);
  sendSuccess(res, plumber);
});

export const getBillingHistory = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit, type, status } = req.query as unknown as {
    cursor?: string;
    limit: number;
    type?: PaymentType;
    status?: PaymentStatus;
  };
  const result = await adminService.getBillingHistory(cursor, limit, type, status);
  sendSuccess(res, result);
});

export const listSubscriptions = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const result = await adminService.listSubscriptions(cursor, limit);
  sendSuccess(res, result);
});

export const getAnalyticsOverview = asyncHandler(async (_req: Request, res: Response) => {
  const result = await adminService.getAnalyticsOverview();
  sendSuccess(res, result);
});

export const getAnalyticsTrends = asyncHandler(async (req: Request, res: Response) => {
  const { days } = req.query as unknown as { days: number };
  const result = await adminService.getAnalyticsTrends(days);
  sendSuccess(res, result);
});

export const getRevenueBreakdown = asyncHandler(async (req: Request, res: Response) => {
  const { days } = req.query as unknown as { days: number };
  const result = await adminService.getRevenueBreakdown(days);
  sendSuccess(res, result);
});

export const getPlumberPerformance = asyncHandler(async (_req: Request, res: Response) => {
  const result = await adminService.getPlumberPerformance();
  sendSuccess(res, result);
});

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  await adminService.requireSuperAdmin(req.user!.profileId);
  const { cursor, limit, actorId, action } = req.query as unknown as {
    cursor?: string;
    limit: number;
    actorId?: string;
    action?: string;
  };
  const result = await adminService.listAuditLogs(cursor, limit, { actorId, action });
  sendSuccess(res, result);
});

export const listAuditLogActors = asyncHandler(async (req: Request, res: Response) => {
  await adminService.requireSuperAdmin(req.user!.profileId);
  const result = await adminService.listAuditLogActors();
  sendSuccess(res, result);
});

// --- Partner KYC ---

export const listPendingPartnerKyc = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const result = await adminService.listPendingPartnerKyc(cursor, limit);
  sendSuccess(res, result);
});

export const approvePartnerKyc = asyncHandler(async (req: Request, res: Response) => {
  const partner = await adminService.approvePartnerKyc(req.user!.userId, req.params.partnerId);
  sendSuccess(res, partner);
});

export const rejectPartnerKyc = asyncHandler(async (req: Request, res: Response) => {
  const partner = await adminService.rejectPartnerKyc(req.user!.userId, req.params.partnerId, req.body.reason);
  sendSuccess(res, partner);
});

// --- Product moderation ---

export const listPendingProducts = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const result = await adminService.listPendingProducts(cursor, limit);
  sendSuccess(res, result);
});

export const approveProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await adminService.approveProduct(req.user!.userId, req.params.productId);
  sendSuccess(res, product);
});

export const rejectProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await adminService.rejectProduct(req.user!.userId, req.params.productId, req.body.reason);
  sendSuccess(res, product);
});

// --- Dashboard ---

export const getDashboardSummary = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await adminService.getDashboardSummary();
  sendSuccess(res, summary);
});

// --- Admin management ---

export const listAdmins = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const result = await adminService.listAdmins(cursor, limit);
  sendSuccess(res, result);
});

export const inviteAdmin = asyncHandler(async (req: Request, res: Response) => {
  const invite = await adminService.createAdminInvite(req.user!.userId, req.body);
  sendSuccess(res, invite, undefined, 201);
});

export const updateAdminPermissions = asyncHandler(async (req: Request, res: Response) => {
  const admin = await adminService.updateAdminPermissions(req.user!.userId, req.params.id, req.body.permissions);
  sendSuccess(res, admin);
});

export const setAdminActive = asyncHandler(async (req: Request, res: Response) => {
  const admin = await adminService.setAdminActive(req.user!.userId, req.params.id, req.body.isActive);
  sendSuccess(res, admin);
});

export const revokeAdminInvite = asyncHandler(async (req: Request, res: Response) => {
  const invite = await adminService.revokeAdminInvite(req.user!.userId, req.params.inviteId);
  sendSuccess(res, invite);
});

// --- Public invite flow ---

export const validateInvite = asyncHandler(async (req: Request, res: Response) => {
  const invite = await adminService.validateInvite(req.params.token);
  sendSuccess(res, invite);
});

export const acceptInvite = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await adminService.acceptInvite(req.params.token, req.body.password);
  sendSuccess(res, tokens);
});

export const createSuperAdmin = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await adminService.createSuperAdmin(req.body);
  sendSuccess(res, tokens);
});

// --- Concerns ---

export const listConcerns = asyncHandler(async (req: Request, res: Response) => {
  const { type, status, cursor, limit } = req.query as unknown as {
    type: 'ALL' | 'SERVICE' | 'PRODUCT';
    status?: import('@prisma/client').ConcernStatus;
    cursor?: string;
    limit: number;
  };
  const result = await adminService.listConcerns({ type, status, cursor, limit });
  sendSuccess(res, result);
});

export const getConcernDetail = asyncHandler(async (req: Request, res: Response) => {
  const concern = await adminService.getConcernDetail(req.params.type as 'SERVICE' | 'PRODUCT', req.params.id);
  sendSuccess(res, concern);
});

export const updateConcernStatus = asyncHandler(async (req: Request, res: Response) => {
  const concern = await adminService.updateConcernStatus(
    req.params.type as 'SERVICE' | 'PRODUCT',
    req.params.id,
    req.body.status
  );
  sendSuccess(res, concern);
});

export const resolveConcern = asyncHandler(async (req: Request, res: Response) => {
  const concern = await adminService.resolveConcern(
    req.params.type as 'SERVICE' | 'PRODUCT',
    req.params.id,
    req.user!.userId,
    req.body
  );
  sendSuccess(res, concern);
});
