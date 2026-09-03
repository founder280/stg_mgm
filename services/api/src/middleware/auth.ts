import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Permission, UserScope } from '@mgms/shared';
import { config } from '../config.js';
import { ApiError } from '../errors.js';

export interface Principal {
  userId: string;
  username: string;
  roleCode: string;
  permissions: Permission[];
  scope: UserScope;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

interface AccessTokenClaims {
  sub: string;
  username: string;
  role: string;
  permissions: Permission[];
  scope: UserScope;
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized());
  }

  try {
    const claims = jwt.verify(header.slice(7), config.JWT_ACCESS_SECRET, {
      issuer: 'mgms-api',
    }) as AccessTokenClaims;

    req.principal = {
      userId: claims.sub,
      username: claims.username,
      roleCode: claims.role,
      permissions: claims.permissions ?? [],
      scope: claims.scope,
    };
    return next();
  } catch (error) {
    const message =
      error instanceof jwt.TokenExpiredError ? 'Access token has expired' : 'Access token is invalid';
    return next(ApiError.unauthorized(message));
  }
}

export function requirePrincipal(req: Request): Principal {
  if (!req.principal) throw ApiError.unauthorized();
  return req.principal;
}
