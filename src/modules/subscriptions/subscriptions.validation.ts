import { z } from 'zod';

export const listPlansSchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional(),
});
