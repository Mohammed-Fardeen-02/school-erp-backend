import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { EffectivePermissionsService } from '../../core/authorization/effective-permissions.service';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { EmailService } from '../../integrations/email/email.service';

vi.mock('../../integrations/email/email.service', () => ({
  EmailService: {
    renderAndSendTemplate: vi.fn().mockResolvedValue({ success: true, messageId: 'msg-123' }),
  },
}));

vi.mock('../settings/settings.repository', () => ({
  settingsRepository: {
    findByOrganizationId: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../core/database/prisma-client', () => {
  const mockPrisma = {
    role: {
      findFirst: vi.fn(),
    },
    location: {
      findFirst: vi.fn(),
    },
    organizationMembership: {
      findUnique: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    organizationInvitation: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from '../../core/database/prisma-client';

describe('UsersService', () => {
  let usersService: UsersService;
  let mockRepo: Partial<UsersRepository>;
  let mockPermsService: Partial<EffectivePermissionsService>;

  const mockAudit = {
    actorUserId: 'admin-usr-1',
    organizationId: 'org-123',
    locationId: 'loc-main',
    ipAddress: '127.0.0.1',
    userAgent: 'vitest-agent',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      listOrganizationUsers: vi.fn(),
      findUserInOrganization: vi.fn(),
      updateUserProfile: vi.fn(),
      toggleUserStatus: vi.fn(),
      findByEmail: vi.fn(),
      createInvitation: vi.fn(),
      findInvitationByTokenHash: vi.fn(),
      acceptInvitation: vi.fn(),
      findInvitationById: vi.fn(),
      resendInvitation: vi.fn(),
      revokeInvitation: vi.fn(),
      listInvitations: vi.fn(),
    };

    mockPermsService = {
      getEffectivePermissions: vi.fn().mockResolvedValue(new Set(['settings.user_assignments.allocations.assign', 'academic.classes.view'])),
    };

    usersService = new UsersService(
      mockRepo as UsersRepository,
      mockPermsService as EffectivePermissionsService
    );
  });

  describe('listUsers', () => {
    it('should return paginated user results for organization', async () => {
      const mockResult = {
        data: [
          {
            id: 'usr-1',
            email: 'alice@school.edu',
            firstName: 'Alice',
            lastName: 'Smith',
            phone: '+1234567890',
            accountStatus: 'ACTIVE',
            membershipStatus: 'ACTIVE',
            isPrimary: true,
            roles: [{ id: 'role-1', code: 'TEACHER', name: 'Teacher', scope: 'ORGANIZATION' }],
            campuses: [{ id: 'loc-1', code: 'MAIN', name: 'Main Campus', isMainCampus: true }],
            lastLoginAt: null,
            createdAt: new Date().toISOString(),
          },
        ],
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };

      (mockRepo.listOrganizationUsers as any).mockResolvedValue(mockResult);

      const res = await usersService.listUsers('org-123', { page: 1, limit: 10, search: 'Alice' });

      expect(mockRepo.listOrganizationUsers).toHaveBeenCalledWith('org-123', { page: 1, limit: 10, search: 'Alice' });
      expect(res.data).toHaveLength(1);
      expect(res.data[0].email).toBe('alice@school.edu');
    });
  });

  describe('getUserById', () => {
    it('should return user details when found', async () => {
      const mockUser = {
        id: 'usr-1',
        email: 'bob@school.edu',
        firstName: 'Bob',
        lastName: 'Jones',
        phone: null,
        accountStatus: 'ACTIVE',
        memberships: [],
        roles: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (mockRepo.findUserInOrganization as any).mockResolvedValue(mockUser);

      const res = await usersService.getUserById('org-123', 'usr-1');

      expect(mockRepo.findUserInOrganization).toHaveBeenCalledWith('org-123', 'usr-1');
      expect(res.email).toBe('bob@school.edu');
    });

    it('should throw 404 AppError when user is not found in organization', async () => {
      (mockRepo.findUserInOrganization as any).mockResolvedValue(null);

      await expect(usersService.getUserById('org-123', 'usr-nonexistent')).rejects.toThrow(AppError);
    });
  });

  describe('updateUserProfile', () => {
    it('should update user profile through repository', async () => {
      (mockRepo.findUserInOrganization as any).mockResolvedValue({ id: 'usr-1' });
      (mockRepo.updateUserProfile as any).mockResolvedValue({ id: 'usr-1', firstName: 'Updated' });

      const res = await usersService.updateUserProfile(
        'org-123',
        'usr-1',
        { firstName: 'Updated', lastName: 'Name' },
        mockAudit
      );

      expect(mockRepo.updateUserProfile).toHaveBeenCalledWith(
        'usr-1',
        'org-123',
        { firstName: 'Updated', lastName: 'Name' },
        mockAudit
      );
      expect(res.firstName).toBe('Updated');
    });

    it('should throw 404 if user not found before update', async () => {
      (mockRepo.findUserInOrganization as any).mockResolvedValue(null);

      await expect(
        usersService.updateUserProfile('org-123', 'usr-none', { firstName: 'Test' }, mockAudit)
      ).rejects.toThrow(AppError);
    });
  });

  describe('toggleUserStatus', () => {
    it('should prohibit self-deactivation', async () => {
      await expect(
        usersService.toggleUserStatus(
          'org-123',
          'admin-usr-1', // Same as actorUserId
          { isActive: false, reason: 'Trying to deactivate self' },
          mockAudit
        )
      ).rejects.toThrow('Self-deactivation prohibited');
    });

    it('should allow deactivating another user in organization', async () => {
      (mockRepo.findUserInOrganization as any).mockResolvedValue({ id: 'usr-target' });
      (mockRepo.toggleUserStatus as any).mockResolvedValue({
        id: 'usr-target',
        accountStatus: 'SUSPENDED',
        membershipStatus: 'SUSPENDED',
      });

      const res = await usersService.toggleUserStatus(
        'org-123',
        'usr-target',
        { isActive: false, reason: 'Security policy violation' },
        mockAudit
      );

      expect(mockRepo.toggleUserStatus).toHaveBeenCalledWith(
        'org-123',
        'usr-target',
        false,
        'Security policy violation',
        mockAudit
      );
      expect(res.accountStatus).toBe('SUSPENDED');
    });

    it('should allow activating a suspended user', async () => {
      (mockRepo.findUserInOrganization as any).mockResolvedValue({ id: 'usr-target' });
      (mockRepo.toggleUserStatus as any).mockResolvedValue({
        id: 'usr-target',
        accountStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
      });

      const res = await usersService.toggleUserStatus(
        'org-123',
        'usr-target',
        { isActive: true, reason: 'Account reinstated' },
        mockAudit
      );

      expect(mockRepo.toggleUserStatus).toHaveBeenCalledWith(
        'org-123',
        'usr-target',
        true,
        'Account reinstated',
        mockAudit
      );
      expect(res.accountStatus).toBe('ACTIVE');
    });
  });

  describe('inviteUser', () => {
    it('should throw 404 if specified role does not exist', async () => {
      (prisma.role.findFirst as any).mockResolvedValue(null);

      await expect(
        usersService.inviteUser(
          'org-123',
          {
            email: 'new@school.edu',
            firstName: 'New',
            lastName: 'User',
            roleId: 'role-missing',
          },
          mockAudit
        )
      ).rejects.toThrow('Specified role was not found');
    });

    it('should throw 400 if specified campus location does not exist in organization', async () => {
      (prisma.role.findFirst as any).mockResolvedValue({
        id: 'role-1',
        roleName: 'Teacher',
        permissions: [],
      });
      (prisma.location.findFirst as any).mockResolvedValue(null);

      await expect(
        usersService.inviteUser(
          'org-123',
          {
            email: 'new@school.edu',
            firstName: 'New',
            lastName: 'User',
            roleId: 'role-1',
            locationId: 'loc-invalid',
          },
          mockAudit
        )
      ).rejects.toThrow('Specified campus location does not belong to this organization');
    });

    it('should enforce scope-aware delegation ceiling and throw 403 if admin lacks role permissions', async () => {
      (prisma.role.findFirst as any).mockResolvedValue({
        id: 'role-super',
        roleName: 'SuperAdmin',
        permissions: [
          { node: { nodeCode: 'billing.subscriptions.manage' } },
        ],
      });

      // Admin only has: ['settings.user_assignments.allocations.assign', 'academic.classes.view']
      await expect(
        usersService.inviteUser(
          'org-123',
          {
            email: 'new@school.edu',
            firstName: 'New',
            lastName: 'User',
            roleId: 'role-super',
          },
          mockAudit
        )
      ).rejects.toThrow('Delegation ceiling violation');
    });

    it('should throw 409 conflict if user is already an ACTIVE member of the organization', async () => {
      (prisma.role.findFirst as any).mockResolvedValue({
        id: 'role-teacher',
        roleName: 'Teacher',
        permissions: [{ node: { nodeCode: 'academic.classes.view' } }],
      });
      (mockRepo.findByEmail as any).mockResolvedValue({ id: 'usr-existing', email: 'alice@school.edu' });
      (prisma.organizationMembership.findUnique as any).mockResolvedValue({
        id: 'mem-1',
        status: 'ACTIVE',
      });

      await expect(
        usersService.inviteUser(
          'org-123',
          {
            email: 'alice@school.edu',
            firstName: 'Alice',
            lastName: 'Smith',
            roleId: 'role-teacher',
          },
          mockAudit
        )
      ).rejects.toThrow('already an active member');
    });

    it('should generate secure token hash, persist invitation, and dispatch onboarding email', async () => {
      (prisma.role.findFirst as any).mockResolvedValue({
        id: 'role-teacher',
        roleName: 'Teacher',
        permissions: [{ node: { nodeCode: 'academic.classes.view' } }],
      });
      (mockRepo.findByEmail as any).mockResolvedValue(null);
      (prisma.organization.findUnique as any).mockResolvedValue({
        id: 'org-123',
        displayName: 'Springfield Academy',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        firstName: 'Admin',
        lastName: 'User',
      });

      (mockRepo.createInvitation as any).mockResolvedValue({
        invitation: { id: 'inv-999', email: 'newbie@school.edu' },
      });

      const res = await usersService.inviteUser(
        'org-123',
        {
          email: 'newbie@school.edu',
          firstName: 'Newbie',
          lastName: 'Teacher',
          roleId: 'role-teacher',
        },
        mockAudit
      );

      expect(mockRepo.createInvitation).toHaveBeenCalled();
      expect(EmailService.renderAndSendTemplate).toHaveBeenCalledWith(
        'USER_INVITATION',
        expect.objectContaining({
          organizationName: 'Springfield Academy',
          roleName: 'Teacher',
          recipientName: 'Newbie Teacher',
        }),
        'newbie@school.edu',
        undefined
      );
      expect(res.success).toBe(true);
      expect(res.invitationId).toBe('inv-999');
    });
  });

  describe('acceptInvitation', () => {
    it('should throw 400 when invitation token is invalid', async () => {
      (mockRepo.findInvitationByTokenHash as any).mockResolvedValue(null);

      await expect(
        usersService.acceptInvitation({
          token: 'invalid-plain-token',
          password: 'Password123!',
        })
      ).rejects.toThrow('Invalid, expired, or already redeemed invitation token');
    });

    it('should throw 400 when invitation token is expired', async () => {
      (mockRepo.findInvitationByTokenHash as any).mockResolvedValue({
        id: 'inv-1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 100000), // Expired
      });
      (prisma.organizationInvitation.update as any).mockResolvedValue({});

      await expect(
        usersService.acceptInvitation({
          token: 'expired-token',
          password: 'Password123!',
        })
      ).rejects.toThrow('This invitation has expired');
    });

    it('should throw 400 when password violates organizational security policy', async () => {
      (mockRepo.findInvitationByTokenHash as any).mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-123',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(
        usersService.acceptInvitation({
          token: 'valid-token',
          password: 'weak',
        })
      ).rejects.toThrow('Password does not meet organization policy requirements');
    });

    it('should successfully accept invitation and complete onboarding', async () => {
      (mockRepo.findInvitationByTokenHash as any).mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-123',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 100000),
      });

      (mockRepo.acceptInvitation as any).mockResolvedValue({
        user: {
          id: 'usr-accepted',
          email: 'accepted@school.edu',
          firstName: 'UpdatedFirst',
          lastName: 'User',
        },
        organizationId: 'org-123',
      });

      const res = await usersService.acceptInvitation({
        token: 'valid-token',
        password: 'ValidPassword123!',
        firstName: 'UpdatedFirst',
      });

      expect(mockRepo.acceptInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'inv-1' }),
        expect.any(String),
        expect.objectContaining({
          firstName: 'UpdatedFirst',
        })
      );
      expect(res.success).toBe(true);
      expect(res.user.id).toBe('usr-accepted');
    });
  });

  describe('resendInvitation & revokeInvitation', () => {
    it('should resend invitation with new token and email dispatch', async () => {
      (prisma.organizationInvitation.findFirst as any).mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-123',
        email: 'pending@school.edu',
        status: 'PENDING',
        role: { roleName: 'Staff' },
        location: null,
      });

      (prisma.organization.findUnique as any).mockResolvedValue({
        id: 'org-123',
        displayName: 'Springfield Academy',
      });
      (prisma.user.findUnique as any).mockResolvedValue({
        firstName: 'Admin',
        lastName: 'User',
      });

      (mockRepo.resendInvitation as any).mockResolvedValue({ id: 'inv-1' });

      const res = await usersService.resendInvitation('org-123', 'inv-1', mockAudit);

      expect(mockRepo.resendInvitation).toHaveBeenCalled();
      expect(EmailService.renderAndSendTemplate).toHaveBeenCalled();
      expect(res.success).toBe(true);
    });

    it('should revoke invitation and update status', async () => {
      (prisma.organizationInvitation.findFirst as any).mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-123',
        status: 'PENDING',
      });

      (mockRepo.revokeInvitation as any).mockResolvedValue({ id: 'inv-1', status: 'REVOKED' });

      const res = await usersService.revokeInvitation('org-123', 'inv-1', mockAudit);

      expect(mockRepo.revokeInvitation).toHaveBeenCalledWith('inv-1', mockAudit);
      expect(res.success).toBe(true);
    });
  });
});
