import type { Request } from 'express';
import { ApiError } from '../errors.js';

/**
 * Read a route parameter.
 *
 * Express types params as possibly-undefined under `noUncheckedIndexedAccess`,
 * which is honest: a route can be mounted without the segment it expects. This
 * turns that into a 400 rather than letting `undefined` reach a query.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw ApiError.badRequest(`Missing route parameter: ${name}`);
  return value;
}
