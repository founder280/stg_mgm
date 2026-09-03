import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ApiError } from '../errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Validate and *replace* the request segment with the parsed value, so route
 * handlers work with coerced, defaulted, typed data rather than raw strings.
 */
export function validate<T extends ZodTypeAny>(schema: T, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === 'query') {
        // req.query has only a getter on Express 5; keep a parsed copy instead.
        (req as Request & { validatedQuery?: unknown }).validatedQuery = parsed;
      } else {
        req[source] = parsed as never;
      }
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          ApiError.badRequest('Validation failed', {
            issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          }),
        );
      }
      return next(error);
    }
  };
}

export function parsed<T extends ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  const value = (req as Request & { validatedQuery?: unknown }).validatedQuery;
  return (value ?? schema.parse(req.query)) as z.infer<T>;
}
