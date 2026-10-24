import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export function authorizeRoles(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, ErrorCode.UNAUTHENTICATED));
    }

    const hasAllowedRole = req.user.roles.some(role => allowedRoles.includes(role));

    if (!hasAllowedRole) {
      return next(
        new AppError(
          'You do not have the required role to access this resource',
          403,
          ErrorCode.INSUFFICIENT_PERMISSIONS
        )
      );
    }

    next();
  };
}

export function authorizePermissions(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, ErrorCode.UNAUTHENTICATED));
    }

    // Super Admin role bypasses permission checks
    if (req.user.roles.includes('SUPER_ADMIN')) {
      return next();
    }

    const hasAllPermissions = requiredPermissions.every(permission =>
      req.user?.permissions.includes(permission)
    );

    if (!hasAllPermissions) {
      return next(
        new AppError(
          'You lack required permission(s) for this action',
          403,
          ErrorCode.INSUFFICIENT_PERMISSIONS
        )
      );
    }

    next();
  };
}

export function requireTenantScope() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, ErrorCode.UNAUTHENTICATED));
    }

    // Super Admins operate globally across tenants
    if (req.user.roles.includes('SUPER_ADMIN')) {
      return next();
    }

    const targetSchoolId = req.schoolId || req.params.schoolId || req.body?.schoolId;

    if (!req.user.schoolId) {
      return next(
        new AppError(
          'User is not associated with any school tenant',
          403,
          ErrorCode.TENANT_ACCESS_DENIED
        )
      );
    }

    if (targetSchoolId && targetSchoolId !== req.user.schoolId) {
      return next(
        new AppError(
          'Cross-tenant access forbidden. You cannot access resources belonging to another school.',
          403,
          ErrorCode.TENANT_ACCESS_DENIED
        )
      );
    }

    // Explicitly guarantee schoolId is set to user's tenant
    req.schoolId = req.user.schoolId;
    if (req.context) {
      req.context.schoolId = req.user.schoolId;
    }

    next();
  };
}
