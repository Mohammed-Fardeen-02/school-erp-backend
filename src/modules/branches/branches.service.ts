import { branchesRepository } from './branches.repository';
import {
  CreateBranchDto,
  UpdateBranchDto,
  BranchQueryFilters,
  BranchDto,
} from './branches.types';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { withTransactionRetry } from '../../shared/utils/transaction-retry';
import { prisma } from '../../core/database/prisma-client';
import { sanitizeAuditPayload } from '../../core/security/audit-sanitizer';

export class BranchesService {
  /**
   * Generates a unique branch code within the tenant organization.
   */
  async generateUniqueBranchCode(organizationId: string, name: string): Promise<string> {
    const cleanName = (name || 'BR').trim();
    const words = cleanName.split(/\s+/).filter(Boolean);
    let prefix = words.map(w => w[0]).join('').toUpperCase();
    if (prefix.length < 2) {
      prefix = cleanName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
    }
    if (prefix.length < 2) {
      prefix = 'BR';
    }

    // Try incremental code
    for (let i = 1; i <= 99; i++) {
      const code = `${prefix}-${String(i).padStart(2, '0')}`;
      const existing = await branchesRepository.findByCode(organizationId, code);
      if (!existing) {
        return code;
      }
    }

    // Fallback to random 4-digit suffix
    for (let attempt = 0; attempt < 25; attempt++) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const candidate = `${prefix}-${randomSuffix}`;
      const existing = await branchesRepository.findByCode(organizationId, candidate);
      if (!existing) {
        return candidate;
      }
    }

    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }

  async getBranches(organizationId: string, filters?: BranchQueryFilters): Promise<BranchDto[]> {
    return branchesRepository.findByOrganization(organizationId, filters);
  }

  async getBranchById(id: string, organizationId: string): Promise<BranchDto> {
    const branch = await branchesRepository.findById(id, organizationId);
    if (!branch) {
      throw AppError.notFound('Branch not found in this organization', ErrorCode.NOT_FOUND);
    }
    return branch;
  }

  async createBranch(
    organizationId: string,
    data: CreateBranchDto,
    actorUserId: string
  ): Promise<BranchDto> {
    // 1. Resolve or auto-generate unique branch code
    let branchCode = data.code?.trim().toUpperCase();
    if (!branchCode) {
      branchCode = await this.generateUniqueBranchCode(organizationId, data.name);
    } else {
      const existing = await branchesRepository.findByCode(organizationId, branchCode);
      if (existing) {
        throw AppError.conflict(
          `Branch with code '${branchCode}' already exists in this organization.`,
          ErrorCode.CONFLICT
        );
      }
    }

    const payload: CreateBranchDto = {
      ...data,
      code: branchCode,
      name: data.name.trim(),
    };

    // 2. Execute quota-locked creation with retry
    const branch = await withTransactionRetry(() =>
      branchesRepository.createWithQuotaLock(organizationId, payload)
    );

    // 3. Audit Log
    await (prisma as any).auditLog
      .create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'BRANCH_CREATED',
          entity: 'Branch',
          entityId: branch.id,
          newState: sanitizeAuditPayload({
            code: branch.code,
            name: branch.name,
            locationType: branch.locationType,
            isMainCampus: branch.isMainCampus,
          }),
        },
      })
      .catch(() => {});

    return branch;
  }

  async updateBranch(
    id: string,
    organizationId: string,
    data: UpdateBranchDto,
    actorUserId: string
  ): Promise<BranchDto> {
    const existing = await branchesRepository.findById(id, organizationId);
    if (!existing) {
      throw AppError.notFound('Branch not found in this organization', ErrorCode.NOT_FOUND);
    }

    await branchesRepository.update(id, organizationId, data);
    const updated = await branchesRepository.findById(id, organizationId);

    await (prisma as any).auditLog
      .create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'BRANCH_UPDATED',
          entity: 'Branch',
          entityId: id,
          oldState: sanitizeAuditPayload(existing),
          newState: sanitizeAuditPayload(updated),
        },
      })
      .catch(() => {});

    return updated!;
  }

  async setMainBranch(id: string, organizationId: string, actorUserId: string) {
    const updated = await branchesRepository.setMainBranch(id, organizationId);

    await (prisma as any).auditLog
      .create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'MAIN_BRANCH_DESIGNATED',
          entity: 'Branch',
          entityId: id,
          newState: { isMainCampus: true },
        },
      })
      .catch(() => {});

    return updated;
  }

  async toggleStatus(id: string, organizationId: string, isActive: boolean, actorUserId: string) {
    const existing = await branchesRepository.findById(id, organizationId);
    if (!existing) {
      throw AppError.notFound('Branch not found in this organization', ErrorCode.NOT_FOUND);
    }

    if (existing.isMainCampus && !isActive) {
      throw AppError.badRequest(
        'Cannot deactivate the designated main campus branch. Promote another branch first.',
        ErrorCode.BAD_REQUEST
      );
    }

    const updated = await branchesRepository.toggleStatus(id, organizationId, isActive);

    await (prisma as any).auditLog
      .create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'BRANCH_STATUS_TOGGLED',
          entity: 'Branch',
          entityId: id,
          newState: { isActive },
        },
      })
      .catch(() => {});

    return updated;
  }

  async deleteBranch(id: string, organizationId: string, actorUserId: string) {
    const existing = await branchesRepository.findById(id, organizationId);
    if (!existing) {
      throw AppError.notFound('Branch not found in this organization', ErrorCode.NOT_FOUND);
    }

    const res = await branchesRepository.delete(id, organizationId);

    await (prisma as any).auditLog
      .create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'BRANCH_DELETED',
          entity: 'Branch',
          entityId: id,
          oldState: sanitizeAuditPayload(existing),
        },
      })
      .catch(() => {});

    return res;
  }
}

export const branchesService = new BranchesService();
