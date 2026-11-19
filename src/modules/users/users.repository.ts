import { User, Prisma, InvitationStatus } from '@prisma/client';
import { prisma } from '../../core/database/prisma-client';
import {
  UserSummaryDto,
  UserDetailDto,
  UserQueryFilters,
  PaginatedUsersResult,
  InvitationSummaryDto,
  AuditContext,
} from './users.types';
import { sanitizeAuditPayload } from '../../core/security/audit-sanitizer';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  userType?: 'PLATFORM' | 'TENANT';
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export class UsersRepository {
  /**
   * Find a user by email address (case-insensitive)
   */
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        email: {
          equals: email.trim().toLowerCase(),
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * Find a user by primary key ID
   */
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new user identity
   */
  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email.trim().toLowerCase(),
        passwordHash: data.passwordHash,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        phone: data.phone?.trim(),
        avatarUrl: data.avatarUrl?.trim(),
        userType: data.userType ?? 'TENANT',
        isActive: data.isActive ?? true,
        mustChangePassword: data.mustChangePassword ?? false,
        tokenVersion: 1,
      },
    });
  }

  /**
   * Concurrency-safe atomic increment of failed login attempts.
   */
  async atomicIncrementFailedLogins(
    userId: string,
    maxAttempts: number = 5,
    lockoutMinutes: number = 15
  ): Promise<{ failedLogins: number; isLocked: boolean; lockedUntil: Date | null }> {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        failedLogins: { increment: 1 },
      },
      select: { failedLogins: true },
    });

    if (updated.failedLogins >= maxAttempts) {
      const lockoutUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
      await prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: lockoutUntil },
      });
      return {
        failedLogins: updated.failedLogins,
        isLocked: true,
        lockedUntil: lockoutUntil,
      };
    }

    return {
      failedLogins: updated.failedLogins,
      isLocked: false,
      lockedUntil: null,
    };
  }

  /**
   * Atomically resets failed login attempts upon successful authentication.
   */
  async atomicResetFailedLogins(userId: string, ipAddress?: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLogins: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress || null,
      },
    });
  }

  /**
   * Stores a SHA-256 password reset hash with expiry.
   */
  async setPasswordResetHash(userId: string, hash: string, expiresAt: Date): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetHash: hash,
        passwordResetExpires: expiresAt,
      },
    });
  }

  /**
   * Finds an active user by a valid, unexpired password reset token hash.
   */
  async findByValidResetHash(hash: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: {
        passwordResetHash: hash,
        passwordResetExpires: {
          gt: new Date(),
        },
        isActive: true,
      },
    });
  }

  /**
   * Updates user password and increments tokenVersion to invalidate existing tokens.
   */
  async updatePasswordAndIncrementVersion(userId: string, passwordHash: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordResetHash: null,
        passwordResetExpires: null,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });
  }

  /**
   * Atomically increments tokenVersion to invalidate all active JWTs for a user without changing password.
   */
  async incrementTokenVersion(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        tokenVersion: { increment: 1 },
      },
    });
  }

  /**
   * Update arbitrary user profile fields
   */
  async update(userId: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  // ==========================================
  // STAGE 1: USER DIRECTORY & MEMBERSHIP QUERIES
  // ==========================================

  /**
   * Lists users belonging to an organization with real roles, campuses, and status.
   */
  async listOrganizationUsers(
    organizationId: string,
    filters: UserQueryFilters = {}
  ): Promise<PaginatedUsersResult> {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const search = filters.search?.trim();

    const whereClause: any = {
      organizationId,
    };

    // Status filtering
    if (filters.status && filters.status !== 'ALL') {
      if (filters.status === 'INVITED') {
        whereClause.status = 'INVITED';
      } else if (filters.status === 'ACTIVE') {
        whereClause.status = 'ACTIVE';
        whereClause.user = { isActive: true };
      } else if (filters.status === 'SUSPENDED' || filters.status === 'INACTIVE') {
        whereClause.OR = [
          { status: 'SUSPENDED' },
          { user: { isActive: false } },
        ];
      }
    }

    // Role filtering
    if (filters.roleId) {
      whereClause.userRoles = {
        some: {
          roleId: filters.roleId,
          isActive: true,
        },
      };
    }

    // Location/Campus filtering
    if (filters.locationId) {
      whereClause.userRoles = {
        some: {
          locationId: filters.locationId,
          isActive: true,
        },
      };
    }

    // Search query
    if (search) {
      whereClause.user = {
        ...whereClause.user,
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [memberships, total] = await Promise.all([
      (prisma as any).organizationMembership.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              avatarUrl: true,
              userType: true,
              isActive: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
          userRoles: {
            where: { isActive: true },
            include: {
              role: {
                select: {
                  id: true,
                  roleCode: true,
                  roleName: true,
                  roleType: true,
                },
              },
              location: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
            orderBy: { assignedAt: 'desc' },
          },
        },
        orderBy: [
          { user: { firstName: 'asc' } },
          { user: { lastName: 'asc' } },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      (prisma as any).organizationMembership.count({
        where: whereClause,
      }),
    ]);

    const users: UserSummaryDto[] = memberships.map((m: any) => {
      const u = m.user;
      const roles = (m.userRoles || []).map((ur: any) => ({
        id: ur.id,
        roleId: ur.role.id,
        roleCode: ur.role.roleCode,
        roleName: ur.role.roleName,
        roleType: ur.role.roleType,
        locationId: ur.location?.id || null,
        locationName: ur.location?.name || null,
        isActive: ur.isActive,
        assignedAt: ur.assignedAt.toISOString(),
      }));

      // Determine accurate user status
      let status: 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'SUSPENDED' = 'ACTIVE';
      if (m.status === 'INVITED') {
        status = 'INVITED';
      } else if (!u.isActive || m.status === 'SUSPENDED') {
        status = 'SUSPENDED';
      }

      // Determine primary role
      const primaryRole = roles[0]?.roleName || (m.accessLevel === 'OWNER' ? 'Organization Owner' : 'Member');

      // Determine assigned campus scope
      const campusNames: string[] = Array.from(new Set(roles.map((r: any) => r.locationName).filter((name: any): name is string => Boolean(name))));
      let assignedCampus = 'All-Campus Scope';
      if (campusNames.length === 1 && campusNames[0]) {
        assignedCampus = campusNames[0];
      } else if (campusNames.length > 1 && campusNames[0]) {
        assignedCampus = `${campusNames[0]} (+${campusNames.length - 1} more)`;
      }

      return {
        id: u.id,
        userCode: `USR-${u.id.slice(0, 8).toUpperCase()}`,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        avatarUrl: u.avatarUrl,
        status,
        userType: u.userType,
        membershipType: m.membershipType,
        accessLevel: m.accessLevel,
        primaryRole,
        assignedCampus,
        roles,
        twoFactorEnabled: false,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      users,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Fetches full profile details for a user within an organization.
   */
  async findUserInOrganization(
    organizationId: string,
    userId: string
  ): Promise<UserDetailDto | null> {
    const membership = await (prisma as any).organizationMembership.findFirst({
      where: {
        organizationId,
        userId,
      },
      include: {
        user: {
          include: {
            memberships: {
              include: {
                organization: {
                  select: { id: true, displayName: true, code: true },
                },
              },
            },
            sessions: {
              where: { isRevoked: false, expiresAt: { gt: new Date() } },
              select: { id: true },
            },
          },
        },
        userRoles: {
          include: {
            role: true,
            location: true,
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });

    if (!membership) {
      return null;
    }

    const u = membership.user;
    const roles = (membership.userRoles || []).map((ur: any) => ({
      id: ur.id,
      roleId: ur.role.id,
      roleCode: ur.role.roleCode,
      roleName: ur.role.roleName,
      roleType: ur.role.roleType,
      locationId: ur.location?.id || null,
      locationName: ur.location?.name || null,
      isActive: ur.isActive,
      assignedAt: ur.assignedAt.toISOString(),
    }));

    let status: 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'SUSPENDED' = 'ACTIVE';
    if (membership.status === 'INVITED') {
      status = 'INVITED';
    } else if (!u.isActive || membership.status === 'SUSPENDED') {
      status = 'SUSPENDED';
    }

    const primaryRole = roles[0]?.roleName || (membership.accessLevel === 'OWNER' ? 'Organization Owner' : 'Member');
    const campusNames = Array.from(new Set(roles.map((r: any) => r.locationName).filter(Boolean)));
    const assignedCampus = campusNames.length > 0 ? campusNames.join(', ') : 'All-Campus Scope';

    return {
      id: u.id,
      userCode: `USR-${u.id.slice(0, 8).toUpperCase()}`,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      avatarUrl: u.avatarUrl,
      status,
      userType: u.userType,
      membershipType: membership.membershipType,
      accessLevel: membership.accessLevel,
      primaryRole,
      assignedCampus,
      roles,
      twoFactorEnabled: false,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      memberships: u.memberships.map((m: any) => ({
        id: m.id,
        organizationId: m.organizationId,
        organizationName: m.organization.displayName,
        accessLevel: m.accessLevel,
        membershipType: m.membershipType,
        status: m.status,
        isPrimary: m.isPrimary,
        joinedAt: m.joinedAt.toISOString(),
      })),
      activeSessionsCount: u.sessions.length,
    };
  }

  /**
   * Updates user profile fields and logs audit event.
   */
  async updateUserProfile(
    userId: string,
    organizationId: string,
    data: { firstName?: string; lastName?: string; phone?: string | null },
    audit: AuditContext
  ): Promise<User> {
    return prisma.$transaction(async (tx: any) => {
      const existing = await tx.user.findUnique({
        where: { id: userId },
      });

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(data.firstName && { firstName: data.firstName.trim() }),
          ...(data.lastName && { lastName: data.lastName.trim() }),
          ...(data.phone !== undefined && { phone: data.phone ? data.phone.trim() : null }),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: audit.actorUserId,
          action: 'USER_PROFILE_UPDATED',
          entity: 'User',
          entityId: userId,
          previousState: sanitizeAuditPayload({
            firstName: existing.firstName,
            lastName: existing.lastName,
            phone: existing.phone,
          }),
          newState: sanitizeAuditPayload({
            firstName: updated.firstName,
            lastName: updated.lastName,
            phone: updated.phone,
          }),
          ipAddress: audit.ipAddress || null,
          userAgent: audit.userAgent || null,
        },
      });

      return updated;
    });
  }

  /**
   * Concurrency-safe account activation/deactivation with token version increment
   * and session termination on deactivation.
   */
  async toggleUserStatus(
    organizationId: string,
    userId: string,
    isActive: boolean,
    reason: string | undefined,
    audit: AuditContext
  ): Promise<{ user: User; membership: any }> {
    return prisma.$transaction(async (tx: any) => {
      // 1. Update User identity and bump tokenVersion to immediately invalidate all outstanding JWTs
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          isActive,
          tokenVersion: { increment: 1 },
        },
      });

      // 2. Update membership status in this organization
      const membership = await tx.organizationMembership.update({
        where: {
          userId_organizationId: {
            userId,
            organizationId,
          },
        },
        data: {
          status: isActive ? 'ACTIVE' : 'SUSPENDED',
        },
      });

      // 3. If deactivating, terminate all active browser/device sessions and refresh tokens
      if (!isActive) {
        await tx.session.updateMany({
          where: {
            userId,
            isRevoked: false,
          },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: reason || 'ACCOUNT_DEACTIVATED',
          },
        });

        // Revoke associated refresh tokens
        const userSessions = await tx.session.findMany({
          where: { userId },
          select: { id: true },
        });
        const sessionIds = userSessions.map((s: any) => s.id);

        if (sessionIds.length > 0) {
          await tx.refreshToken.updateMany({
            where: {
              sessionId: { in: sessionIds },
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });
        }
      }

      // 4. Record tamper-evident audit record
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: audit.actorUserId,
          action: isActive ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
          entity: 'User',
          entityId: userId,
          previousState: { isActive: !isActive, status: !isActive ? 'ACTIVE' : 'SUSPENDED' },
          newState: { isActive, status: membership.status, reason: reason || null },
          ipAddress: audit.ipAddress || null,
          userAgent: audit.userAgent || null,
        },
      });

      return { user, membership };
    });
  }

  // ==========================================
  // INVITATION LIFECYCLE MANAGEMENT
  // ==========================================

  /**
   * Creates an invitation with single-use token hash and pending membership.
   */
  async createInvitation(
    organizationId: string,
    data: {
      email: string;
      firstName: string;
      lastName: string;
      phone?: string | null;
      roleId: string;
      locationId?: string | null;
      accessLevel: any;
      membershipType: any;
      tokenHash: string;
      expiresAt: Date;
    },
    audit: AuditContext
  ): Promise<{ invitation: any; user: User; membership: any }> {
    return prisma.$transaction(async (tx: any) => {
      const email = data.email.trim().toLowerCase();

      // 1. Find or provision user identity
      let user = await tx.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });

      if (!user) {
        // Provision initial user record with placeholder password
        user = await tx.user.create({
          data: {
            email,
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            phone: data.phone?.trim() || null,
            passwordHash: `INVITED_${data.tokenHash.slice(0, 32)}`, // Unusable placeholder
            userType: 'TENANT',
            isActive: true,
            mustChangePassword: true,
            tokenVersion: 1,
          },
        });
      }

      // 2. Find or create organization membership with status INVITED
      let membership = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId,
          },
        },
      });

      if (!membership) {
        membership = await tx.organizationMembership.create({
          data: {
            userId: user.id,
            organizationId,
            accessLevel: data.accessLevel,
            membershipType: data.membershipType,
            status: 'INVITED',
          },
        });
      } else {
        membership = await tx.organizationMembership.update({
          where: { id: membership.id },
          data: {
            status: 'INVITED',
            accessLevel: data.accessLevel,
            membershipType: data.membershipType,
          },
        });
      }

      // 3. Invalidate any existing PENDING invitations for this email in this org
      await tx.organizationInvitation.updateMany({
        where: {
          organizationId,
          email,
          status: 'PENDING',
        },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedBy: audit.actorUserId,
        },
      });

      // 4. Create new OrganizationInvitation record
      const invitation = await tx.organizationInvitation.create({
        data: {
          organizationId,
          email,
          tokenHash: data.tokenHash,
          roleId: data.roleId,
          locationId: data.locationId || null,
          accessLevel: data.accessLevel,
          membershipType: data.membershipType,
          status: 'PENDING',
          invitedBy: audit.actorUserId,
          expiresAt: data.expiresAt,
        },
        include: {
          role: true,
          location: true,
        },
      });

      // 5. Emit audit event
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: audit.actorUserId,
          action: 'USER_INVITED',
          entity: 'OrganizationInvitation',
          entityId: invitation.id,
          newState: sanitizeAuditPayload({
            email,
            roleId: data.roleId,
            locationId: data.locationId,
            expiresAt: data.expiresAt,
          }),
          ipAddress: audit.ipAddress || null,
          userAgent: audit.userAgent || null,
        },
      });

      return { invitation, user, membership };
    });
  }

  /**
   * Finds invitation by token hash.
   */
  async findInvitationByTokenHash(tokenHash: string) {
    return (prisma as any).organizationInvitation.findUnique({
      where: { tokenHash },
      include: {
        organization: true,
        role: true,
        location: true,
      },
    });
  }

  /**
   * Accepts invitation, activates user identity & membership, and assigns role.
   */
  async acceptInvitation(
    invitation: any,
    passwordHash: string | undefined,
    profileData: { firstName?: string; lastName?: string; phone?: string | null }
  ): Promise<{ user: User; membership: any; userRole: any }> {
    return prisma.$transaction(async (tx: any) => {
      // 1. Locate user identity
      const user = await tx.user.findFirst({
        where: { email: { equals: invitation.email, mode: 'insensitive' } },
      });

      if (!user) {
        throw new Error('User identity associated with invitation could not be found.');
      }

      // 2. Update user profile and password if supplied
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          ...(passwordHash && { passwordHash, passwordChangedAt: new Date() }),
          ...(profileData.firstName && { firstName: profileData.firstName.trim() }),
          ...(profileData.lastName && { lastName: profileData.lastName.trim() }),
          ...(profileData.phone && { phone: profileData.phone.trim() }),
          isActive: true,
          mustChangePassword: false,
          tokenVersion: { increment: 1 },
        },
      });

      // 3. Activate organization membership
      const membership = await tx.organizationMembership.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: invitation.organizationId,
          },
        },
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          accessLevel: invitation.accessLevel,
          membershipType: invitation.membershipType,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        update: {
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      // 4. Assign approved role to user at organization or campus scope
      const userRole = await tx.userRole.create({
        data: {
          userId: user.id,
          organizationId: invitation.organizationId,
          roleId: invitation.roleId,
          locationId: invitation.locationId || null,
          membershipId: membership.id,
          isActive: true,
          assignedBy: invitation.invitedBy,
          assignedAt: new Date(),
          reason: 'Initial onboarding invitation acceptance',
        },
      });

      // 5. Mark invitation as ACCEPTED (prevents token reuse)
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      });

      // 6. Enqueue transactional RBAC cache invalidation
      await tx.rbacInvalidationOutbox.create({
        data: {
          eventType: 'USER_ROLE_ASSIGNED',
          organizationId: invitation.organizationId,
          userId: user.id,
          processed: false,
        },
      });

      // 7. Emit audit event
      await tx.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          action: 'USER_INVITATION_ACCEPTED',
          entity: 'OrganizationInvitation',
          entityId: invitation.id,
          newState: sanitizeAuditPayload({
            email: invitation.email,
            roleId: invitation.roleId,
            locationId: invitation.locationId,
            membershipId: membership.id,
          }),
        },
      });

      return { user: updatedUser, membership, userRole };
    });
  }

  /**
   * Resends invitation with a fresh token hash and renewed expiry.
   */
  async resendInvitation(
    invitationId: string,
    newHash: string,
    newExpiry: Date,
    audit: AuditContext
  ): Promise<any> {
    return prisma.$transaction(async (tx: any) => {
      const existing = await tx.organizationInvitation.findUnique({
        where: { id: invitationId },
      });

      if (!existing) {
        throw new Error('Invitation not found');
      }

      const updated = await tx.organizationInvitation.update({
        where: { id: invitationId },
        data: {
          tokenHash: newHash,
          expiresAt: newExpiry,
          status: 'PENDING',
          invitedBy: audit.actorUserId,
        },
        include: {
          role: true,
          location: true,
          organization: true,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: existing.organizationId,
          userId: audit.actorUserId,
          action: 'USER_INVITATION_RESENT',
          entity: 'OrganizationInvitation',
          entityId: invitationId,
          newState: sanitizeAuditPayload({
            email: existing.email,
            expiresAt: newExpiry,
          }),
          ipAddress: audit.ipAddress || null,
          userAgent: audit.userAgent || null,
        },
      });

      return updated;
    });
  }

  /**
   * Revokes a pending invitation.
   */
  async revokeInvitation(invitationId: string, audit: AuditContext): Promise<any> {
    return prisma.$transaction(async (tx: any) => {
      const existing = await tx.organizationInvitation.findUnique({
        where: { id: invitationId },
      });

      if (!existing) {
        throw new Error('Invitation not found');
      }

      const updated = await tx.organizationInvitation.update({
        where: { id: invitationId },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedBy: audit.actorUserId,
        },
      });

      // Update pending membership status if still invited
      const user = await tx.user.findFirst({
        where: { email: { equals: existing.email, mode: 'insensitive' } },
      });

      if (user) {
        await tx.organizationMembership.updateMany({
          where: {
            userId: user.id,
            organizationId: existing.organizationId,
            status: 'INVITED',
          },
          data: {
            status: 'TERMINATED',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: existing.organizationId,
          userId: audit.actorUserId,
          action: 'USER_INVITATION_REVOKED',
          entity: 'OrganizationInvitation',
          entityId: invitationId,
          newState: sanitizeAuditPayload({
            email: existing.email,
            status: 'REVOKED',
          }),
          ipAddress: audit.ipAddress || null,
          userAgent: audit.userAgent || null,
        },
      });

      return updated;
    });
  }

  /**
   * Lists invitations for an organization.
   */
  async listInvitations(
    organizationId: string,
    statusFilter?: InvitationStatus
  ): Promise<InvitationSummaryDto[]> {
    const invitations = await (prisma as any).organizationInvitation.findMany({
      where: {
        organizationId,
        ...(statusFilter && { status: statusFilter }),
      },
      include: {
        role: {
          select: { id: true, roleCode: true, roleName: true },
        },
        location: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((inv: any) => ({
      id: inv.id,
      organizationId: inv.organizationId,
      email: inv.email,
      roleId: inv.role.id,
      roleCode: inv.role.roleCode,
      roleName: inv.role.roleName,
      locationId: inv.location?.id || null,
      locationName: inv.location?.name || null,
      accessLevel: inv.accessLevel,
      membershipType: inv.membershipType,
      status: inv.status,
      invitedBy: inv.invitedBy,
      expiresAt: inv.expiresAt.toISOString(),
      acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
      createdAt: inv.createdAt.toISOString(),
    }));
  }
}

export const usersRepository = new UsersRepository();
