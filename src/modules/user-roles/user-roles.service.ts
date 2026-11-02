import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../core/database/prisma-client';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { effectivePermissionsService, EffectivePermissionsService } from '../../core/authorization/effective-permissions.service';
import { processPendingInvalidations } from '../../core/authorization/invalidation-outbox.worker';
import { userRolesRepository, UserRolesRepository } from './user-roles.repository';
import {
  AssignRoleDto,
  RevokeRoleDto,
  UserRoleFilterOptions,
  UserRoleResponseDto,
  AuditContext,
} from './user-roles.types';

export class UserRolesService {
  constructor(
    private readonly repo: UserRolesRepository = userRolesRepository,
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly permsService: EffectivePermissionsService = effectivePermissionsService
  ) {}

  /**
   * Enforces Scope-Aware Delegation Ceiling:
   * Verifies that the caller actively holds all permissions granted by the role at the target scope.
   */
  private async verifyDelegationCeiling(
    actorUserId: string,
    organizationId: string,
    locationId: string | null,
    roleGrantedCodes: string[],
    actionVerb: 'assign' | 'revoke'
  ): Promise<void> {
    if (!roleGrantedCodes || roleGrantedCodes.length === 0) {
      return;
    }

    const actorEffectivePermissions = await this.permsService.getEffectivePermissions(
      actorUserId,
      organizationId,
      locationId
    );

    const unauthorizedCodes: string[] = [];
    for (const code of roleGrantedCodes) {
      if (!actorEffectivePermissions.has(code)) {
        unauthorizedCodes.push(code);
      }
    }

    if (unauthorizedCodes.length > 0) {
      throw new AppError(
        `Delegation ceiling violation: You cannot ${actionVerb} a role containing permissions you do not actively possess at target scope: [${unauthorizedCodes.join(
          ', '
        )}]`,
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }
  }

  /**
   * Assigns an active role to a user within the tenant organization.
   * Supports organization-wide (locationId: null) and campus-scoped (locationId: UUID) assignments.
   */
  async assignRole(
    actorUserId: string,
    organizationId: string,
    dto: AssignRoleDto,
    audit: AuditContext
  ): Promise<UserRoleResponseDto> {
    // 1. Anti-Self-Assignment Guardrail
    if (actorUserId === dto.userId) {
      throw new AppError(
        'Anti-self-assignment violation: You cannot assign roles to yourself',
        403,
        ErrorCode.UNAUTHORIZED
      );
    }

    // 2. Validate Target User Status
    const user = await (this.prisma as any).user.findUnique({
      where: { id: dto.userId },
      select: { id: true, isActive: true, status: true },
    });

    if (!user || !user.isActive || user.status !== 'ACTIVE') {
      throw new AppError(
        'Target user not found or inactive',
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    // 3. Validate Target User Active Membership in this Tenant
    const membership = await (this.prisma as any).organizationMembership.findFirst({
      where: {
        userId: dto.userId,
        organizationId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!membership) {
      throw new AppError(
        'Target user does not have an active membership in this organization',
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    // 4. Validate Role Existence & Accessibility (System Template or Tenant Custom Role)
    const role = await (this.prisma as any).role.findFirst({
      where: {
        id: dto.roleId,
        isActive: true,
        OR: [
          { organizationId: null, roleType: 'SYSTEM_TEMPLATE' },
          { organizationId, roleType: 'CUSTOM' },
        ],
      },
      include: {
        permissions: {
          where: { isGranted: true },
          include: {
            node: {
              select: { nodeCode: true, isActive: true },
            },
          },
        },
      },
    });

    if (!role) {
      throw new AppError(
        'Role not found, inactive, or not accessible to this organization',
        404,
        ErrorCode.NOT_FOUND
      );
    }

    // 5. Validate Campus Location if Campus-Scoped Assignment
    const targetLocationId = dto.locationId || null;
    if (targetLocationId) {
      const location = await (this.prisma as any).location.findFirst({
        where: {
          id: targetLocationId,
          organizationId,
          isActive: true,
        },
        select: { id: true },
      });

      if (!location) {
        throw new AppError(
          'Campus location not found, inactive, or does not belong to this organization',
          400,
          ErrorCode.BAD_REQUEST
        );
      }
    }

    // 6. Concurrency & Duplicate Check: Ensure no active assignment already exists for this role & scope
    const existingActive = await this.repo.findActiveAssignment(
      dto.userId,
      organizationId,
      dto.roleId,
      targetLocationId
    );

    if (existingActive) {
      throw new AppError(
        'An active role assignment already exists for this user, role, and scope',
        409,
        ErrorCode.CONFLICT
      );
    }

    // 7. Verify Caller's Assignment Authority at the Actual Target Scope (targetLocationId)
    const hasAssignPermission = await this.permsService.hasPermission(
      actorUserId,
      organizationId,
      targetLocationId,
      'settings.user_assignments.allocations.assign'
    );

    if (!hasAssignPermission) {
      throw new AppError(
        'Delegation ceiling violation: You lack authority to assign roles at the target scope',
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }

    // 8. Enforce Scope-Aware Delegation Ceiling: Caller must hold all permissions granted by role at target scope
    const roleGrantedCodes: string[] = (role.permissions || [])
      .filter((p: any) => p.isGranted && p.node?.isActive)
      .map((p: any) => p.node.nodeCode);

    await this.verifyDelegationCeiling(
      actorUserId,
      organizationId,
      targetLocationId,
      roleGrantedCodes,
      'assign'
    );

    // 9. Transactional Creation & Outbox Sync
    try {
      const assignment = await this.repo.createAssignment(
        {
          userId: dto.userId,
          organizationId,
          roleId: dto.roleId,
          locationId: targetLocationId,
          membershipId: membership.id,
          assignedBy: actorUserId,
        },
        {
          roleCode: role.roleCode,
          roleName: role.roleName,
        },
        audit
      );

      // 9. Post-Transaction Distributed Cache & Invalidation Processing
      processPendingInvalidations().catch(() => {});
      this.permsService.invalidateUserCache(dto.userId, organizationId).catch(() => {});

      return assignment;
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(
          'An active role assignment already exists for this user, role, and scope',
          409,
          ErrorCode.CONFLICT
        );
      }
      throw err;
    }
  }

  /**
   * Revokes an active user role assignment with non-destructive historical tracking.
   */
  async revokeRole(
    actorUserId: string,
    organizationId: string,
    assignmentId: string,
    dto: RevokeRoleDto,
    audit: AuditContext
  ): Promise<UserRoleResponseDto> {
    // 1. Find Existing Assignment in Tenant Organization
    const assignment = await this.repo.findAssignmentById(assignmentId, organizationId);

    if (!assignment) {
      throw new AppError(
        'Role assignment not found in this organization',
        404,
        ErrorCode.NOT_FOUND
      );
    }

    if (!assignment.isActive) {
      throw new AppError(
        'Role assignment is already revoked',
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    // 2. Anti-Self-Revocation Guardrail
    if (actorUserId === assignment.userId) {
      throw new AppError(
        'Anti-self-revocation violation: You cannot revoke your own role assignment',
        403,
        ErrorCode.UNAUTHORIZED
      );
    }

    // 3. Verify Revocation Authority at the Actual Assignment Scope (assignment.locationId)
    const hasRevokePermission = await this.permsService.hasPermission(
      actorUserId,
      organizationId,
      assignment.locationId,
      'settings.user_assignments.allocations.revoke'
    );

    if (!hasRevokePermission) {
      throw new AppError(
        'Delegation ceiling violation: You lack authority to revoke role assignments at the target assignment scope',
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }

    // 4. Transactional Revocation & Outbox Sync
    const updated = await this.repo.revokeAssignment(
      assignmentId,
      organizationId,
      actorUserId,
      dto.reason,
      assignment,
      audit
    );

    // 5. Post-Transaction Invalidation Processing
    processPendingInvalidations().catch(() => {});
    this.permsService.invalidateUserCache(assignment.userId, organizationId).catch(() => {});

    return updated;
  }

  /**
   * Lists assignments and historical lifecycle records for a specific user with scope isolation.
   */
  async listUserAssignments(
    actorUserId: string,
    organizationId: string,
    targetUserId: string,
    filters: UserRoleFilterOptions
  ): Promise<UserRoleResponseDto[]> {
    // 1. Verify target user belongs to this organization
    const membership = await (this.prisma as any).organizationMembership.findFirst({
      where: {
        userId: targetUserId,
        organizationId,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new AppError(
        'User not found in this organization',
        404,
        ErrorCode.NOT_FOUND
      );
    }

    // 2. Evaluate Caller's Listing Authority Scope
    const hasOrgWideView = await this.permsService.hasPermission(
      actorUserId,
      organizationId,
      null,
      'settings.user_assignments.allocations.view'
    );

    if (hasOrgWideView) {
      // Caller has org-wide view authority: can view org-wide and all campuses
      return this.repo.listUserAssignments(targetUserId, organizationId, filters);
    }

    // 3. Caller lacks org-wide view authority: Discover caller's authorized campuses
    const callerRoles = await (this.prisma as any).userRole.findMany({
      where: {
        userId: actorUserId,
        organizationId,
        isActive: true,
        membership: { status: 'ACTIVE' },
        locationId: { not: null },
      },
      select: { locationId: true },
    });

    const uniqueCampusIds: string[] = Array.from(
      new Set(
        callerRoles
          .map((r: any) => r.locationId)
          .filter((id: any): id is string => typeof id === 'string')
      )
    );

    const authorizedCampusIds: string[] = [];
    for (const locId of uniqueCampusIds) {
      const hasLocView = await this.permsService.hasPermission(
        actorUserId,
        organizationId,
        locId,
        'settings.user_assignments.allocations.view'
      );
      if (hasLocView) {
        authorizedCampusIds.push(locId);
      }
    }

    if (authorizedCampusIds.length === 0) {
      throw new AppError(
        'You lack authority to view role assignments for this organization',
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }

    // If caller provided a specific locationId filter, verify it is in their authorized list
    if (filters.locationId) {
      if (!authorizedCampusIds.includes(filters.locationId)) {
        throw new AppError(
          'You lack authority to view role assignments for the requested campus',
          403,
          ErrorCode.INSUFFICIENT_PERMISSIONS
        );
      }
      return this.repo.listUserAssignments(targetUserId, organizationId, filters);
    }

    // Otherwise, restrict to all authorized campuses
    return this.repo.listUserAssignments(targetUserId, organizationId, {
      ...filters,
      allowedLocationIds: authorizedCampusIds,
    });
  }
}

export const userRolesService = new UserRolesService();

