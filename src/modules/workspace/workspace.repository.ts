import { prisma } from '../../core/database/prisma-client';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { UserOrganizationSummary } from './workspace.types';

export class WorkspaceRepository {
  private get membershipClient() {
    return (prisma as any).organizationMembership;
  }


  private get locClient() {
    return (prisma as any).location;
  }

  private get moduleClient() {
    return (prisma as any).organizationModule;
  }

  /**
   * Retrieves all active organizations the user belongs to, including active campuses.
   * Filters out ARCHIVED organizations.
   */
  async getUserOrganizations(userId: string): Promise<UserOrganizationSummary[]> {
    const memberships = await this.membershipClient.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        organization: {
          status: {
            not: 'ARCHIVED',
          },
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            code: true,
            displayName: true,
            legalName: true,
            organizationType: true,
            status: true,
            logoUrl: true,
            trialEndsAt: true,
            locations: {
              where: { isActive: true },
              select: {
                id: true,
                code: true,
                name: true,
                locationType: true,
                isMainCampus: true,
                isActive: true,
              },
              orderBy: [{ isMainCampus: 'desc' }, { name: 'asc' }],
            },
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return memberships.map((m: any) => ({
      id: m.organization.id,
      code: m.organization.code,
      displayName: m.organization.displayName,
      legalName: m.organization.legalName,
      organizationType: m.organization.organizationType,
      status: m.organization.status,
      logoUrl: m.organization.logoUrl,
      isPrimary: m.isPrimary,
      accessLevel: m.accessLevel,
      membershipType: m.membershipType,
      campuses: m.organization.locations,
    }));
  }

  /**
   * Finds a specific user membership in an organization.
   */
  async findMembership(userId: string, organizationId: string) {
    return this.membershipClient.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      include: {
        organization: true,
      },
    });
  }

  /**
   * Concurrency-safe primary organization preference update under user row lock.
   */
  async setPrimaryOrganization(userId: string, targetOrganizationId: string) {
    return prisma.$transaction(async (tx: any) => {
      // 1. Lock the user row to serialize primary preferences
      const [user] = await tx.$queryRaw`
        SELECT id FROM auth.users 
        WHERE id = ${userId} 
        FOR UPDATE
      `;

      if (!user) {
        throw AppError.notFound('User not found', ErrorCode.USER_NOT_FOUND);
      }

      // 2. Validate membership in target organization
      const targetMembership = await tx.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: targetOrganizationId,
            userId,
          },
        },
        include: {
          organization: true,
        },
      });

      if (!targetMembership || targetMembership.status !== 'ACTIVE') {
        throw AppError.forbidden(
          'You do not have an active membership in this organization',
          ErrorCode.TENANT_ACCESS_DENIED
        );
      }

      if (targetMembership.organization.status === 'ARCHIVED') {
        throw AppError.forbidden(
          'Cannot select an archived organization as primary',
          ErrorCode.TENANT_ACCESS_DENIED
        );
      }

      if (targetMembership.isPrimary) {
        return targetMembership;
      }

      // 3. Clear existing primary preference
      await tx.organizationMembership.updateMany({
        where: {
          userId,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });

      // 4. Set target as primary
      return tx.organizationMembership.update({
        where: {
          id: targetMembership.id,
        },
        data: {
          isPrimary: true,
        },
      });
    });
  }

  /**
   * Resolves designated main campus or verifies requested location ID.
   */
  async resolveLocation(organizationId: string, locationId?: string) {
    if (locationId) {
      const loc = await this.locClient.findFirst({
        where: {
          id: locationId,
          organizationId,
          isActive: true,
        },
      });

      if (!loc) {
        throw AppError.notFound(
          'Specified campus not found or is inactive in this organization',
          ErrorCode.NOT_FOUND
        );
      }
      return loc;
    }

    // Default to main campus
    const mainCampus = await this.locClient.findFirst({
      where: {
        organizationId,
        isMainCampus: true,
        isActive: true,
      },
    });

    if (!mainCampus) {
      // Fallback to any active campus
      return this.locClient.findFirst({
        where: {
          organizationId,
          isActive: true,
        },
      });
    }

    return mainCampus;
  }

  /**
   * Retrieves list of active enabled module codes for an organization.
   */
  async getEnabledModules(organizationId: string): Promise<string[]> {
    const modules = await this.moduleClient.findMany({
      where: {
        organizationId,
        isEnabled: true,
      },
      select: {
        moduleId: true,
      },
    });

    return modules.map((m: any) => m.moduleId);
  }
}

export const workspaceRepository = new WorkspaceRepository();

