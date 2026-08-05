import { Request, Response } from 'express';
import { parse } from 'csv-parse/sync';
import { ServiceCategory } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/response.js';
import { createError } from '../../middleware/error.middleware.js';
import * as plumbersService from './plumbers.service.js';
import { onboardSchema, addTeamMemberSchema } from './plumbers.validation.js';
import type { TeamMemberInput } from './plumbers.service.js';

export const listPlumbers = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as {
    q?: string;
    category?: ServiceCategory;
    lat?: number;
    lng?: number;
    radiusKm: number;
    minRating?: number;
    cursor?: string;
    limit: number;
  };
  const page = await plumbersService.listPlumbers(query);
  sendSuccess(res, page);
});

export const getPlumberById = asyncHandler(async (req: Request, res: Response) => {
  const plumber = await plumbersService.getPlumberPublicProfile(req.params.id);
  sendSuccess(res, plumber);
});

// `skills` may arrive as a JSON-stringified array, a comma-separated string, or
// (rarely, with certain multipart clients) a repeated field already parsed to an
// array — normalize defensively before validating with zod.
function parseSkillsField(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON — fall through to comma-split
  }
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
}

export const onboardPlumber = asyncHandler(async (req: Request, res: Response) => {
  const body = onboardSchema.parse({
    ...req.body,
    skills: parseSkillsField(req.body.skills),
  });

  const files = req.files as
    | { idDocument?: Express.Multer.File[]; certificates?: Express.Multer.File[]; businessReg?: Express.Multer.File[] }
    | undefined;

  const profile = await plumbersService.onboardPlumber(req.user!.profileId, body, files ?? {});
  sendSuccess(res, profile, 'KYC submitted, pending review');
});

export const getOwnProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await plumbersService.getOwnProfile(req.user!.profileId);
  sendSuccess(res, profile);
});

export const updateOwnProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await plumbersService.updateOwnProfile(req.user!.profileId, req.body);
  sendSuccess(res, profile);
});

export const updateAvailability = asyncHandler(async (req: Request, res: Response) => {
  const profile = await plumbersService.updateAvailability(req.user!.profileId, req.body);
  sendSuccess(res, profile);
});

export const upsertLocation = asyncHandler(async (req: Request, res: Response) => {
  const location = await plumbersService.upsertLocation(req.user!.profileId, req.body);
  sendSuccess(res, location);
});

export const getJobFeed = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await plumbersService.getJobFeed(req.user!.profileId, cursor, limit);
  sendSuccess(res, page);
});

export const listMyBookings = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
  const page = await plumbersService.listMyBookings(req.user!.profileId, cursor, limit);
  sendSuccess(res, page);
});

export const acceptJobOffer = asyncHandler(async (req: Request, res: Response) => {
  const offer = await plumbersService.acceptJobOffer(req.user!.profileId, req.params.offerId);
  sendSuccess(res, offer);
});

export const declineJobOffer = asyncHandler(async (req: Request, res: Response) => {
  const offer = await plumbersService.declineJobOffer(req.user!.profileId, req.params.offerId);
  sendSuccess(res, offer);
});

export const getEarnings = asyncHandler(async (req: Request, res: Response) => {
  const { cursor, limit, from, to } = req.query as unknown as {
    cursor?: string;
    limit: number;
    from?: Date;
    to?: Date;
  };
  const page = await plumbersService.getEarnings(req.user!.profileId, cursor, limit, from, to);
  sendSuccess(res, page);
});

export const getPerformance = asyncHandler(async (req: Request, res: Response) => {
  const performance = await plumbersService.getPerformance(req.user!.profileId);
  sendSuccess(res, performance);
});

export const getSubscriptionStatus = asyncHandler(async (req: Request, res: Response) => {
  const status = await plumbersService.getSubscriptionStatus(req.user!.profileId);
  sendSuccess(res, status);
});

export const listTeamMembers = asyncHandler(async (req: Request, res: Response) => {
  const members = await plumbersService.listTeamMembers(req.user!.profileId);
  sendSuccess(res, members);
});

export const addTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const member = await plumbersService.addTeamMember(req.user!.profileId, req.body);
  sendSuccess(res, member, undefined, 201);
});

// Every row is data, in a fixed column order documented to partners as
// "firstName, lastName, phone, idNumber, email (optional)" — a header row
// (like the one in the downloadable template) is optional, not required,
// and is auto-detected and dropped below rather than needing the caller to
// strip it themselves.
function parseTeamMemberCsv(buffer: Buffer): { rows: TeamMemberInput[]; headerRowSkipped: boolean } {
  let records: string[][];
  try {
    records = parse(buffer, { columns: false, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw createError(`Could not parse CSV file: ${err instanceof Error ? err.message : 'invalid format'}`, 400);
  }

  if (records.length === 0) throw createError('CSV file has no data rows', 400);

  // A real phone number and ID number are always digit-heavy; column labels
  // ("Phone Number", "ID Number", ...) never contain a single digit. Checking
  // both (not just one) avoids ever misclassifying genuine data — an actual
  // plumber's phone or ID could in principle be handed to us oddly, but never
  // both fields with zero digits at once.
  const looksLikeHeaderRow = (row: string[]): boolean => {
    const phone = row[2] ?? '';
    const idNumber = row[3] ?? '';
    return !/\d/.test(phone) && !/\d/.test(idNumber);
  };

  const headerRowSkipped = looksLikeHeaderRow(records[0]!);
  const dataRows = headerRowSkipped ? records.slice(1) : records;

  return {
    rows: dataRows.map((row) => ({
      firstName: row[0] ?? '',
      lastName: row[1] ?? '',
      phone: row[2] ?? '',
      idNumber: row[3] ?? '',
      email: row[4] || undefined,
    })),
    headerRowSkipped,
  };
}

export const bulkAddTeamMembers = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw createError('CSV file is required', 400);

  const { rows: rawRows, headerRowSkipped } = parseTeamMemberCsv(file.buffer);
  const rowOffset = headerRowSkipped ? 1 : 0;

 
  const validRows: { row: number; data: TeamMemberInput }[] = [];
  const invalidResults: { row: number; phone: string; status: 'skipped'; reason: string }[] = [];
  rawRows.forEach((row, i) => {
    const parsed = addTeamMemberSchema.safeParse(row);
    if (parsed.success) {
      validRows.push({ row: i + 1 + rowOffset, data: parsed.data });
    } else {
      invalidResults.push({
        row: i + 1 + rowOffset,
        phone: row.phone,
        status: 'skipped',
        reason: parsed.error.issues.map((issue) => issue.message).join('; '),
      });
    }
  });

  const serviceResult = await plumbersService.bulkAddTeamMembers(req.user!.profileId, validRows);

  sendSuccess(res, {
    createdCount: serviceResult.createdCount,
    skippedCount: serviceResult.skippedCount + invalidResults.length,
    results: [...invalidResults, ...serviceResult.results].sort((a, b) => a.row - b.row),
  });
});


const BULK_TEMPLATE_CSV =
  'First Name,Last Name,Phone Number,ID Number,Email Address(Optional)\r\n' +
  'John,Doe,0712345678,12345678,john@gmail.com\r\n';

export const downloadBulkTemplate = asyncHandler(async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="plumber_bulk_upload_template.csv"');
  res.send(BULK_TEMPLATE_CSV);
});
