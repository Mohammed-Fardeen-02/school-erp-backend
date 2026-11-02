import { organizationsRepository } from './organizations.repository';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  UpdateTenantStatusDto,
  OrganizationQueryFilters,
  UpdateModulesDto,
} from './organizations.types';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { validateModuleDependencies } from '../../shared/constants/modules';
import { prisma } from '../../core/database/prisma-client';
import { sanitizeAuditPayload } from '../../core/security/audit-sanitizer';

export class OrganizationsService {
  async getOrganizations(filters: OrganizationQueryFilters) {
    return organizationsRepository.findAll(filters);
  }

  async getOrganizationById(id: string, callerOrgId?: string, isPlatformUser: boolean = false) {
    // Tenant users cannot inspect another organization by ID
    if (!isPlatformUser && callerOrgId && callerOrgId !== id) {
      throw AppError.forbidden(
        'Cross-tenant access forbidden. You cannot access details of another organization.',
        ErrorCode.TENANT_ACCESS_DENIED
      );
    }

    const org = await organizationsRepository.findById(id);
    if (!org) {
      throw AppError.notFound('Organization not found', ErrorCode.TENANT_NOT_FOUND);
    }

    return org;
  }

  async createOrganization(data: CreateOrganizationDto, adminUserId: string) {
    // 1. Check uniqueness of organization code
    const existingCode = await organizationsRepository.findByCode(data.code);
    if (existingCode) {
      throw AppError.conflict(
        `Organization code '${data.code}' is already registered. Please use a unique code.`,
        ErrorCode.CONFLICT
      );
    }

    // 2. Execute atomic provisioning transaction
    const result = await organizationsRepository.createWithProvisioning(data);

    // 3. Create Audit Log entry
    await (prisma as any).auditLog.create({
      data: {
        organizationId: result.organization.id,
        userId: adminUserId,
        action: 'ORGANIZATION_PROVISIONED',
        entity: 'Organization',
        entityId: result.organization.id,
        newState: sanitizeAuditPayload({
          code: result.organization.code,
          legalName: result.organization.legalName,
          status: result.organization.status,
          mainCampus: result.mainCampus.code,
          subscriptionPlan: result.organization.subscriptionPlan,
        }),
      },
    }).catch(() => {});

    return result;
  }

  async updateOrganization(
    id: string,
    data: UpdateOrganizationDto,
    callerOrgId?: string,
    isPlatformUser: boolean = false,
    actorUserId?: string
  ) {
    if (!isPlatformUser && callerOrgId && callerOrgId !== id) {
      throw AppError.forbidden(
        'Cross-tenant modification forbidden',
        ErrorCode.TENANT_ACCESS_DENIED
      );
    }

    const existing = await organizationsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Organization not found', ErrorCode.TENANT_NOT_FOUND);
    }

    if (existing.status === 'ARCHIVED') {
      throw AppError.forbidden(
        'Archived organizations cannot be modified',
        ErrorCode.TENANT_ACCESS_DENIED
      );
    }

    const updated = await organizationsRepository.update(id, data);

    if (actorUserId) {
      await (prisma as any).auditLog.create({
        data: {
          organizationId: id,
          userId: actorUserId,
          action: 'ORGANIZATION_UPDATED',
          entity: 'Organization',
          entityId: id,
          previousState: sanitizeAuditPayload(existing),
          newState: sanitizeAuditPayload(updated),
        },
      }).catch(() => {});
    }

    return updated;
  }

  async updateStatus(id: string, dto: UpdateTenantStatusDto, adminUserId: string) {
    const existing = await organizationsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Organization not found', ErrorCode.TENANT_NOT_FOUND);
    }

    if (existing.status === 'ARCHIVED') {
      throw AppError.badRequest(
        'Organization is permanently archived and cannot be transitioned to another status via API.',
        ErrorCode.BAD_REQUEST
      );
    }

    const updated = await organizationsRepository.updateStatus(id, dto.status);

    await (prisma as any).auditLog.create({
      data: {
        organizationId: id,
        userId: adminUserId,
        action: `ORGANIZATION_STATUS_${dto.status}`,
        entity: 'Organization',
        entityId: id,
        previousState: { status: existing.status },
        newState: { status: dto.status, reason: dto.reason },
      },
    }).catch(() => {});

    return updated;
  }

  async getModules(id: string, callerOrgId?: string, isPlatformUser: boolean = false) {
    if (!isPlatformUser && callerOrgId && callerOrgId !== id) {
      throw AppError.forbidden(
        'Cross-tenant access forbidden',
        ErrorCode.TENANT_ACCESS_DENIED
      );
    }

    return organizationsRepository.getModules(id);
  }

  async updateModules(id: string, dto: UpdateModulesDto, adminUserId: string) {
    const existing = await organizationsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Organization not found', ErrorCode.TENANT_NOT_FOUND);
    }

    // Validate transitive dependencies
    const dependencyError = validateModuleDependencies(dto.modules);
    if (dependencyError) {
      throw AppError.badRequest(dependencyError, ErrorCode.BAD_REQUEST);
    }

    const previousModules = await organizationsRepository.getModules(id);
    const updatedModules = await organizationsRepository.setModules(id, dto.modules);

    await (prisma as any).auditLog.create({
      data: {
        organizationId: id,
        userId: adminUserId,
        action: 'ORGANIZATION_MODULES_UPDATED',
        entity: 'Organization',
        entityId: id,
        previousState: { modules: previousModules },
        newState: { modules: updatedModules },
      },
    }).catch(() => {});

    return updatedModules;
  }
}

export const organizationsService = new OrganizationsService();

