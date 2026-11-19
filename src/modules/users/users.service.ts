import crypto from 'crypto';
import { prisma } from '../../core/database/prisma-client';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { hashPassword } from '../../core/security/password';
import { effectivePermissionsService, EffectivePermissionsService } from '../../core/authorization/effective-permissions.service';
import { EmailService } from '../../integrations/email/email.service';
import { logger } from '../../core/logger/app-logger';
import { usersRepository, UsersRepository } from './users.repository';
import { settingsRepository } from '../settings/settings.repository';
import { securityPolicyRepository } from '../auth/security-policy.repository';
import {
  UserQueryFilters,
  PaginatedUsersResult,
  UserDetailDto,
  InviteUserDto,
  AcceptInvitationDto,
  UpdateUserProfileDto,
  ToggleUserStatusDto,
  InvitationSummaryDto,
  AuditContext,
} from './users.types';

export class UsersService {
  constructor(
    private readonly repo: UsersRepository = usersRepository,
    private readonly permsService: EffectivePermissionsService = effectivePermissionsService
  ) {}

  /**
   * Generates a cryptographically secure, single-use onboarding token.
   */
  private generateSecureToken(): { rawToken: string; tokenHash: string } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, tokenHash };
  }

  /**
   * Enforces Scope-Aware Delegation Ceiling:
   * Verifies that the caller actively holds all permissions granted by the role at target scope.
   */
  private async verifyDelegationCeiling(
    actorUserId: string,
    organizationId: string,
    locationId: string | null,
    roleGrantedCodes: string[]
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
        `Delegation ceiling violation: You cannot assign or invite a user with permissions you do not actively possess at target scope: [${unauthorizedCodes.join(
          ', '
        )}]`,
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }
  }

  async listUsers(organizationId: string, filters: UserQueryFilters): Promise<PaginatedUsersResult> {
    return this.repo.listOrganizationUsers(organizationId, filters);
  }

  async getUserById(organizationId: string, userId: string): Promise<UserDetailDto> {
    const user = await this.repo.findUserInOrganization(organizationId, userId);
    if (!user) {
      throw AppError.notFound('User not found in this organization', ErrorCode.NOT_FOUND);
    }
    return user;
  }

  async updateUserProfile(
    organizationId: string,
    userId: string,
    dto: UpdateUserProfileDto,
    audit: AuditContext
  ) {
    const user = await this.repo.findUserInOrganization(organizationId, userId);
    if (!user) {
      throw AppError.notFound('User not found in this organization', ErrorCode.NOT_FOUND);
    }

    return this.repo.updateUserProfile(userId, organizationId, dto, audit);
  }

  async toggleUserStatus(
    organizationId: string,
    userId: string,
    dto: ToggleUserStatusDto,
    audit: AuditContext
  ) {
    // Prevent self-deactivation
    if (userId === audit.actorUserId && !dto.isActive) {
      throw AppError.badRequest(
        'Self-deactivation prohibited. You cannot deactivate your own active session account.',
        ErrorCode.BAD_REQUEST
      );
    }

    const target = await this.repo.findUserInOrganization(organizationId, userId);
    if (!target) {
      throw AppError.notFound('Target user not found in this organization', ErrorCode.NOT_FOUND);
    }

    return this.repo.toggleUserStatus(organizationId, userId, dto.isActive, dto.reason, audit);
  }

  async inviteUser(
    organizationId: string,
    dto: InviteUserDto,
    audit: AuditContext
  ): Promise<{ success: boolean; message: string; invitationId: string }> {
    const email = dto.email.trim().toLowerCase();

    // 1. Verify Role Existence & Accessibility
    const role = await (prisma as any).role.findFirst({
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
            node: { select: { nodeCode: true } },
          },
        },
      },
    });

    if (!role) {
      throw AppError.notFound('Specified role was not found or is inactive', ErrorCode.NOT_FOUND);
    }

    // 2. Verify Campus Location if supplied
    const targetLocationId = dto.locationId || null;
    let locationName = 'All-Campus Scope';
    if (targetLocationId) {
      const location = await (prisma as any).location.findFirst({
        where: {
          id: targetLocationId,
          organizationId,
          isActive: true,
        },
        select: { id: true, name: true },
      });

      if (!location) {
        throw AppError.badRequest(
          'Specified campus location does not belong to this organization or is inactive',
          ErrorCode.BAD_REQUEST
        );
      }
      locationName = location.name;
    }

    // 3. Enforce Scope-Aware Delegation Ceiling
    const grantedCodes = role.permissions.map((p: any) => p.node.nodeCode);
    await this.verifyDelegationCeiling(audit.actorUserId, organizationId, targetLocationId, grantedCodes);

    // 4. Verify user is not already an ACTIVE member of this organization
    const existingUser = await this.repo.findByEmail(email);
    if (existingUser) {
      const existingMembership = await (prisma as any).organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId,
          },
        },
      });

      if (existingMembership && existingMembership.status === 'ACTIVE') {
        throw AppError.conflict(
          `User '${email}' is already an active member of this organization.`,
          ErrorCode.CONFLICT
        );
      }
    }

    // 5. Generate secure onboarding token (never logged)
    const { rawToken, tokenHash } = this.generateSecureToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // 6. Atomically persist invitation & pending membership
    const { invitation } = await this.repo.createInvitation(
      organizationId,
      {
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone || null,
        roleId: dto.roleId,
        locationId: targetLocationId,
        accessLevel: dto.accessLevel || 'MEMBER',
        membershipType: dto.membershipType || 'STAFF',
        tokenHash,
        expiresAt,
      },
      audit
    );

    // 7. Deliver Invitation Email
    if (dto.sendEmailNotification !== false) {
      try {
        const org = await (prisma as any).organization.findUnique({
          where: { id: organizationId },
          select: { displayName: true },
        });

        const inviter = await (prisma as any).user.findUnique({
          where: { id: audit.actorUserId },
          select: { firstName: true, lastName: true },
        });

        const tenantSettings = await settingsRepository.findByOrganizationId(organizationId).catch(() => null);

        const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}` : 'An administrator';
        const organizationName = org?.displayName || 'School Organization';

        // Frontend onboarding URL
        const acceptUrl = `http://localhost:3000/accept-invitation?token=${rawToken}`;

        await EmailService.renderAndSendTemplate(
          'USER_INVITATION',
          {
            recipientName: `${dto.firstName} ${dto.lastName}`,
            inviterName,
            organizationName,
            roleName: role.roleName,
            campusName: locationName,
            acceptUrl,
            expiresInDays: 7,
            supportEmail: tenantSettings?.smtp.replyTo || tenantSettings?.smtp.fromAddress || 'support@schoolerp.io',
          },
          email,
          tenantSettings?.smtp
        );
      } catch (emailErr) {
        logger.warn({ err: emailErr, email }, 'Failed to dispatch user invitation email; invitation remains recorded.');
      }
    }

    return {
      success: true,
      message: `Onboarding invitation dispatched successfully to ${email}`,
      invitationId: invitation.id,
    };
  }

  async acceptInvitation(
    dto: AcceptInvitationDto
  ): Promise<{ success: boolean; message: string; user: any }> {
    const tokenHash = crypto.createHash('sha256').update(dto.token.trim()).digest('hex');

    const invitation = await this.repo.findInvitationByTokenHash(tokenHash);
    if (!invitation || invitation.status !== 'PENDING') {
      throw AppError.badRequest(
        'Invalid, expired, or already redeemed invitation token. Please request a new invitation.',
        ErrorCode.INVALID_TOKEN
      );
    }

    if (new Date() > new Date(invitation.expiresAt)) {
      // Mark as expired
      await (prisma as any).organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });

      throw AppError.badRequest(
        'This invitation has expired. Please contact your institutional administrator to resend it.',
        ErrorCode.TOKEN_EXPIRED
      );
    }

    let passwordHash: string | undefined;
    if (dto.password) {
      const policy = await securityPolicyRepository.findByOrganizationId(invitation.organizationId);
      const validation = securityPolicyRepository.validatePassword(dto.password, policy);
      if (!validation.valid) {
        throw AppError.badRequest(
          `Password does not meet organization policy requirements: ${validation.errors.join('; ')}`,
          ErrorCode.VALIDATION_ERROR
        );
      }
      passwordHash = await hashPassword(dto.password);
    }

    const result = await this.repo.acceptInvitation(invitation, passwordHash, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });

    return {
      success: true,
      message: 'Account onboarding completed successfully. You may now sign in.',
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
    };
  }

  async resendInvitation(
    organizationId: string,
    invitationId: string,
    audit: AuditContext
  ): Promise<{ success: boolean; message: string }> {
    const existing = await (prisma as any).organizationInvitation.findFirst({
      where: { id: invitationId, organizationId },
      include: { role: true, location: true },
    });

    if (!existing) {
      throw AppError.notFound('Invitation not found', ErrorCode.NOT_FOUND);
    }

    if (existing.status === 'ACCEPTED') {
      throw AppError.badRequest(
        'This invitation has already been accepted and cannot be resent.',
        ErrorCode.BAD_REQUEST
      );
    }

    const { rawToken, tokenHash } = this.generateSecureToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.repo.resendInvitation(invitationId, tokenHash, expiresAt, audit);

    // Re-dispatch email
    try {
      const org = await (prisma as any).organization.findUnique({
        where: { id: organizationId },
        select: { displayName: true },
      });

      const inviter = await (prisma as any).user.findUnique({
        where: { id: audit.actorUserId },
        select: { firstName: true, lastName: true },
      });

      const tenantSettings = await settingsRepository.findByOrganizationId(organizationId).catch(() => null);

      const acceptUrl = `http://localhost:3000/accept-invitation?token=${rawToken}`;

      await EmailService.renderAndSendTemplate(
        'USER_INVITATION',
        {
          recipientName: existing.email,
          inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : 'An administrator',
          organizationName: org?.displayName || 'School Organization',
          roleName: existing.role.roleName,
          campusName: existing.location?.name || 'All-Campus Scope',
          acceptUrl,
          expiresInDays: 7,
          supportEmail: tenantSettings?.smtp.replyTo || tenantSettings?.smtp.fromAddress || 'support@schoolerp.io',
        },
        existing.email,
        tenantSettings?.smtp
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to re-dispatch invitation email');
    }

    return {
      success: true,
      message: `Invitation resent successfully to ${existing.email}`,
    };
  }

  async revokeInvitation(
    organizationId: string,
    invitationId: string,
    audit: AuditContext
  ): Promise<{ success: boolean; message: string }> {
    const existing = await (prisma as any).organizationInvitation.findFirst({
      where: { id: invitationId, organizationId },
    });

    if (!existing) {
      throw AppError.notFound('Invitation not found', ErrorCode.NOT_FOUND);
    }

    if (existing.status === 'ACCEPTED') {
      throw AppError.badRequest(
        'This invitation has already been accepted and cannot be revoked.',
        ErrorCode.BAD_REQUEST
      );
    }

    await this.repo.revokeInvitation(invitationId, audit);

    return {
      success: true,
      message: `Invitation for ${existing.email} revoked successfully`,
    };
  }

  async listInvitations(
    organizationId: string,
    statusFilter?: any
  ): Promise<InvitationSummaryDto[]> {
    return this.repo.listInvitations(organizationId, statusFilter);
  }
}

export const usersService = new UsersService();
