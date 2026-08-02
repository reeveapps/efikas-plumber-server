import { Request, Response, NextFunction } from 'express';
import { AdminPermission, Role } from '@prisma/client';
import { prisma } from '../db/index.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { sendError } from '../utils/response.js';

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  if (req.cookies?.accessToken) {
    return req.cookies.accessToken;
  }
  return undefined;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);
    if (!token) {
      sendError(res, 'Authentication required', 401);
      return;
    }
    req.user = verifyAccessToken(token);
    next();
  } catch {
    sendError(res, 'Invalid or expired token', 401);
  }
}

// Populates req.user if a valid token is present, but never rejects — for routes
// that are public but behave differently for a logged-in caller (e.g. ad targeting).
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);
    if (token) {
      req.user = verifyAccessToken(token);
    }
  } catch {
    // ignore invalid token on optional auth
  }
  next();
}

// EventSource cannot set an Authorization header, so SSE routes authenticate
// via a `?token=` query param instead. Only mount this on SSE endpoints.
export function authenticateSSE(req: Request, res: Response, next: NextFunction): void {
  try {
    let token: string | undefined = extractToken(req);
    if (!token && typeof req.query.token === 'string') {
      token = req.query.token;
    }
    if (!token) {
      sendError(res, 'Authentication required', 401);
      return;
    }
    req.user = verifyAccessToken(token);
    next();
  } catch {
    sendError(res, 'Invalid or expired token', 401);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Authentication required', 401);
      return;
    }
    if (!roles.includes(req.user.role)) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }
    next();
  };
}

export const requireCustomer = requireRole(Role.CUSTOMER);
export const requirePlumber = requireRole(Role.PLUMBER);
export const requireServiceManager = requireRole(Role.SERVICE_MANAGER);
export const requirePartner = requireRole(Role.PARTNER);
export const requireAdmin = requireRole(Role.ADMIN);

// Granular admin-permission gate (docs/06-admin-web-app.md section 2.1) — a
// super admin bypasses this entirely; any other admin needs at least one of
// the listed permissions in their AdminProfile.permissions array. A
// deactivated admin (isActive: false) is rejected even if they still hold a
// valid, unexpired JWT — revocation takes effect immediately, not just on
// next login.
export function requirePermission(...permissions: AdminPermission[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user || req.user.role !== Role.ADMIN) {
      sendError(res, 'Admin access required', 403);
      return;
    }
    const admin = await prisma.adminProfile.findUnique({ where: { id: req.user.profileId } });
    if (!admin || !admin.isActive) {
      sendError(res, 'Admin access required', 403);
      return;
    }
    if (admin.isSuperAdmin || permissions.some((p) => admin.permissions.includes(p))) {
      next();
      return;
    }
    sendError(res, 'Insufficient permissions', 403);
  };
}
