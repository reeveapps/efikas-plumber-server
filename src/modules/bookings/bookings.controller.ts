import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import { uploadToR2 } from '../../utils/r2.js';
import * as bookingsService from './bookings.service.js';

export const createBooking = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as { photos?: Express.Multer.File[]; voiceNote?: Express.Multer.File[] } | undefined;
  const photoFiles = files?.photos ?? [];
  const photoUrls = photoFiles.length
    ? await Promise.all(photoFiles.map((f) => uploadToR2(f, 'bookings')))
    : req.body.photoUrls ?? [];

  const voiceNoteFile = files?.voiceNote?.[0];
  const voiceNoteUrl = voiceNoteFile ? await uploadToR2(voiceNoteFile, 'bookings/voice-notes') : req.body.voiceNoteUrl;

  const booking = await bookingsService.createBooking(
    req.user!.profileId,
    { ...req.body, voiceNoteUrl },
    photoUrls
  );
  sendSuccess(res, booking, undefined, 201);
});

export const getActiveBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await bookingsService.getActiveBooking(req.user!);
  sendSuccess(res, booking);
});

export const getBookingDetail = asyncHandler(async (req: Request, res: Response) => {
  const booking = await bookingsService.getBookingDetail(req.params.id, req.user!);
  sendSuccess(res, booking);
});

export const getMatches = asyncHandler(async (req: Request, res: Response) => {
  const matches = await bookingsService.getMatches(req.params.id, req.user!.profileId);
  sendSuccess(res, matches);
});

export const selectPlumber = asyncHandler(async (req: Request, res: Response) => {
  const booking = await bookingsService.selectPlumber(req.params.id, req.user!.profileId, req.body.plumberId);
  sendSuccess(res, booking);
});

export const cancelBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await bookingsService.cancelBooking(req.params.id, req.user!, req.body.reason);
  sendSuccess(res, booking);
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const booking = await bookingsService.updateStatus(req.params.id, req.user!.profileId, req.body);
  sendSuccess(res, booking);
});

export const plumberConfirmAgreement = asyncHandler(async (req: Request, res: Response) => {
  const booking = await bookingsService.plumberConfirmAgreement(req.params.id, req.user!.profileId);
  sendSuccess(res, booking);
});

export const customerConfirmAgreement = asyncHandler(async (req: Request, res: Response) => {
  const booking = await bookingsService.customerConfirmAgreement(req.params.id, req.user!.profileId);
  sendSuccess(res, booking);
});

export const completeBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await bookingsService.completeBooking(req.params.id, req.user!.profileId);
  sendSuccess(res, booking);
});

export const getTimeline = asyncHandler(async (req: Request, res: Response) => {
  const timeline = await bookingsService.getTimeline(req.params.id, req.user!);
  sendSuccess(res, timeline);
});

export const createPaymentRecord = asyncHandler(async (req: Request, res: Response) => {
  const record = await bookingsService.createPaymentRecord(req.params.id, req.user!.profileId, req.body);
  sendSuccess(res, record, undefined, 201);
});

export const confirmPaymentRecord = asyncHandler(async (req: Request, res: Response) => {
  const record = await bookingsService.confirmPaymentRecord(req.params.id, req.user!.profileId);
  sendSuccess(res, record);
});

export const disputePaymentRecord = asyncHandler(async (req: Request, res: Response) => {
  const record = await bookingsService.disputePaymentRecord(req.params.id, req.user!.profileId);
  sendSuccess(res, record);
});

export const createReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await bookingsService.createReview(req.params.bookingId, req.user!.profileId, req.body);
  sendSuccess(res, review, undefined, 201);
});

export const createDispute = asyncHandler(async (req: Request, res: Response) => {
  const dispute = await bookingsService.createDispute(req.params.bookingId, req.user!.profileId, req.body);
  sendSuccess(res, dispute, undefined, 201);
});

export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await bookingsService.listMessages(req.params.bookingId, req.user!, cursor, limit);
  sendSuccess(res, page);
});

export const createMessage = asyncHandler(async (req: Request, res: Response) => {
  const message = await bookingsService.createMessage(req.params.bookingId, req.user!, req.body);
  sendSuccess(res, message, undefined, 201);
});

export const markMessagesRead = asyncHandler(async (req: Request, res: Response) => {
  await bookingsService.markMessagesRead(req.params.bookingId, req.user!);
  sendSuccess(res, null, 'Messages marked as read');
});

export const revealNumber = asyncHandler(async (req: Request, res: Response) => {
  const result = await bookingsService.revealNumber(req.params.bookingId, req.user!);
  sendSuccess(res, result);
});
