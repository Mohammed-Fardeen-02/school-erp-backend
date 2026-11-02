import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/prisma-client';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { ModuleId } from '../../shared/constants/modules';

/**
 * Route-level middleware that verifies whether the active organization holds an active
 * subscription entitlement for the requested educational business module.
 */
export function requireModuleEnabled(moduleId: ModuleId) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        return next(
          new AppError(
            'Tenant context required before evaluating module entitlements',
            500,
            ErrorCode.INTERNAL_SERVER_ERROR
          )
        );
      }

      // Check for explicit platform module bypass header with platform super admin permissions
      if (
        req.user?.userType === 'PLATFORM' &&
        req.headers['x-platform-module-bypass'] === 'true' &&
        req.user?.roles.includes('SUPER_ADMIN')
      ) {
        return next();
      }

      // Query database for module subscription
      const entitlement = await (prisma as any).organizationModule.findUnique({
        where: {
          organizationId_moduleId: {
            organizationId,
            moduleId,
          },
        },
      });

      if (!entitlement || !entitlement.isEnabled) {
        return next(
          new AppError(
            `Module '${moduleId}' is not enabled for this organization. Please upgrade your institutional subscription plan.`,
            403,
            ErrorCode.UNAUTHORIZED
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

