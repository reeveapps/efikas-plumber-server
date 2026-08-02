import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Wraps an async controller so thrown/rejected errors reach errorMiddleware
// instead of crashing the process or hanging the request.
export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
