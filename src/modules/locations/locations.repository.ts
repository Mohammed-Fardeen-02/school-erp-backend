import { prisma } from '../../core/database/prisma-client';
import { CreateLocationDto, UpdateLocationDto, LocationQueryFilters } from './locations.types';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';

export class LocationsRepository {
  private get locClient() {
    return (prisma as any).location;
  }

  /**
   * Dual-key query retrieving all campuses strictly belonging to an organization.
   */
  async findByOrganization(organizationId: string, filters?: LocationQueryFilters) {
    const where: any = { organizationId };

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
      ];
    }

    return this.locClient.findMany({
      where,
      orderBy: [{ isMainCampus: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Dual-key query ensuring a location belongs to the target organization.
   */
  async findById(id: string, organizationId: string) {
    return this.locClient.findFirst({
      where: { id, organizationId },
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

  /**
   * Concurrency-safe location creation with parent row-level locking.
   * Acquires SELECT ... FOR UPDATE on organization to guarantee serial quota evaluation.
   */
  async createWithQuotaLock(organizationId: string, data: CreateLocationDto) {
    return prisma.$transaction(async (tx: any) => {
      // 1. Acquire exclusive write lock on parent organization row (TEXT binding)
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

      // 2. Count active campuses only (PO Decision Option A)
      const activeCount = await tx.location.count({
        where: { organizationId, isActive: true },
      });

      if (activeCount >= org.max_locations) {
        throw AppError.badRequest(
          `Location quota reached. Your plan allows a maximum of ${org.max_locations} active campuses. Deactivate an existing campus or upgrade your plan.`,
          ErrorCode.BAD_REQUEST
        );
      }

      // 3. Insert new location
      return tx.location.create({
        data: {
          organizationId,
          code: data.code,
          name: data.name,
          locationType: data.locationType || 'BRANCH_CAMPUS',
          isMainCampus: false, // Additional locations are branch campuses by default
          isActive: true,
          email: data.email || null,
          phone: data.phone || null,
          principalName: data.principalName || null,
          addressLine1: data.addressLine1 || null,
          addressLine2: data.addressLine2 || null,
          city: data.city || null,
          state: data.state || null,
          country: data.country || 'IN',
          postalCode: data.postalCode || null,
          latitude: data.latitude || null,
          longitude: data.longitude || null,
        },
      });
    });
  }

  /**
   * Updates campus metadata using dual-key scoping.
   */
  async update(id: string, organizationId: string, data: UpdateLocationDto) {
    return this.locClient.updateMany({
      where: { id, organizationId },
      data,
    });
  }

  /**
   * Atomically switches designated main campus under parent row lock.
   */
  async setMainCampus(organizationId: string, targetLocationId: string) {
    return prisma.$transaction(async (tx: any) => {
      // 1. Acquire exclusive write lock on parent organization row
      const [org] = await tx.$queryRaw`
        SELECT id, status 
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

      // 2. Validate target location exists, belongs to organization, and is active
      const target = await tx.location.findFirst({
        where: { id: targetLocationId, organizationId },
      });

      if (!target) {
        throw AppError.notFound('Location not found in this organization', ErrorCode.NOT_FOUND);
      }

      if (!target.isActive) {
        throw AppError.badRequest(
          'Cannot designate an inactive campus as the main campus',
          ErrorCode.BAD_REQUEST
        );
      }

      if (target.isMainCampus) {
        return target;
      }

      // 3. Demote previous main campus
      await tx.location.updateMany({
        where: { organizationId, isMainCampus: true },
        data: { isMainCampus: false },
      });

      // 4. Promote target location
      return tx.location.update({
        where: { id: targetLocationId },
        data: { isMainCampus: true },
      });
    });
  }

  /**
   * Activates or deactivates a campus under parent row lock.
   * Enforces main-campus deactivation block and quota limits on reactivation.
   */
  async toggleStatus(id: string, organizationId: string, isActive: boolean) {
    return prisma.$transaction(async (tx: any) => {
      // 1. Lock parent organization row
      const [org] = await tx.$queryRaw`
        SELECT max_locations, status 
        FROM organization.organizations 
        WHERE id = ${organizationId} 
        FOR UPDATE
      `;

      if (!org) {
        throw AppError.notFound('Organization not found', ErrorCode.TENANT_NOT_FOUND);
      }

      const location = await tx.location.findFirst({
        where: { id, organizationId },
      });

      if (!location) {
        throw AppError.notFound('Location not found in this organization', ErrorCode.NOT_FOUND);
      }

      // 2. If deactivating, prevent deactivating designated main campus
      if (!isActive) {
        if (location.isMainCampus) {
          throw AppError.badRequest(
            'Cannot deactivate the designated main campus. Please designate another active campus as main campus first.',
            ErrorCode.BAD_REQUEST
          );
        }
      } else {
        // 3. If activating, enforce location quota
        const activeCount = await tx.location.count({
          where: { organizationId, isActive: true },
        });

        if (activeCount >= org.max_locations) {
          throw AppError.badRequest(
            `Location quota reached. Your plan allows a maximum of ${org.max_locations} active campuses.`,
            ErrorCode.BAD_REQUEST
          );
        }
      }

      // 4. Update status
      return tx.location.update({
        where: { id },
        data: { isActive },
      });
    });
  }
}

export const locationsRepository = new LocationsRepository();

