import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export type TenantAccessLevel = 'OWNER' | 'ADMIN' | 'MEMBER';

/**
 * Enforces that the authenticated user holds one of the required administrative access levels
 * within the active organization context.
 */
export function requireTenantAccessLevel(...allowedLevels: TenantAccessLevel[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // 1. Platform Super Admins bypass tenant-level administrative checks
    if (req.user?.userType === 'PLATFORM') {
      return next();
    }

    // 2. Verify membership context was populated by requireTenantContext
    const membership = req.membership;
    if (!membership) {
      return next(
        new AppError(
          'Tenant context and membership must be established before checking access level',
          500,
          ErrorCode.INTERNAL_SERVER_ERROR
        )
      );
    }

    if (!allowedLevels.includes(membership.accessLevel as TenantAccessLevel)) {
      return next(
        new AppError(
          `Administrative access denied. This action requires access level: ${allowedLevels.join(' or ')}`,
          403,
          ErrorCode.INSUFFICIENT_PERMISSIONS
        )
      );
    }

    next();
  };
}

export const requireTenantAdmin = requireTenantAccessLevel('OWNER', 'ADMIN');
export const requireTenantOwner = requireTenantAccessLevel('OWNER');

