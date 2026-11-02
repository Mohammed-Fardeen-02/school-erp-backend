import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/prisma-client';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { sanitizeAuditPayload } from '../security/audit-sanitizer';

export interface TenantContextOptions {
  requireLocation?: boolean;
}

export function requireTenantContext(options?: TenantContextOptions) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Verify user is authenticated
      if (!req.user) {
        return next(AppError.unauthorized('Authentication required'));
      }

      // 2. Extract Organization ID from headers, params, or body
      const targetOrgId =
        (req.headers['x-organization-id'] as string) ||
        (req.params.organizationId as string) ||
        (req.params.schoolId as string);

      if (!targetOrgId) {
        return next(
          new AppError(
            'Organization context missing. Please provide the X-Organization-Id header.',
            400,
            ErrorCode.TENANT_CONTEXT_MISSING
          )
        );
      }

      // 3. Platform Super Admin Verification & Inspection Flow
      if (req.user.userType === 'PLATFORM') {
        const organization = await (prisma as any).organization.findUnique({
          where: { id: targetOrgId },
        });

        if (!organization) {
          return next(
            new AppError('Target organization not found', 404, ErrorCode.TENANT_NOT_FOUND)
          );
        }

        if (organization.status === 'ARCHIVED') {
          return next(
            new AppError(
              'Target organization has been archived and cannot be accessed via standard routes',
              403,
              ErrorCode.TENANT_ACCESS_DENIED
            )
          );
        }

        // Attach verified organization context
        req.organizationId = targetOrgId;
        if (req.context) {
          req.context.organizationId = targetOrgId;
        }

        // Location context for platform operator
        const targetLocId =
          (req.headers['x-location-id'] as string) ||
          (req.params.locationId as string) ||
          (req.params.branchId as string);

        if (targetLocId) {
          const location = await (prisma as any).location.findFirst({
            where: { id: targetLocId, organizationId: targetOrgId, isActive: true },
          });

          if (!location) {
            return next(
              new AppError(
                'Location not found or does not belong to this organization',
                404,
                ErrorCode.NOT_FOUND
              )
            );
          }

          req.locationId = targetLocId;
          if (req.context) {
            req.context.locationId = targetLocId;
          }
        } else if (options?.requireLocation) {
          return next(
            new AppError(
              'Location context missing. Please provide the X-Location-Id header.',
              400,
              ErrorCode.BAD_REQUEST
            )
          );
        }

        // Audit privileged platform inspection
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'unknown';

        (prisma as any).auditLog.create({
          data: {
            organizationId: targetOrgId,
            userId: req.user.id,
            action: 'PLATFORM_TENANT_INSPECT',
            entity: 'Organization',
            entityId: targetOrgId,
            newState: sanitizeAuditPayload({
              path: req.originalUrl,
              method: req.method,
              locationId: req.locationId,
            }),
            ipAddress: clientIp,
            userAgent,
          },
        }).catch(() => {
          // Non-blocking telemetry
        });

        return next();
      }

      // 4. Tenant User Membership Verification
      const membership = await (prisma as any).organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: req.user.id,
            organizationId: targetOrgId,
          },
        },
        include: { organization: true },
      });

      if (!membership || membership.status !== 'ACTIVE') {
        return next(
          new AppError(
            'You do not have active membership access to this organization',
            403,
            ErrorCode.TENANT_ACCESS_DENIED
          )
        );
      }

      const org = membership.organization;

      // 5. Enforce Tenant Lifecycle & Expiry Invariants
      if (org.status === 'PROVISIONING') {
        return next(
          new AppError(
            'This organization is currently being provisioned. Please try again shortly.',
            403,
            ErrorCode.TENANT_ACCESS_DENIED
          )
        );
      }

      if (org.status === 'SUSPENDED') {
        return next(
          new AppError(
            'This organization has been suspended. Please contact institutional support.',
            403,
            ErrorCode.TENANT_ACCESS_DENIED
          )
        );
      }

      if (org.status === 'ARCHIVED') {
        return next(
          new AppError(
            'This organization has been archived and is no longer accessible.',
            403,
            ErrorCode.TENANT_ACCESS_DENIED
          )
        );
      }

      // Real-time trial expiry enforcement
      if (org.status === 'TRIAL' && org.trialEndsAt) {
        if (new Date() > new Date(org.trialEndsAt)) {
          return next(
            new AppError(
              'Organization trial period has expired. Please upgrade your subscription to continue.',
              403,
              ErrorCode.TENANT_ACCESS_DENIED
            )
          );
        }
      }

      // 6. Attach verified tenant context and membership
      req.organizationId = targetOrgId;
      req.membership = {
        id: membership.id,
        userId: membership.userId,
        organizationId: membership.organizationId,
        accessLevel: membership.accessLevel,
        membershipType: membership.membershipType,
        status: membership.status,
        jobTitle: membership.jobTitle,
        department: membership.department,
        isPrimary: membership.isPrimary,
      };

      if (req.context) {
        req.context.organizationId = targetOrgId;
      }

      // 7. Verify Location Context
      const targetLocId =
        (req.headers['x-location-id'] as string) ||
        (req.params.locationId as string) ||
        (req.params.branchId as string);

      if (targetLocId) {
        const location = await (prisma as any).location.findFirst({
          where: {
            id: targetLocId,
            organizationId: targetOrgId,
            isActive: true,
          },
        });

        if (!location) {
          return next(
            new AppError(
              'Location not found or does not belong to this organization',
              404,
              ErrorCode.NOT_FOUND
            )
          );
        }

        req.locationId = targetLocId;
        if (req.context) {
          req.context.locationId = targetLocId;
        }
      } else if (options?.requireLocation) {
        return next(
          new AppError(
            'Location context missing. Please provide the X-Location-Id header.',
            400,
            ErrorCode.BAD_REQUEST
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

