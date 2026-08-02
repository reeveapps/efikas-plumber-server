import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

// Runs zod schemas against req.body/query/params and replaces them with the
// parsed (typed, defaulted, coerced) values. Throws ZodError -> handled by errorMiddleware.
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
    if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
    next();
  };
}
