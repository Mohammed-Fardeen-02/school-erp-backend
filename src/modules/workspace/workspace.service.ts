import { workspaceRepository } from './workspace.repository';
import {
  SelectWorkspaceContextDto,
  WorkspaceContextResponse,
  UserOrganizationSummary,
} from './workspace.types';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { withTransactionRetry } from '../../shared/utils/transaction-retry';
import { prisma } from '../../core/database/prisma-client';
import { sanitizeAuditPayload } from '../../core/security/audit-sanitizer';

export class WorkspaceService {
  async getUserOrganizations(userId: string): Promise<UserOrganizationSummary[]> {
    return workspaceRepository.getUserOrganizations(userId);
  }

  async selectContext(
    userId: string,
    dto: SelectWorkspaceContextDto,
    isPlatformUser: boolean = false
  ): Promise<WorkspaceContextResponse> {
    let membership: any = null;
    let organization: any = null;

    if (!isPlatformUser) {
      membership = await workspaceRepository.findMembership(userId, dto.organizationId);
      if (!membership || membership.status !== 'ACTIVE') {
        throw AppError.forbidden(
          'You do not have an active membership in this organization',
          ErrorCode.TENANT_ACCESS_DENIED
        );
      }
      organization = membership.organization;
    } else {
      organization = await (prisma as any).organization.findUnique({
        where: { id: dto.organizationId },
      });
      if (!organization) {
        throw AppError.notFound('Organization not found', ErrorCode.TENANT_NOT_FOUND);
      }
      // Synthetic membership representation for platform operator
      membership = {
        id: 'platform-session',
        accessLevel: 'OWNER',
        membershipType: 'PLATFORM_SUPER_ADMIN',
        isPrimary: false,
      };
    }

    // Verify tenant operational status
    if (organization.status === 'ARCHIVED') {
      throw AppError.forbidden(
        'This organization has been archived and is inaccessible',
        ErrorCode.TENANT_ACCESS_DENIED
      );
    }

    if (organization.status === 'SUSPENDED') {
      throw AppError.forbidden(
        'This organization account is currently suspended. Please contact support.',
        ErrorCode.TENANT_ACCESS_DENIED
      );
    }

    if (organization.status === 'PROVISIONING' && !isPlatformUser) {
      throw AppError.forbidden(
        'Organization provisioning is still in progress',
        ErrorCode.TENANT_ACCESS_DENIED
      );
    }

    if (organization.status === 'TRIAL' && organization.trialEndsAt) {
      if (new Date() > new Date(organization.trialEndsAt)) {
        throw AppError.forbidden(
          'The trial period for this organization has expired. Please upgrade your subscription.',
          ErrorCode.TENANT_ACCESS_DENIED
        );
      }
    }

    // Resolve location
    const location = await workspaceRepository.resolveLocation(
      dto.organizationId,
      dto.locationId
    );

    // Fetch enabled modules
    const enabledModules = await workspaceRepository.getEnabledModules(
      dto.organizationId
    );

    return {
      organization: {
        id: organization.id,
        code: organization.code,
        displayName: organization.displayName,
        legalName: organization.legalName,
        organizationType: organization.organizationType,
        status: organization.status,
        logoUrl: organization.logoUrl,
      },
      location: location
        ? {
            id: location.id,
            code: location.code,
            name: location.name,
            locationType: location.locationType,
            isMainCampus: location.isMainCampus,
          }
        : undefined,
      membership: {
        id: membership.id,
        accessLevel: membership.accessLevel,
        membershipType: membership.membershipType,
        isPrimary: membership.isPrimary || false,
      },
      enabledModules,
    };
  }

  async getCurrentWorkspace(
    userId: string,
    organizationId: string,
    locationId?: string,
    isPlatformUser: boolean = false
  ): Promise<WorkspaceContextResponse> {
    return this.selectContext(
      userId,
      { organizationId, locationId },
      isPlatformUser
    );
  }

  async setPrimaryOrganization(userId: string, targetOrganizationId: string) {
    const updatedMembership = await withTransactionRetry(() =>
      workspaceRepository.setPrimaryOrganization(userId, targetOrganizationId)
    );

    await (prisma as any).auditLog
      .create({
        data: {
          organizationId: targetOrganizationId,
          userId,
          action: 'PRIMARY_ORGANIZATION_UPDATED',
          entity: 'OrganizationMembership',
          entityId: updatedMembership.id,
          newState: sanitizeAuditPayload({
            organizationId: targetOrganizationId,
            isPrimary: true,
          }),
        },
      })
      .catch(() => {});

    return updatedMembership;
  }
}

export const workspaceService = new WorkspaceService();

