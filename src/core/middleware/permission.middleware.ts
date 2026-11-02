import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/prisma-client';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { effectivePermissionsService } from '../authorization/effective-permissions.service';
import { sanitizeAuditPayload } from '../security/audit-sanitizer';

export interface PermissionOptions {
  requireLocation?: boolean;
}

/**
 * Express middleware to enforce fine-grained dynamic RBAC permissions.
 * Follows Phase 3 Specification v3.0.2:
 * 1. Unauthenticated -> 401
 * 2. Platform inspection (GET/HEAD) -> allowed with telemetry
 * 3. Platform mutation (POST/PUT/PATCH/DELETE) -> requires X-Platform-Override: true with audited PLATFORM_OVERRIDE
 * 4. Tenant user -> evaluates hierarchical permissions (inheritance, deny-overrides, grant-union, campus-scope)
 */
export function requirePermission(
  targetNodeCode: string,
  options?: PermissionOptions
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Verify user is authenticated
      if (!req.user) {
        return next(new AppError('Authentication required', 401, ErrorCode.UNAUTHENTICATED));
      }

      // 2. Platform Operator Flow — Trusted Server-Side Verification
      if (req.user.userType === 'PLATFORM') {
        // Independently verify active platform user identity in database
        const platformUser = await (prisma as any).user.findUnique({
          where: { id: req.user.id },
          select: { id: true, email: true, userType: true, isActive: true },
        });

        if (!platformUser || !platformUser.isActive || platformUser.userType !== 'PLATFORM') {
          return next(
            new AppError(
              'Platform operator verification failed: identity not recognized as active platform user',
              403,
              ErrorCode.INSUFFICIENT_PERMISSIONS
            )
          );
        }

        const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());

        if (isSafeMethod) {
          // Read-only inspection allowed with non-blocking telemetry
          const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
          const userAgent = req.headers['user-agent'] || 'unknown';

          (prisma as any).auditLog
            .create({
              data: {
                organizationId: req.organizationId || null,
                userId: platformUser.id,
                action: 'PLATFORM_INSPECT_NODE',
                entity: 'PermissionNode',
                entityId: targetNodeCode,
                newState: sanitizeAuditPayload({
                  nodeCode: targetNodeCode,
                  method: req.method,
                  path: req.originalUrl,
                  locationId: req.locationId || null,
                  operatorEmail: platformUser.email,
                }),
                ipAddress: clientIp,
                userAgent,
              },
            })
            .catch(() => {
              // Non-blocking telemetry
            });

          return next();
        }

        // Mutation requires explicit override header request
        const hasOverride = req.headers['x-platform-override'] === 'true';
        if (!hasOverride) {
          return next(
            new AppError(
              'Platform operator override (X-Platform-Override: true) required for tenant mutation',
              403,
              ErrorCode.INSUFFICIENT_PERMISSIONS
            )
          );
        }

        // Mutation mandates non-empty justification (minimum 10 characters)
        const reason = (req.headers['x-override-reason'] as string)?.trim();
        if (!reason || reason.length < 10) {
          return next(
            new AppError(
              'Platform operator override rejected: mandatory justification reason (X-Override-Reason, minimum 10 characters) required',
              400,
              ErrorCode.BAD_REQUEST
            )
          );
        }

        // Record audited PLATFORM_OVERRIDE with complete security context
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';

        await (prisma as any).auditLog.create({
          data: {
            organizationId: req.organizationId || null,
            userId: platformUser.id,
            action: 'PLATFORM_OVERRIDE',
            entity: 'PermissionNode',
            entityId: targetNodeCode,
            newState: sanitizeAuditPayload({
              nodeCode: targetNodeCode,
              method: req.method,
              path: req.originalUrl,
              locationId: req.locationId || null,
              justification: reason,
              operatorEmail: platformUser.email,
            }),
            ipAddress: clientIp,
            userAgent,
          },
        });

        return next();
      }

      // 3. Tenant User Context Verification
      const targetOrgId = req.organizationId || req.user.organizationId;
      if (!targetOrgId) {
        return next(
          new AppError(
            'Organization context missing. Please provide the X-Organization-Id header.',
            400,
            ErrorCode.TENANT_CONTEXT_MISSING
          )
        );
      }

      const targetLocId = req.locationId || req.user.locationId;
      if (options?.requireLocation && !targetLocId) {
        return next(
          new AppError(
            'Location context missing. Please provide the X-Location-Id header.',
            400,
            ErrorCode.BAD_REQUEST
          )
        );
      }

      // 4. Dynamic Permission Evaluation
      const isGranted = await effectivePermissionsService.hasPermission(
        req.user.id,
        targetOrgId,
        targetLocId,
        targetNodeCode
      );

      if (!isGranted) {
        return next(
          new AppError(
            `You lack the required permission to perform this action: ${targetNodeCode}`,
            403,
            ErrorCode.INSUFFICIENT_PERMISSIONS
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Express middleware to require AT LEAST ONE permission from a list.
 */
export function requireAnyPermission(
  targetNodeCodes: string[],
  options?: PermissionOptions
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required', 401, ErrorCode.UNAUTHENTICATED));
      }

      if (req.user.userType === 'PLATFORM') {
        const platformUser = await (prisma as any).user.findUnique({
          where: { id: req.user.id },
          select: { id: true, email: true, userType: true, isActive: true },
        });

        if (!platformUser || !platformUser.isActive || platformUser.userType !== 'PLATFORM') {
          return next(
            new AppError(
              'Platform operator verification failed: identity not recognized as active platform user',
              403,
              ErrorCode.INSUFFICIENT_PERMISSIONS
            )
          );
        }

        const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
        if (isSafeMethod) {
          return next();
        }

        const hasOverride = req.headers['x-platform-override'] === 'true';
        if (!hasOverride) {
          return next(
            new AppError(
              'Platform operator override (X-Platform-Override: true) required for tenant mutation',
              403,
              ErrorCode.INSUFFICIENT_PERMISSIONS
            )
          );
        }

        const reason = (req.headers['x-override-reason'] as string)?.trim();
        if (!reason || reason.length < 10) {
          return next(
            new AppError(
              'Platform operator override rejected: mandatory justification reason (X-Override-Reason, minimum 10 characters) required',
              400,
              ErrorCode.BAD_REQUEST
            )
          );
        }

        return next();
      }

      const targetOrgId = req.organizationId || req.user.organizationId;
      if (!targetOrgId) {
        return next(
          new AppError(
            'Organization context missing. Please provide the X-Organization-Id header.',
            400,
            ErrorCode.TENANT_CONTEXT_MISSING
          )
        );
      }

      const targetLocId = req.locationId || req.user.locationId;
      if (options?.requireLocation && !targetLocId) {
        return next(
          new AppError(
            'Location context missing. Please provide the X-Location-Id header.',
            400,
            ErrorCode.BAD_REQUEST
          )
        );
      }

      const effective = await effectivePermissionsService.getEffectivePermissions(
        req.user.id,
        targetOrgId,
        targetLocId
      );

      const hasAny = targetNodeCodes.some((code) => effective.has(code));
      if (!hasAny) {
        return next(
          new AppError(
            `You lack at least one required permission: ${targetNodeCodes.join(' | ')}`,
            403,
            ErrorCode.INSUFFICIENT_PERMISSIONS
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Express middleware to require ALL permissions from a list.
 */
export function requireAllPermissions(
  targetNodeCodes: string[],
  options?: PermissionOptions
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required', 401, ErrorCode.UNAUTHENTICATED));
      }

      if (req.user.userType === 'PLATFORM') {
        const platformUser = await (prisma as any).user.findUnique({
          where: { id: req.user.id },
          select: { id: true, email: true, userType: true, isActive: true },
        });

        if (!platformUser || !platformUser.isActive || platformUser.userType !== 'PLATFORM') {
          return next(
            new AppError(
              'Platform operator verification failed: identity not recognized as active platform user',
              403,
              ErrorCode.INSUFFICIENT_PERMISSIONS
            )
          );
        }

        const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
        if (isSafeMethod) {
          return next();
        }

        const hasOverride = req.headers['x-platform-override'] === 'true';
        if (!hasOverride) {
          return next(
            new AppError(
              'Platform operator override (X-Platform-Override: true) required for tenant mutation',
              403,
              ErrorCode.INSUFFICIENT_PERMISSIONS
            )
          );
        }

        const reason = (req.headers['x-override-reason'] as string)?.trim();
        if (!reason || reason.length < 10) {
          return next(
            new AppError(
              'Platform operator override rejected: mandatory justification reason (X-Override-Reason, minimum 10 characters) required',
              400,
              ErrorCode.BAD_REQUEST
            )
          );
        }

        return next();
      }

      const targetOrgId = req.organizationId || req.user.organizationId;
      if (!targetOrgId) {
        return next(
          new AppError(
            'Organization context missing. Please provide the X-Organization-Id header.',
            400,
            ErrorCode.TENANT_CONTEXT_MISSING
          )
        );
      }

      const targetLocId = req.locationId || req.user.locationId;
      if (options?.requireLocation && !targetLocId) {
        return next(
          new AppError(
            'Location context missing. Please provide the X-Location-Id header.',
            400,
            ErrorCode.BAD_REQUEST
          )
        );
      }

      const effective = await effectivePermissionsService.getEffectivePermissions(
        req.user.id,
        targetOrgId,
        targetLocId
      );

      const missing = targetNodeCodes.filter((code) => !effective.has(code));
      if (missing.length > 0) {
        return next(
          new AppError(
            `You lack required permission(s): ${missing.join(', ')}`,
            403,
            ErrorCode.INSUFFICIENT_PERMISSIONS
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

