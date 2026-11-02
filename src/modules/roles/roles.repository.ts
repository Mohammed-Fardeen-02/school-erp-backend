import { PrismaClient, Role, RoleType, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../core/database/prisma-client';
import { recordInvalidationEvent, processPendingInvalidations } from '../../core/authorization/invalidation-outbox.worker';
import { effectivePermissionsService } from '../../core/authorization/effective-permissions.service';
import { sanitizeAuditPayload } from '../../core/security/audit-sanitizer';
import {
  RoleResponseDto,
  RoleFilterOptions,
  UpdateRoleDto,
  CloneTemplateDto,
  AuditContext,
} from './roles.types';

export class RolesRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Lists roles accessible to the organization (System Templates + Tenant Custom Roles).
   */
  async listRoles(
    organizationId: string,
    filters: RoleFilterOptions
  ): Promise<{ roles: RoleResponseDto[]; total: number }> {
    const whereClause: Prisma.RoleWhereInput = {
      OR: [
        { organizationId: null, roleType: RoleType.SYSTEM_TEMPLATE },
        { organizationId, roleType: RoleType.CUSTOM },
      ],
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      ...(filters.roleType !== undefined && { roleType: filters.roleType }),
      ...(filters.search && {
        OR: [
          { roleName: { contains: filters.search, mode: 'insensitive' } },
          { roleCode: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    };

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      (this.prisma as any).role.findMany({
        where: whereClause,
        include: {
          _count: {
            select: {
              permissions: true,
              userRoles: true,
            },
          },
        },
        orderBy: [{ roleType: 'asc' }, { roleCode: 'asc' }],
        skip,
        take: limit,
      }),
      (this.prisma as any).role.count({ where: whereClause }),
    ]);

    const roles: RoleResponseDto[] = records.map((r: any) => ({
      id: r.id,
      organizationId: r.organizationId,
      roleCode: r.roleCode,
      roleName: r.roleName,
      description: r.description,
      roleType: r.roleType,
      isActive: r.isActive,
      permissionCount: r._count?.permissions || 0,
      userCount: r._count?.userRoles || 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return { roles, total };
  }

  /**
   * Resolves a role by ID if it is a System Template or belongs to this organization.
   */
  async findRoleById(roleId: string, organizationId: string): Promise<any | null> {
    return (this.prisma as any).role.findFirst({
      where: {
        id: roleId,
        OR: [{ organizationId: null }, { organizationId }],
      },
      include: {
        permissions: {
          include: {
            node: true,
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

  /**
   * Checks whether a custom role with roleCode exists within the active organization.
   */
  async findCustomRoleByCode(roleCode: string, organizationId: string): Promise<Role | null> {
    return (this.prisma as any).role.findFirst({
      where: {
        roleCode,
        organizationId,
      },
    });
  }

  /**
   * Checks whether a user currently has an active assignment for this role.
   */
  async findActiveUserAssignment(
    userId: string,
    roleId: string,
    organizationId: string
  ): Promise<any | null> {
    return (this.prisma as any).userRole.findFirst({
      where: {
        userId,
        roleId,
        organizationId,
        isActive: true,
      },
    });
  }

  /**
   * Counts existing user assignments (including historical/revoked) for a role.
   */
  async countRoleAssignments(roleId: string): Promise<number> {
    return (this.prisma as any).userRole.count({
      where: { roleId },
    });
  }

  /**
   * Creates a new tenant custom role with optional initial permissions inside a transaction.
   */
  async createCustomRole(
    organizationId: string,
    roleData: { roleCode: string; roleName: string; description?: string },
    resolvedPermissions: Array<{ nodeId: string; isGranted: boolean }>,
    audit: AuditContext
  ): Promise<any> {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Insert Role
      const role = await (tx as any).role.create({
        data: {
          organizationId,
          roleCode: roleData.roleCode,
          roleName: roleData.roleName,
          description: roleData.description || null,
          roleType: RoleType.CUSTOM,
          isActive: true,
        },
      });

      // 2. Insert Permissions if provided
      if (resolvedPermissions.length > 0) {
        await (tx as any).rolePermission.createMany({
          data: resolvedPermissions.map((p) => ({
            roleId: role.id,
            nodeId: p.nodeId,
            isGranted: p.isGranted,
          })),
        });
      }

      // 3. Transactional Outbox Event
      await recordInvalidationEvent(tx, {
        eventType: 'ROLE_CREATED',
        organizationId,
      });

      // 4. Audit Log
      await (tx as any).auditLog.create({
        data: {
          organizationId,
          userId: audit.actorUserId,
          action: 'ROLE_CREATED',
          entity: 'Role',
          entityId: role.id,
          newState: sanitizeAuditPayload({
            id: role.id,
            roleCode: role.roleCode,
            roleName: role.roleName,
            permissionsCount: resolvedPermissions.length,
          }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });

      return role;
    });

    // Asynchronous cache invalidation
    processPendingInvalidations().catch(() => {});
    effectivePermissionsService.invalidateOrgCache(organizationId).catch(() => {});

    return result;
  }

  /**
   * Updates metadata for an existing custom role.
   */
  async updateCustomRole(
    roleId: string,
    organizationId: string,
    data: UpdateRoleDto,
    previousState: any,
    audit: AuditContext
  ): Promise<any> {
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await (tx as any).role.update({
        where: { id: roleId },
        data: {
          ...(data.roleName !== undefined && { roleName: data.roleName }),
          ...(data.description !== undefined && { description: data.description }),
        },
      });

      await recordInvalidationEvent(tx, {
        eventType: 'ROLE_UPDATED',
        organizationId,
      });

      await (tx as any).auditLog.create({
        data: {
          organizationId,
          userId: audit.actorUserId,
          action: 'ROLE_UPDATED',
          entity: 'Role',
          entityId: roleId,
          previousState: sanitizeAuditPayload(previousState),
          newState: sanitizeAuditPayload({
            roleName: updated.roleName,
            description: updated.description,
          }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });

      return updated;
    });

    processPendingInvalidations().catch(() => {});
    effectivePermissionsService.invalidateOrgCache(organizationId).catch(() => {});

    return result;
  }

  /**
   * Toggles role activation status.
   */
  async toggleRoleStatus(
    roleId: string,
    organizationId: string,
    isActive: boolean,
    previousState: any,
    audit: AuditContext
  ): Promise<any> {
    const eventType = isActive ? 'ROLE_ACTIVATED' : 'ROLE_DEACTIVATED';

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await (tx as any).role.update({
        where: { id: roleId },
        data: { isActive },
      });

      await recordInvalidationEvent(tx, {
        eventType,
        organizationId,
      });

      await (tx as any).auditLog.create({
        data: {
          organizationId,
          userId: audit.actorUserId,
          action: eventType,
          entity: 'Role',
          entityId: roleId,
          previousState: sanitizeAuditPayload({ isActive: previousState.isActive }),
          newState: sanitizeAuditPayload({ isActive: updated.isActive }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });

      return updated;
    });

    processPendingInvalidations().catch(() => {});
    effectivePermissionsService.invalidateOrgCache(organizationId).catch(() => {});

    return result;
  }

  /**
   * Clones an active SYSTEM_TEMPLATE into a tenant-owned CUSTOM role.
   */
  async cloneTemplateToCustom(
    templateId: string,
    organizationId: string,
    cloneData: CloneTemplateDto,
    templatePermissions: Array<{ nodeId: string; isGranted: boolean }>,
    audit: AuditContext
  ): Promise<any> {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create custom role
      const customRole = await (tx as any).role.create({
        data: {
          organizationId,
          roleCode: cloneData.roleCode,
          roleName: cloneData.roleName,
          description: cloneData.description || null,
          roleType: RoleType.CUSTOM,
          isActive: true,
        },
      });

      // 2. Copy permission matrix
      if (templatePermissions.length > 0) {
        await (tx as any).rolePermission.createMany({
          data: templatePermissions.map((p) => ({
            roleId: customRole.id,
            nodeId: p.nodeId,
            isGranted: p.isGranted,
          })),
        });
      }

      // 3. Outbox event
      await recordInvalidationEvent(tx, {
        eventType: 'ROLE_CREATED',
        organizationId,
      });

      // 4. Audit log
      await (tx as any).auditLog.create({
        data: {
          organizationId,
          userId: audit.actorUserId,
          action: 'ROLE_CLONED',
          entity: 'Role',
          entityId: customRole.id,
          newState: sanitizeAuditPayload({
            clonedFromTemplateId: templateId,
            newRoleId: customRole.id,
            roleCode: customRole.roleCode,
            copiedGrantsCount: templatePermissions.length,
          }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });

      return customRole;
    });

    processPendingInvalidations().catch(() => {});
    effectivePermissionsService.invalidateOrgCache(organizationId).catch(() => {});

    return result;
  }

  /**
   * Deletes custom role if 0 assignments exist; otherwise archives role non-destructively.
   */
  async deleteOrArchiveRole(
    roleId: string,
    organizationId: string,
    hasAssignments: boolean,
    previousState: any,
    audit: AuditContext
  ): Promise<{ action: 'DELETED' | 'ARCHIVED' }> {
    const action = hasAssignments ? 'ARCHIVED' : 'DELETED';
    const eventType = hasAssignments ? 'ROLE_ARCHIVED' : 'ROLE_DELETED';

    await this.prisma.$transaction(async (tx) => {
      if (hasAssignments) {
        // Soft archival to preserve historical UserRole references and satisfy onDelete: Restrict
        await (tx as any).role.update({
          where: { id: roleId },
          data: {
            isActive: false,
          },
        });
      } else {
        // Safe hard delete: delete role_permissions then role
        await (tx as any).rolePermission.deleteMany({
          where: { roleId },
        });
        await (tx as any).role.delete({
          where: { id: roleId },
        });
      }

      await recordInvalidationEvent(tx, {
        eventType,
        organizationId,
      });

      await (tx as any).auditLog.create({
        data: {
          organizationId,
          userId: audit.actorUserId,
          action: eventType,
          entity: 'Role',
          entityId: roleId,
          previousState: sanitizeAuditPayload({
            roleCode: previousState.roleCode,
            isActive: previousState.isActive,
          }),
          newState: sanitizeAuditPayload({
            status: action,
            hasHistoricalAssignments: hasAssignments,
          }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });
    });

    processPendingInvalidations().catch(() => {});
    effectivePermissionsService.invalidateOrgCache(organizationId).catch(() => {});

    return { action };
  }

  /**
   * Atomically updates a role's permission matrix via differential upsert and delete.
   */
  async updateRolePermissions(
    roleId: string,
    organizationId: string,
    submittedGrants: Array<{ nodeId: string; isGranted: boolean | null }>,
    previousGrants: Array<{ nodeId: string; isGranted: boolean }>,
    audit: AuditContext
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Process each submitted capability grant (null = delete override, boolean = upsert)
      for (const item of submittedGrants) {
        if (item.isGranted === null) {
          await (tx as any).rolePermission.deleteMany({
            where: {
              roleId,
              nodeId: item.nodeId,
            },
          });
        } else {
          await (tx as any).rolePermission.upsert({
            where: {
              roleId_nodeId: {
                roleId,
                nodeId: item.nodeId,
              },
            },
            update: {
              isGranted: item.isGranted,
            },
            create: {
              roleId,
              nodeId: item.nodeId,
              isGranted: item.isGranted,
            },
          });
        }
      }

      // 2. Record transactional outbox event
      await recordInvalidationEvent(tx, {
        eventType: 'ROLE_PERMISSIONS_UPDATED',
        organizationId,
      });

      // 3. Record audit log
      await (tx as any).auditLog.create({
        data: {
          organizationId,
          userId: audit.actorUserId,
          action: 'ROLE_PERMISSIONS_UPDATED',
          entity: 'RolePermission',
          entityId: roleId,
          previousState: sanitizeAuditPayload({
            grantsCount: previousGrants.length,
          }),
          newState: sanitizeAuditPayload({
            updatedGrantsCount: submittedGrants.length,
          }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });
    });

    // 4. Invalidate Redis version counter immediately
    processPendingInvalidations().catch(() => {});
    effectivePermissionsService.invalidateOrgCache(organizationId).catch(() => {});
  }
}

export const rolesRepository = new RolesRepository();

