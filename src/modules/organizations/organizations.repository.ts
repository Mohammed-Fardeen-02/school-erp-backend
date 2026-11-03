import { prisma } from '../../core/database/prisma-client';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  OrganizationQueryFilters,
  TenantStatus,
} from './organizations.types';
import { ModuleId, SUBSCRIPTION_PLAN_MODULES } from '../../shared/constants/modules';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { hashPassword, generateBootstrapPassword } from '../../core/security/password';

export class OrganizationsRepository {
  private get orgClient() {
    return (prisma as any).organization;
  }


  private get modClient() {
    return (prisma as any).organizationModule;
  }


  async findAll(filters: OrganizationQueryFilters) {
    const { search, status, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { legalName: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.orgClient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              locations: true,
              memberships: true,
              modules: true,
            },
          },
        },
      }),
      this.orgClient.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    return this.orgClient.findUnique({
      where: { id },
      include: {
        locations: {
          where: { isActive: true },
          orderBy: { isMainCampus: 'desc' },
        },
        modules: {
          where: { isEnabled: true },
        },
        _count: {
          select: {
            memberships: true,
            locations: true,
          },
        },
      },
    });
  }

  async findByCode(code: string) {
    return this.orgClient.findUnique({
      where: { code },
    });
  }

  /**
   * Atomically provisions an organization, its initial main campus, module subscriptions,
   * and optional initial tenant OWNER administrator in a single database transaction.
   */
  async createWithProvisioning(data: CreateOrganizationDto) {
    return prisma.$transaction(async (tx: any) => {
      // 1. Calculate status and trial date
      const isTrial = !!data.trialDays;
      const initialStatus: TenantStatus = isTrial ? 'TRIAL' : 'ACTIVE';
      const trialEndsAt = data.trialDays
        ? new Date(Date.now() + data.trialDays * 24 * 60 * 60 * 1000)
        : null;

      // 2. Create Organization record
      const organization = await tx.organization.create({
        data: {
          code: data.code,
          legalName: data.legalName,
          displayName: data.displayName,
          organizationType: data.organizationType || 'K12_SCHOOL_CHAIN',
          status: initialStatus,
          email: data.email,
          phone: data.phone,
          website: data.website || null,
          taxId: data.taxId || null,
          registrationNo: data.registrationNo || null,
          addressLine1: data.addressLine1 || null,
          addressLine2: data.addressLine2 || null,
          city: data.city || null,
          state: data.state || null,
          country: data.country || 'IN',
          postalCode: data.postalCode || null,
          timezone: data.timezone || 'Asia/Kolkata',
          currency: data.currency || 'INR',
          subscriptionPlan: data.subscriptionPlan || 'STANDARD',
          maxLocations: data.maxLocations || 5,
          maxUsers: data.maxUsers || 500,
          maxStudents: data.maxStudents || 2000,
          trialEndsAt,
          logoUrl: data.logoUrl || null,
          brandColor: data.brandColor || null,
        },
      });

      // 3. Atomically create the mandatory initial Main Campus
      const mainCampusCode = data.initialMainCampusCode || `${data.code}-MAIN`;
      const mainCampusName = data.initialMainCampusName || `${data.displayName} - Main Campus`;

      const mainCampus = await tx.location.create({
        data: {
          organizationId: organization.id,
          code: mainCampusCode,
          name: mainCampusName,
          locationType: 'MAIN_CAMPUS',
          isMainCampus: true,
          isActive: true,
          email: data.email,
          phone: data.phone,
          addressLine1: data.addressLine1 || null,
          addressLine2: data.addressLine2 || null,
          city: data.city || null,
          state: data.state || null,
          country: data.country || 'IN',
          postalCode: data.postalCode || null,
        },
      });

      // 4. Provision default module entitlements for chosen subscription plan
      const planName = data.subscriptionPlan || 'STANDARD';
      const defaultModules = SUBSCRIPTION_PLAN_MODULES[planName] || SUBSCRIPTION_PLAN_MODULES.STANDARD || [];

      for (const moduleId of defaultModules) {
        await tx.organizationModule.create({
          data: {
            organizationId: organization.id,
            moduleId,
            isEnabled: true,
          },
        });
      }

      // 5. Optionally provision initial tenant OWNER user
      let ownerCredentials: { email: string; oneTimePassword?: string } | null = null;
      if (data.ownerEmail) {
        const ownerEmail = data.ownerEmail.trim().toLowerCase();
        let ownerUser = await tx.user.findUnique({
          where: { email: ownerEmail },
        });

        if (!ownerUser) {
          const generatedPass = generateBootstrapPassword(24);
          const passwordHash = await hashPassword(generatedPass);

          ownerUser = await tx.user.create({
            data: {
              email: ownerEmail,
              passwordHash,
              firstName: data.ownerFirstName || 'Tenant',
              lastName: data.ownerLastName || 'Administrator',
              userType: 'TENANT',
              isActive: true,
              mustChangePassword: true,
              tokenVersion: 1,
            },
          });

          ownerCredentials = { email: ownerEmail, oneTimePassword: generatedPass };
        }

        // Create membership as OWNER
        await tx.organizationMembership.create({
          data: {
            userId: ownerUser.id,
            organizationId: organization.id,
            accessLevel: 'OWNER',
            membershipType: 'STAFF',
            status: 'ACTIVE',
            jobTitle: 'Institutional Founder / Director',
            isPrimary: true,
          },
        });
      }

      return {
        organization,
        mainCampus,
        enabledModules: defaultModules,
        ownerCredentials,
      };
    });
  }

  async update(id: string, data: UpdateOrganizationDto) {
    return this.orgClient.update({
      where: { id },
      data,
    });
  }

  async updateStatus(id: string, status: TenantStatus) {
    return prisma.$transaction(async (tx: any) => {
      // If activating an organization, assert exactly one active main campus exists
      if (status === 'ACTIVE') {
        const mainCampusCount = await tx.location.count({
          where: {
            organizationId: id,
            isMainCampus: true,
            isActive: true,
          },
        });

        if (mainCampusCount !== 1) {
          throw AppError.badRequest(
            'Cannot activate organization without exactly one active main campus designated.',
            ErrorCode.BAD_REQUEST
          );
        }
      }

      return tx.organization.update({
        where: { id },
        data: { status },
      });
    });
  }

  async getModules(organizationId: string): Promise<ModuleId[]> {
    const modules = await this.modClient.findMany({
      where: { organizationId, isEnabled: true },
      select: { moduleId: true },
    });
    return modules.map((m: any) => m.moduleId as ModuleId);
  }

  async setModules(organizationId: string, modules: ModuleId[]) {
    return prisma.$transaction(async (tx: any) => {
      // 1. Delete all current module entitlements for this organization
      await tx.organizationModule.deleteMany({
        where: { organizationId },
      });

      // 2. Insert new module entitlements
      const entries = modules.map(moduleId => ({
        organizationId,
        moduleId,
        isEnabled: true,
      }));

      await tx.organizationModule.createMany({
        data: entries,
      });

      return modules;
    });
  }
}

export const organizationsRepository = new OrganizationsRepository();

