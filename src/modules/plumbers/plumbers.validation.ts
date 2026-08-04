import { z } from 'zod';
import { PlumberAccountType, ServiceCategory } from '@prisma/client';

export const listPlumbersQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  category: z.nativeEnum(ServiceCategory).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().default(15),
  minRating: z.coerce.number().min(0).max(5).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const plumberIdParamSchema = z.object({
  id: z.string().min(1),
});

// Fields arrive via multipart/form-data alongside files, so `skills` may be a JSON
// string, a comma-separated string, or an array depending on the client — parsed
// defensively before this schema runs (see service/controller).
//
// accountType is step 1 of onboarding: INDIVIDUAL requires idNumber (+ idDocument
// file, checked in the controller since files bypass zod), COMPANY requires
// businessRegNumber (+ businessReg file) instead — never both.
export const onboardSchema = z
  .object({
    accountType: z.nativeEnum(PlumberAccountType).default('INDIVIDUAL'),
    idNumber: z.string().min(1).optional(),
    businessRegNumber: z.string().min(1).optional(),
    bio: z.string().max(1000).optional(),
    skills: z.array(z.nativeEnum(ServiceCategory)).default([]),
    yearsExperience: z.coerce.number().int().min(0).max(60).optional(),
  })
  .refine((d) => d.accountType !== 'INDIVIDUAL' || !!d.idNumber, {
    message: 'idNumber is required for an individual account',
    path: ['idNumber'],
  })
  .refine((d) => d.accountType !== 'COMPANY' || !!d.businessRegNumber, {
    message: 'businessRegNumber is required for a company account',
    path: ['businessRegNumber'],
  });

export const addTeamMemberSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().min(9).max(15),
  idNumber: z.string().trim().min(1).max(30),
  email: z.string().email().optional(),
});

export const updateProfileSchema = z.object({
  bio: z.string().max(1000).optional(),
  skills: z.array(z.nativeEnum(ServiceCategory)).optional(),
  customSkills: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  yearsExperience: z.coerce.number().int().min(0).max(60).optional(),
});

export const updateAvailabilitySchema = z.object({
  isOnline: z.boolean().optional(),
  serviceRadiusKm: z.coerce.number().positive().optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).optional(),
  workingHoursStart: z.string().optional(),
  workingHoursEnd: z.string().optional(),
});

export const updateLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  heading: z.coerce.number().optional(),
  // Present only while pushing from an active job (see ActiveJobScreen) —
  // triggers a live broadcast to that booking's room in addition to the
  // usual PlumberLocation upsert.
  bookingId: z.string().min(1).optional(),
});

export const jobFeedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const myBookingsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const offerIdParamSchema = z.object({
  offerId: z.string().min(1),
});

export const earningsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
