import { prisma } from '../../core/database/prisma-client';
import { CreateBranchDto, UpdateBranchDto, BranchQueryFilters } from './branches.types';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';

export class BranchesRepository {
  private get locClient() {
    return (prisma as any).location;
  }

  async findByOrganization(organizationId: string, filters?: BranchQueryFilters) {
    const targetOrg = filters?.organizationId || organizationId;
    const where: any = targetOrg === 'platform-control' ? {} : { organizationId: targetOrg };

    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters?.locationType) {
      where.locationType = filters.locationType;
    }

    if (filters?.search) {
      where.OR = [
        { code: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
        { city: { contains: filters.search, mode: 'insensitive' } },
        { principalName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.locClient.findMany({
      where,
      orderBy: [{ isMainCampus: 'desc' }, { createdAt: 'asc' }],
      include: {
        organization: {
          select: {
            id: true,
            code: true,
            displayName: true,
            status: true,
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
    });
  }

  async findById(id: string, organizationId: string) {
    const where: any = organizationId === 'platform-control' ? { id } : { id, organizationId };
    return this.locClient.findFirst({
      where,
      include: {
        organization: {
          select: {
            id: true,
            code: true,
            displayName: true,
            status: true,
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
        userRoles: {
          where: { isActive: true },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                isActive: true,
              },
            },
            role: {
              select: {
                id: true,
                roleName: true,
                roleCode: true,
                roleType: true,
              },
            },
          },
        },
      },
    });
  }

  async findByCode(organizationId: string, code: string) {
    return this.locClient.findUnique({
      where: {
        organizationId_code: {
          organizationId,
          code,
        },
      },
    });
  }

  async createWithQuotaLock(organizationId: string, data: CreateBranchDto) {
    return prisma.$transaction(async (tx: any) => {
      // 1. Row-level lock on organization
      const [org] = await tx.$queryRaw`
        SELECT max_locations, status 
        FROM organization.organizations 
        WHERE id = ${organizationId} 
        FOR UPDATE
      `;

      if (!org) {
        throw AppError.notFound('Organization not found', ErrorCode.TENANT_NOT_FOUND);
      }

      if (org.status !== 'ACTIVE' && org.status !== 'TRIAL') {
        throw AppError.forbidden(
          'Organization is not in an active operational state',
          ErrorCode.TENANT_ACCESS_DENIED
        );
      }

      // 2. Count active locations
      const activeCount = await tx.location.count({
        where: { organizationId, isActive: true },
      });

      if (activeCount >= org.max_locations) {
        throw AppError.badRequest(
          `Branch quota exceeded. Maximum allowed branches for this organization is ${org.max_locations}.`,
          ErrorCode.BAD_REQUEST
        );
      }

      // 3. If new branch is designated as main campus, demote current main
      if (data.isMainCampus) {
        await tx.location.updateMany({
          where: { organizationId, isMainCampus: true },
          data: { isMainCampus: false },
        });
      }

      const branchCode = data.code!.slice(0, 50);
      const branchName = data.name.slice(0, 150);

      // 4. Create branch location
      return tx.location.create({
        data: {
          organizationId,
          code: branchCode,
          name: branchName,
          locationType: data.locationType || 'BRANCH_CAMPUS',
          isMainCampus: data.isMainCampus ?? false,
          isActive: true,
          email: data.email?.trim() || null,
          phone: data.phone?.trim() || null,
          principalName: data.principalName?.trim() || null,
          addressLine1: data.addressLine1?.trim() || null,
          addressLine2: data.addressLine2?.trim() || null,
          city: data.city?.trim() || null,
          state: data.state?.trim() || null,
          country: (data.country?.trim() || 'IN').slice(0, 100),
          postalCode: data.postalCode?.trim() || null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
        },
        include: {
          organization: {
            select: {
              id: true,
              code: true,
              displayName: true,
              status: true,
            },
          },
        },
      });
    });
  }

  async update(id: string, organizationId: string, data: UpdateBranchDto) {
    const where: any = organizationId === 'platform-control' ? { id } : { id, organizationId };
    return this.locClient.update({
      where,
      data: {
        ...(data.name ? { name: data.name.slice(0, 150) } : {}),
        ...(data.locationType ? { locationType: data.locationType } : {}),
        ...(data.email !== undefined ? { email: data.email?.trim() || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
        ...(data.principalName !== undefined ? { principalName: data.principalName?.trim() || null } : {}),
        ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1?.trim() || null } : {}),
        ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2?.trim() || null } : {}),
        ...(data.city !== undefined ? { city: data.city?.trim() || null } : {}),
        ...(data.state !== undefined ? { state: data.state?.trim() || null } : {}),
        ...(data.country !== undefined ? { country: (data.country?.trim() || 'IN').slice(0, 100) } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode?.trim() || null } : {}),
        ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
        ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
      },
      include: {
        organization: {
          select: {
            id: true,
            code: true,
            displayName: true,
            status: true,
          },
        },
      },
    });
  }

  async setMainBranch(id: string, organizationId: string) {
    return prisma.$transaction(async (tx: any) => {
      const target = await tx.location.findFirst({
        where: { id, organizationId },
      });

      if (!target) {
        throw AppError.notFound('Branch not found in this organization', ErrorCode.NOT_FOUND);
      }

      if (!target.isActive) {
        throw AppError.badRequest('Cannot designate an inactive branch as main campus', ErrorCode.BAD_REQUEST);
      }

      // Demote current main
      await tx.location.updateMany({
        where: { organizationId, isMainCampus: true },
        data: { isMainCampus: false },
      });

      // Promote target
      return tx.location.update({
        where: { id },
        data: {
          isMainCampus: true,
          locationType: 'MAIN_CAMPUS',
        },
      });
    });
  }

  async toggleStatus(id: string, organizationId: string, isActive: boolean) {
    const where: any = organizationId === 'platform-control' ? { id } : { id, organizationId };
    return this.locClient.update({
      where,
      data: { isActive },
    });
  }

  async delete(id: string, organizationId: string) {
    const where: any = organizationId === 'platform-control' ? { id } : { id, organizationId };
    // Check if main campus
    const target = await this.locClient.findFirst({ where });
    if (!target) {
      throw AppError.notFound('Branch not found', ErrorCode.NOT_FOUND);
    }
    if (target.isMainCampus) {
      throw AppError.badRequest('Cannot delete the primary main campus branch', ErrorCode.BAD_REQUEST);
    }

    try {
      return await this.locClient.delete({ where: { id: target.id } });
    } catch {
      // Soft-delete if relational dependencies exist
      return await this.locClient.update({
        where: { id: target.id },
        data: { isActive: false },
      });
    }
  }
}

export const branchesRepository = new BranchesRepository();
