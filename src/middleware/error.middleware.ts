import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

interface AppError extends Error {
  statusCode?: number;
  errors?: unknown;
}

export function errorMiddleware(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Prisma errors
  if (err.constructor?.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as AppError & { code?: string; meta?: { target?: string[] } };

    if (prismaErr.code === 'P2002') {
      const targets = prismaErr.meta?.target;

    // 2. Format them nicely. If targets exists, join them (e.g., "email", "phoneNumber").
    // If it's missing, fall back to a natural word like "information".
    const duplicateFields = Array.isArray(targets) && targets.length > 0
      ? targets.join(' or ') 
      : 'information';

    res.status(409).json({
      success: false,
      message: `A record with this ${duplicateFields} already exists.`,
    });
      return;
    }

    if (prismaErr.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Record not found',
      });
      return;
    }

    // Foreign key violation — deleting/updating a row still referenced by
    // another table. A safety net for anywhere a specific pre-check (like
    // products.service.ts's deleteProduct) hasn't already turned this into a
    // friendlier, more specific message.
    if (prismaErr.code === 'P2003') {
      res.status(409).json({
        success: false,
        message: 'This action conflicts with related records and cannot be completed.',
      });
      return;
    }
  }

  // App-thrown errors with statusCode
  if (err.statusCode) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
    return;
  }

  // Generic 500
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
}

// Helper to create HTTP errors
export function createError(message: string, statusCode: number, errors?: unknown): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.errors = errors;
  return err;
}
