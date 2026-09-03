import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError } from '../errors.js';
import { logger } from '../logger.js';
import { config } from '../config.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ApiError) {
    return res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message, details: error.details } });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Validation failed',
        details: { issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      },
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
      return res.status(409).json({
        error: { code: 'CONFLICT', message: `A record with this ${target} already exists` },
      });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Referenced record does not exist' },
      });
    }
  }

  logger.error({ err: error, path: req.path, method: req.method }, 'Unhandled error');
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      ...(config.isProduction ? {} : { details: String(error) }),
    },
  });
}

/** Wrap an async handler so a rejected promise reaches the error handler. */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(
  handler: T,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
