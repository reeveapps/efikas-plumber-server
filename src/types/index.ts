import { Request } from 'express';
import { Role } from '@prisma/client';

export interface AuthUser {
  userId: string;
  role: Role;
  profileId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
}

export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
}

export function getCursorPagination(query: { cursor?: string; limit?: string }): CursorPaginationParams {
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
  return { cursor: query.cursor, limit };
}
