import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import * as customersService from './customers.service.js';

export const listLocations = asyncHandler(async (req: Request, res: Response) => {
  const locations = await customersService.listLocations(req.user!.profileId);
  sendSuccess(res, locations);
});

export const createLocation = asyncHandler(async (req: Request, res: Response) => {
  const location = await customersService.createLocation(req.user!.profileId, req.body);
  sendSuccess(res, location, undefined, 201);
});

export const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const location = await customersService.updateLocation(req.user!.profileId, req.params.id, req.body);
  sendSuccess(res, location);
});

export const deleteLocation = asyncHandler(async (req: Request, res: Response) => {
  await customersService.deleteLocation(req.user!.profileId, req.params.id);
  sendSuccess(res, null, 'Saved location removed');
});

export const listBookings = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await customersService.listBookings(req.user!.profileId, cursor, limit);
  sendSuccess(res, page);
});

export const getBookingDetail = asyncHandler(async (req: Request, res: Response) => {
  const booking = await customersService.getBookingDetail(req.user!.profileId, req.params.id);
  sendSuccess(res, booking);
});
