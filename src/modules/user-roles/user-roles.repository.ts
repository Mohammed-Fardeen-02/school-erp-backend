import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../core/database/prisma-client';
import { recordInvalidationEvent } from '../../core/authorization/invalidation-outbox.worker';
import { sanitizeAuditPayload } from '../../core/security/audit-sanitizer';
import {
  UserRoleResponseDto,
  UserRoleFilterOptions,
  AuditContext,
} from './user-roles.types';

export class UserRolesRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Lists assignments and historical records for a specific user in an organization.
   */
  async listUserAssignments(
    userId: string,
    organizationId: string,
    filters: UserRoleFilterOptions
  ): Promise<UserRoleResponseDto[]> {
    const whereClause: Prisma.UserRoleWhereInput = {
      userId,
      organizationId,
      ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      ...(filters.locationId !== undefined
        ? { locationId: filters.locationId }
        : filters.allowedLocationIds !== undefined
        ? { locationId: { in: filters.allowedLocationIds } }
        : {}),
    };

    const records = await (this.prisma as any).userRole.findMany({
      where: whereClause,
      include: {
        role: {
          select: {
            id: true,
            roleCode: true,
            roleName: true,
            roleType: true,
            description: true,
          },
        },
        location: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ isActive: 'desc' }, { assignedAt: 'desc' }],
    });

    return records.map((r: any) => ({
      id: r.id,
      userId: r.userId,
      organizationId: r.organizationId,
      roleId: r.roleId,
      locationId: r.locationId,
      membershipId: r.membershipId,
      isActive: r.isActive,
      assignedBy: r.assignedBy,
      assignedAt: r.assignedAt,
      revokedBy: r.revokedBy,
      revokedAt: r.revokedAt,
      reason: r.reason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      role: r.role,
      location: r.location,
      user: r.user,
    }));
  }

  /**
   * Finds an active assignment for a user, role, and scope.
   */
  async findActiveAssignment(
    userId: string,
    organizationId: string,
    roleId: string,
    locationId?: string | null
  ): Promise<any | null> {
    return (this.prisma as any).userRole.findFirst({
      where: {
        userId,
        organizationId,
        roleId,
        locationId: locationId || null,
        isActive: true,
      },
      include: {
        role: true,
      },
    });
  }

  /**
   * Finds an assignment by ID within a tenant organization.
   */
  async findAssignmentById(
    assignmentId: string,
    organizationId: string
  ): Promise<any | null> {
    return (this.prisma as any).userRole.findFirst({
      where: {
        id: assignmentId,
        organizationId,
      },
      include: {
        role: {
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
        },
        location: {
          select: { id: true, code: true, name: true },
        },
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Transactionally creates a user role assignment, records outbox invalidation, and logs audit event.
   */
  async createAssignment(
    data: {
      userId: string;
      organizationId: string;
      roleId: string;
      locationId: string | null;
      membershipId: string;
      assignedBy: string;
    },
    roleSnapshot: { roleCode: string; roleName: string },
    audit: AuditContext
  ): Promise<UserRoleResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const created = await (tx as any).userRole.create({
        data: {
          userId: data.userId,
          organizationId: data.organizationId,
          roleId: data.roleId,
          locationId: data.locationId,
          membershipId: data.membershipId,
          isActive: true,
          assignedBy: data.assignedBy,
          assignedAt: new Date(),
        },
        include: {
          role: {
            select: {
              id: true,
              roleCode: true,
              roleName: true,
              roleType: true,
              description: true,
            },
          },
          location: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // 1. Transactional Outbox Invalidation targeting affected user version counter
      await recordInvalidationEvent(tx, {
        eventType: 'USER_ROLE_ASSIGNED',
        organizationId: data.organizationId,
        userId: data.userId,
      });

      // 2. Transactional Security Audit Log
      await (tx as any).auditLog.create({
        data: {
          organizationId: data.organizationId,
          userId: audit.actorUserId,
          action: 'USER_ROLE_ASSIGNED',
          entity: 'UserRole',
          entityId: created.id,
          previousState: Prisma.DbNull,
          newState: sanitizeAuditPayload({
            id: created.id,
            userId: data.userId,
            roleId: data.roleId,
            roleCode: roleSnapshot.roleCode,
            roleName: roleSnapshot.roleName,
            locationId: data.locationId,
            assignedBy: data.assignedBy,
            assignedAt: created.assignedAt,
          }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });

      return {
        id: created.id,
        userId: created.userId,
        organizationId: created.organizationId,
        roleId: created.roleId,
        locationId: created.locationId,
        membershipId: created.membershipId,
        isActive: created.isActive,
        assignedBy: created.assignedBy,
        assignedAt: created.assignedAt,
        revokedBy: created.revokedBy,
        revokedAt: created.revokedAt,
        reason: created.reason,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        role: created.role,
        location: created.location,
        user: created.user,
      };
    });
  }

  /**
   * Transactionally revokes an active assignment, records outbox invalidation, and logs audit event.
   */
  async revokeAssignment(
    assignmentId: string,
    organizationId: string,
    actorUserId: string,
    reason: string,
    previousState: any,
    audit: AuditContext
  ): Promise<UserRoleResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const revoked = await (tx as any).userRole.update({
        where: { id: assignmentId },
        data: {
          isActive: false,
          revokedBy: actorUserId,
          revokedAt: new Date(),
          reason,
        },
        include: {
          role: {
            select: {
              id: true,
              roleCode: true,
              roleName: true,
              roleType: true,
              description: true,
            },
          },
          location: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // 1. Transactional Outbox Invalidation targeting affected user version counter
      await recordInvalidationEvent(tx, {
        eventType: 'USER_ROLE_REVOKED',
        organizationId,
        userId: previousState.userId,
      });

      // 2. Transactional Security Audit Log
      await (tx as any).auditLog.create({
        data: {
          organizationId,
          userId: audit.actorUserId,
          action: 'USER_ROLE_REVOKED',
          entity: 'UserRole',
          entityId: assignmentId,
          previousState: sanitizeAuditPayload({
            id: previousState.id,
            userId: previousState.userId,
            roleId: previousState.roleId,
            isActive: true,
            locationId: previousState.locationId,
          }),
          newState: sanitizeAuditPayload({
            id: revoked.id,
            userId: revoked.userId,
            roleId: revoked.roleId,
            isActive: false,
            revokedBy: actorUserId,
            revokedAt: revoked.revokedAt,
            reason,
          }),
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        },
      });

      return {
        id: revoked.id,
        userId: revoked.userId,
        organizationId: revoked.organizationId,
        roleId: revoked.roleId,
        locationId: revoked.locationId,
        membershipId: revoked.membershipId,
        isActive: revoked.isActive,
        assignedBy: revoked.assignedBy,
        assignedAt: revoked.assignedAt,
        revokedBy: revoked.revokedBy,
        revokedAt: revoked.revokedAt,
        reason: revoked.reason,
        createdAt: revoked.createdAt,
        updatedAt: revoked.updatedAt,
        role: revoked.role,
        location: revoked.location,
        user: revoked.user,
      };
    });
  }
}

export const userRolesRepository = new UserRolesRepository();

