import { PrismaClient, RoleType } from '@prisma/client';
import { prisma as defaultPrisma } from '../../core/database/prisma-client';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { effectivePermissionsService } from '../../core/authorization/effective-permissions.service';
import { rolesRepository, RolesRepository } from './roles.repository';
import {
  CreateRoleDto,
  UpdateRoleDto,
  CloneTemplateDto,
  UpdateRolePermissionsDto,
  RoleFilterOptions,
  RoleResponseDto,
  RolePermissionsMatrixDto,
  RolePermissionMatrixItem,
  PermissionGrantItem,
  AuditContext,
} from './roles.types';

export class RolesService {
  constructor(
    private readonly repo: RolesRepository = rolesRepository,
    private readonly prisma: PrismaClient = defaultPrisma
  ) {}

  /**
   * Resolves submitted permission nodes (by ID or nodeCode), checks active status,
   * and verifies no duplicates exist in the request payload.
   */
  private async resolveAndValidateNodes(
    items: PermissionGrantItem[]
  ): Promise<Array<{ nodeId: string; nodeCode: string; isGranted: boolean | null }>> {
    const seenNodeIds = new Set<string>();
    const resolved: Array<{ nodeId: string; nodeCode: string; isGranted: boolean | null }> = [];

    for (const item of items) {
      let node: any;
      if (item.nodeId) {
        node = await (this.prisma as any).permissionNode.findUnique({
          where: { id: item.nodeId },
        });
      } else if (item.nodeCode) {
        node = await (this.prisma as any).permissionNode.findUnique({
          where: { nodeCode: item.nodeCode },
        });
      }

      if (!node || !node.isActive) {
        throw new AppError(
          `Permission node not found or inactive: ${item.nodeId || item.nodeCode}`,
          400,
          ErrorCode.BAD_REQUEST
        );
      }

      if (seenNodeIds.has(node.id)) {
        throw new AppError(
          `Duplicate permission node in request payload: ${node.nodeCode}`,
          400,
          ErrorCode.BAD_REQUEST
        );
      }

      seenNodeIds.add(node.id);
      resolved.push({
        nodeId: node.id,
        nodeCode: node.nodeCode,
        isGranted: item.isGranted,
      });
    }

    return resolved;
  }

  /**
   * Enforces Scope-Aware Delegation Ceiling:
   * An administrator can only grant permissions that they themselves actively possess org-wide.
   */
  public async verifyDelegationCeiling(
    actorUserId: string,
    organizationId: string,
    grants: Array<{ nodeCode: string; isGranted: boolean | null }>
  ): Promise<void> {
    const actorEffectivePermissions = await effectivePermissionsService.getEffectivePermissions(
      actorUserId,
      organizationId,
      null // Org-wide scope authority
    );

    const unauthorizedCodes: string[] = [];

    for (const grant of grants) {
      if (grant.isGranted && !actorEffectivePermissions.has(grant.nodeCode)) {
        unauthorizedCodes.push(grant.nodeCode);
      }
    }

    if (unauthorizedCodes.length > 0) {
      throw new AppError(
        `Delegation ceiling violation: You cannot grant permissions you do not actively possess at target scope: [${unauthorizedCodes.join(
          ', '
        )}]`,
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }
  }

  /**
   * Enforces Anti-Self-Modification:
   * Prevents a user from modifying or deactivating a role that is actively assigned to themselves.
   */
  public async verifyAntiSelfModification(
    actorUserId: string,
    organizationId: string,
    roleId: string
  ): Promise<void> {
    const activeAssignment = await this.repo.findActiveUserAssignment(
      actorUserId,
      roleId,
      organizationId
    );

    if (activeAssignment) {
      throw new AppError(
        'Anti-self-modification violation: You cannot modify or alter permissions for a role actively assigned to yourself',
        403,
        ErrorCode.UNAUTHORIZED
      );
    }
  }

  /**
   * Lists roles accessible to the organization.
   */
  async listRoles(
    organizationId: string,
    filters: RoleFilterOptions
  ): Promise<{ roles: RoleResponseDto[]; total: number }> {
    return this.repo.listRoles(organizationId, filters);
  }

  /**
   * Gets details of a single role.
   */
  async getRoleById(roleId: string, organizationId: string): Promise<any> {
    const role = await this.repo.findRoleById(roleId, organizationId);
    if (!role) {
      throw new AppError('Role not found or inaccessible', 404, ErrorCode.NOT_FOUND);
    }

    return {
      id: role.id,
      organizationId: role.organizationId,
      roleCode: role.roleCode,
      roleName: role.roleName,
      description: role.description,
      roleType: role.roleType,
      isActive: role.isActive,
      permissionCount: role.permissions?.length || 0,
      userCount: role._count?.userRoles || 0,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  /**
   * Creates a tenant custom role.
   */
  async createCustomRole(
    organizationId: string,
    data: CreateRoleDto,
    audit: AuditContext
  ): Promise<any> {
    // 1. Role code uniqueness check within active organization
    const existing = await this.repo.findCustomRoleByCode(data.roleCode, organizationId);
    if (existing) {
      throw new AppError(
        `Role code '${data.roleCode}' already exists in this organization`,
        409,
        ErrorCode.CONFLICT
      );
    }

    // 2. Validate and resolve permission nodes if provided
    let resolvedGrants: Array<{ nodeId: string; nodeCode: string; isGranted: boolean }> = [];
    if (data.permissions && data.permissions.length > 0) {
      resolvedGrants = await this.resolveAndValidateNodes(data.permissions);

      // 3. Enforce Delegation Ceiling
      await this.verifyDelegationCeiling(audit.actorUserId, organizationId, resolvedGrants);
    }

    // 4. Create in repository
    return this.repo.createCustomRole(
      organizationId,
      {
        roleCode: data.roleCode,
        roleName: data.roleName,
        description: data.description,
      },
      resolvedGrants.map((g) => ({ nodeId: g.nodeId, isGranted: g.isGranted })),
      audit
    );
  }

  /**
   * Updates metadata for a tenant custom role.
   */
  async updateCustomRole(
    roleId: string,
    organizationId: string,
    data: UpdateRoleDto,
    audit: AuditContext
  ): Promise<any> {
    const role = await this.repo.findRoleById(roleId, organizationId);
    if (!role) {
      throw new AppError('Role not found or inaccessible', 404, ErrorCode.NOT_FOUND);
    }

    if (role.roleType === RoleType.SYSTEM_TEMPLATE) {
      throw new AppError(
        'System role templates are platform-curated and immutable',
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }

    // Anti-self-modification
    await this.verifyAntiSelfModification(audit.actorUserId, organizationId, roleId);

    return this.repo.updateCustomRole(
      roleId,
      organizationId,
      data,
      { roleName: role.roleName, description: role.description },
      audit
    );
  }

  /**
   * Toggles active/inactive status of a custom role.
   */
  async toggleRoleStatus(
    roleId: string,
    organizationId: string,
    isActive: boolean,
    audit: AuditContext
  ): Promise<any> {
    const role = await this.repo.findRoleById(roleId, organizationId);
    if (!role) {
      throw new AppError('Role not found or inaccessible', 404, ErrorCode.NOT_FOUND);
    }

    if (role.roleType === RoleType.SYSTEM_TEMPLATE) {
      throw new AppError(
        'System role templates cannot be deactivated by tenants',
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }

    // Anti-self-modification
    await this.verifyAntiSelfModification(audit.actorUserId, organizationId, roleId);

    return this.repo.toggleRoleStatus(
      roleId,
      organizationId,
      isActive,
      { isActive: role.isActive },
      audit
    );
  }

  /**
   * Clones a SYSTEM_TEMPLATE into a tenant CUSTOM role.
   * Enforces full delegation ceiling: caller must possess all template permissions.
   */
  async cloneTemplate(
    templateId: string,
    organizationId: string,
    data: CloneTemplateDto,
    audit: AuditContext
  ): Promise<any> {
    // 1. Resolve template
    const template = await (this.prisma as any).role.findFirst({
      where: {
        id: templateId,
        roleType: RoleType.SYSTEM_TEMPLATE,
        organizationId: null,
      },
      include: {
        permissions: {
          include: {
            node: true,
          },
        },
      },
    });

    if (!template || !template.isActive) {
      throw new AppError('System role template not found or inactive', 404, ErrorCode.NOT_FOUND);
    }

    // 2. Role code uniqueness check
    const existing = await this.repo.findCustomRoleByCode(data.roleCode, organizationId);
    if (existing) {
      throw new AppError(
        `Role code '${data.roleCode}' already exists in this organization`,
        409,
        ErrorCode.CONFLICT
      );
    }

    // 3. Verify delegation ceiling against all template capability grants
    const templateGrants = template.permissions.map((p: any) => ({
      nodeId: p.nodeId,
      nodeCode: p.node.nodeCode,
      isGranted: p.isGranted,
    }));

    await this.verifyDelegationCeiling(audit.actorUserId, organizationId, templateGrants);

    // 4. Perform atomic clone
    return this.repo.cloneTemplateToCustom(
      templateId,
      organizationId,
      data,
      templateGrants.map((g: any) => ({ nodeId: g.nodeId, isGranted: g.isGranted })),
      audit
    );
  }

  /**
   * Deletes custom role if zero assignments exist; otherwise soft-archives it.
   */
  async deleteOrArchiveRole(
    roleId: string,
    organizationId: string,
    audit: AuditContext
  ): Promise<{ action: 'DELETED' | 'ARCHIVED'; message: string }> {
    const role = await this.repo.findRoleById(roleId, organizationId);
    if (!role) {
      throw new AppError('Role not found or inaccessible', 404, ErrorCode.NOT_FOUND);
    }

    if (role.roleType === RoleType.SYSTEM_TEMPLATE) {
      throw new AppError(
        'System role templates cannot be deleted or archived',
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }

    // Anti-self-modification
    await this.verifyAntiSelfModification(audit.actorUserId, organizationId, roleId);

    // Check assignments count
    const assignmentCount = await this.repo.countRoleAssignments(roleId);
    const hasAssignments = assignmentCount > 0;

    const res = await this.repo.deleteOrArchiveRole(
      roleId,
      organizationId,
      hasAssignments,
      { roleCode: role.roleCode, isActive: role.isActive },
      audit
    );

    const message =
      res.action === 'ARCHIVED'
        ? `Role contains ${assignmentCount} historical assignment(s) and was safely archived to preserve authorization audit records`
        : 'Role successfully deleted';

    return { action: res.action, message };
  }

  /**
   * Retrieves the full capability matrix for a role.
   */
  async getRolePermissionsMatrix(
    roleId: string,
    organizationId: string
  ): Promise<RolePermissionsMatrixDto> {
    const role = await this.repo.findRoleById(roleId, organizationId);
    if (!role) {
      throw new AppError('Role not found or inaccessible', 404, ErrorCode.NOT_FOUND);
    }

    // Fetch all canonical permission nodes
    const allNodes = await (this.prisma as any).permissionNode.findMany({
      where: { isActive: true },
      orderBy: [{ nodeLevel: 'asc' }, { displayOrder: 'asc' }],
    });

    const grantMap = new Map<string, boolean>();
    for (const p of role.permissions) {
      grantMap.set(p.nodeId, p.isGranted);
    }

    const permissions: RolePermissionMatrixItem[] = allNodes.map((node: any) => ({
      nodeId: node.id,
      nodeCode: node.nodeCode,
      nodeName: node.nodeName,
      nodeType: node.nodeType,
      nodeLevel: node.nodeLevel,
      displayOrder: node.displayOrder,
      description: node.description,
      isGranted: grantMap.get(node.id) ?? false,
      isDirect: grantMap.has(node.id),
    }));

    return {
      roleId: role.id,
      roleCode: role.roleCode,
      roleName: role.roleName,
      roleType: role.roleType,
      permissions,
    };
  }

  /**
   * Updates capability matrix for a custom role.
   */
  async updateRolePermissions(
    roleId: string,
    organizationId: string,
    data: UpdateRolePermissionsDto,
    audit: AuditContext
  ): Promise<void> {
    const role = await this.repo.findRoleById(roleId, organizationId);
    if (!role) {
      throw new AppError('Role not found or inaccessible', 404, ErrorCode.NOT_FOUND);
    }

    if (role.roleType === RoleType.SYSTEM_TEMPLATE) {
      throw new AppError(
        'System role template capability matrices are platform-curated and immutable',
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }

    // Anti-self-modification
    await this.verifyAntiSelfModification(audit.actorUserId, organizationId, roleId);

    // Resolve & validate submitted nodes
    const resolved = await this.resolveAndValidateNodes(data.permissions);

    // Enforce delegation ceiling
    await this.verifyDelegationCeiling(audit.actorUserId, organizationId, resolved);

    const previousGrants = role.permissions.map((p: any) => ({
      nodeId: p.nodeId,
      isGranted: p.isGranted,
    }));

    await this.repo.updateRolePermissions(
      roleId,
      organizationId,
      resolved.map((r) => ({ nodeId: r.nodeId, isGranted: r.isGranted })),
      previousGrants,
      audit
    );
  }
}

export const rolesService = new RolesService();

