import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendError, sendSuccess } from '../../utils/response.js';
import * as companiesService from './companies.service.js';

export const createCompany = asyncHandler(async (req: Request, res: Response) => {
  const company = await companiesService.createCompany(req.user!.profileId, req.body);
  sendSuccess(res, company, undefined, 201);
});

export const getMyCompany = asyncHandler(async (req: Request, res: Response) => {
  const company = await companiesService.getMyCompany(req.user!.profileId);
  sendSuccess(res, company);
});

export const updateMyCompany = asyncHandler(async (req: Request, res: Response) => {
  const company = await companiesService.updateMyCompany(req.user!.profileId, req.body);
  sendSuccess(res, company);
});

export const addPlumber = asyncHandler(async (req: Request, res: Response) => {
  const plumber = await companiesService.addPlumberToMyCompany(req.user!.profileId, req.body);
  sendSuccess(res, plumber, undefined, 201);
});

export const listMyPlumbers = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await companiesService.listMyPlumbers(req.user!.profileId, cursor, limit);
  sendSuccess(res, page);
});

export const removePlumber = asyncHandler(async (req: Request, res: Response) => {
  await companiesService.removePlumberFromMyCompany(req.user!.profileId, req.params.plumberId);
  sendSuccess(res, null, 'Plumber removed from company');
});

export const getMyPlumbersMap = asyncHandler(async (req: Request, res: Response) => {
  const map = await companiesService.getMyPlumbersMap(req.user!.profileId);
  sendSuccess(res, map);
});

export const assignBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await companiesService.assignBookingToPlumber(
    req.user!.profileId,
    req.params.bookingId,
    req.body.plumberId
  );
  sendSuccess(res, booking);
});

export const getMyReports = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = req.query as unknown as { from?: string; to?: string };
  const report = await companiesService.getMyReports(req.user!.profileId, from, to);
  sendSuccess(res, report);
});

export const exportMyReports = asyncHandler(async (req: Request, res: Response) => {
  const { from, to, format } = req.query as unknown as { from?: string; to?: string; format: 'csv' | 'pdf' };

  if (format === 'pdf') {
    sendError(res, 'PDF export is not implemented', 501);
    return;
  }

  const csv = await companiesService.getMyReportsCsv(req.user!.profileId, from, to);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
  res.send(csv);
});

export const getMySubscription = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const result = await companiesService.getMySubscription(req.user!.profileId, cursor, limit);
  sendSuccess(res, result);
});

export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const subscription = await companiesService.subscribeMyCompany(req.user!.profileId, req.body.planId);
  sendSuccess(res, subscription, undefined, 201);
});

export const cancelSubscription = asyncHandler(async (req: Request, res: Response) => {
  const subscription = await companiesService.cancelMySubscription(req.user!.profileId);
  sendSuccess(res, subscription, 'Subscription auto-renew cancelled');
});
