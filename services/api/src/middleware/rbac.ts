import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '@mgms/shared';
import { ApiError } from '../errors.js';

/** Every listed permission must be held. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const principal = req.principal;
    if (!principal) return next(ApiError.unauthorized());

    const missing = permissions.filter((p) => !principal.permissions.includes(p));
    if (missing.length > 0) {
      return next(
        ApiError.forbidden(`Your role (${principal.roleCode}) is missing: ${missing.join(', ')}`),
      );
    }
    return next();
  };
}

/** At least one of the listed permissions must be held. */
export function requireAnyPermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const principal = req.principal;
    if (!principal) return next(ApiError.unauthorized());

    if (!permissions.some((p) => principal.permissions.includes(p))) {
      return next(
        ApiError.forbidden(`Your role (${principal.roleCode}) needs one of: ${permissions.join(', ')}`),
      );
    }
    return next();
  };
}
