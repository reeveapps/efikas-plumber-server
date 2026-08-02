import { Response } from 'express';
import { ApiResponse } from '../types/index.js';
import { presignResponseUrls } from './r2.js';

// Async but deliberately not required to be awaited by callers — every
// existing `sendSuccess(res, ...)` call site fires-and-forgets it, which
// works fine because the HTTP response completes whenever `res.json()`
// actually runs, not when the enclosing controller function returns.
// Presigning failures fall back to the unsigned value rather than hanging
// or 500ing the request.
export async function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200
): Promise<void> {
  const presignedData = await presignResponseUrls(data).catch(() => data);
  const response: ApiResponse<T> = {
    success: true,
    message,
    data: presignedData,
  };
  res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  errors?: unknown
): void {
  const response: ApiResponse = {
    success: false,
    message,
    errors,
  };
  res.status(statusCode).json(response);
}
