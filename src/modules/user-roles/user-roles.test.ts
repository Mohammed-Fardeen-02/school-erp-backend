import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRolesService } from './user-roles.service';
import { UserRolesRepository } from './user-roles.repository';
import { UserRolesController } from './user-roles.controller';
import { RoleType, Prisma } from '@prisma/client';
import { EffectivePermissionsService } from '../../core/authorization/effective-permissions.service';
import {
  assignRoleSchema,
  revokeRoleSchema,
  userRoleQuerySchema,
} from './user-roles.validation';

describe('Stage 3.5: User-Role Assignments Domain Service & Security Controls', () => {
  let mockPrisma: any;
  let mockRepo: UserRolesRepository;
  let mockPermsService: EffectivePermissionsService;
  let service: UserRolesService;

  const orgId = 'org-greenwood-1';
  const otherOrgId = 'org-oakridge-2';
  const campusAId = 'campus-north-1';
  const campusBId = 'campus-south-2';
  const adminActorId = 'user-admin-1';
  const targetStaffId = 'user-teacher-2';
  const activeMembershipId = 'mem-teacher-1';
  const sampleRoleId = 'role-teacher-1';

  const auditContext = {
    actorUserId: adminActorId,
    ipAddress: '127.0.0.1',
    userAgent: 'vitest-test-agent',
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
      },
      organizationMembership: {
        findFirst: vi.fn(),
      },
      role: {
        findFirst: vi.fn(),
      },
      location: {
        findFirst: vi.fn(),
      },
      userRole: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      rbacInvalidationOutbox: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    mockRepo = new UserRolesRepository(mockPrisma as any);
    mockPermsService = {
      getEffectivePermissions: vi.fn(),
      hasPermission: vi.fn().mockResolvedValue(true),
      invalidateUserCache: vi.fn().mockResolvedValue(undefined),
      invalidateOrgCache: vi.fn().mockResolvedValue(undefined),
    } as any;

    service = new UserRolesService(mockRepo, mockPrisma as any, mockPermsService);
    vi.clearAllMocks();
  });

  describe('1. Anti-Self-Assignment & Anti-Self-Revocation Guardrails', () => {
    it('should reject when an actor attempts to assign a role to themselves', async () => {
      await expect(
        service.assignRole(
          adminActorId,
          orgId,
          {
            userId: adminActorId, // Self-assignment attempt
            roleId: sampleRoleId,
          },
          auditContext
        )
      ).rejects.toThrow('Anti-self-assignment violation');
    });

    it('should reject when an actor attempts to revoke their own role assignment', async () => {
      mockPrisma.userRole.findFirst.mockResolvedValue({
        id: 'assignment-self-1',
        userId: adminActorId, // Actor's own assignment
        organizationId: orgId,
        roleId: sampleRoleId,
        isActive: true,
        role: { permissions: [] },
      });

      await expect(
        service.revokeRole(
          adminActorId,
          orgId,
          'assignment-self-1',
          { reason: 'Attempting to self-revoke' },
          auditContext
        )
      ).rejects.toThrow('Anti-self-revocation violation');
    });
  });

  describe('2. Target User & Active Tenant Membership Validation', () => {
    it('should reject assignment if target user does not exist or is inactive', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.assignRole(
          adminActorId,
          orgId,
          {
            userId: targetStaffId,
            roleId: sampleRoleId,
          },
          auditContext
        )
      ).rejects.toThrow('Target user not found or inactive');
    });

    it('should reject assignment if target user has no ACTIVE membership in this organization', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: targetStaffId,
        isActive: true,
        status: 'ACTIVE',
      });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue(null);

      await expect(
        service.assignRole(
          adminActorId,
          orgId,
          {
            userId: targetStaffId,
            roleId: sampleRoleId,
          },
          auditContext
        )
      ).rejects.toThrow('Target user does not have an active membership in this organization');
    });
  });

  describe('3. Role Existence & Tenant Ownership Validation', () => {
    it('should reject assignment if role is not accessible to this tenant or inactive', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: targetStaffId,
        isActive: true,
        status: 'ACTIVE',
      });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(
        service.assignRole(
          adminActorId,
          orgId,
          {
            userId: targetStaffId,
            roleId: 'foreign-or-inactive-role',
          },
          auditContext
        )
      ).rejects.toThrow('Role not found, inactive, or not accessible to this organization');
    });
  });

  describe('4. Campus Location Validation & Campus Isolation', () => {
    it('should reject assignment if location does not belong to this organization or is inactive', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: targetStaffId,
        isActive: true,
        status: 'ACTIVE',
      });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });
      mockPrisma.role.findFirst.mockResolvedValue({
        id: sampleRoleId,
        roleCode: 'TEACHER',
        roleName: 'Teacher',
        isActive: true,
        permissions: [],
      });
      mockPrisma.location.findFirst.mockResolvedValue(null); // Location not found in this org

      await expect(
        service.assignRole(
          adminActorId,
          orgId,
          {
            userId: targetStaffId,
            roleId: sampleRoleId,
            locationId: 'foreign-campus-99',
          },
          auditContext
        )
      ).rejects.toThrow('Campus location not found, inactive, or does not belong to this organization');
    });
  });

  describe('5. Scope-Aware Delegation Ceiling Enforcement', () => {
    it('should reject role assignment if caller lacks granted permissions at the target scope', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: targetStaffId,
        isActive: true,
        status: 'ACTIVE',
      });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });
      mockPrisma.role.findFirst.mockResolvedValue({
        id: sampleRoleId,
        roleCode: 'ACCOUNTANT',
        roleName: 'Accountant',
        isActive: true,
        permissions: [
          { isGranted: true, node: { nodeCode: 'fees.invoices.billing.view', isActive: true } },
          { isGranted: true, node: { nodeCode: 'fees.payments.collections.create', isActive: true } },
        ],
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null); // No existing assignment

      // Actor only holds fees.invoices.billing.view, lacks collections.create
      (mockPermsService.getEffectivePermissions as any).mockResolvedValue(
        new Set(['fees.invoices.billing.view'])
      );

      await expect(
        service.assignRole(
          adminActorId,
          orgId,
          {
            userId: targetStaffId,
            roleId: sampleRoleId,
            locationId: null, // Org-wide
          },
          auditContext
        )
      ).rejects.toThrow(
        'Delegation ceiling violation: You cannot assign a role containing permissions you do not actively possess at target scope: [fees.payments.collections.create]'
      );
    });

    it('should enforce campus isolation: campus authority does not grant org-wide delegation authority', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: targetStaffId,
        isActive: true,
        status: 'ACTIVE',
      });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });
      mockPrisma.role.findFirst.mockResolvedValue({
        id: sampleRoleId,
        roleCode: 'CAMPUS_HEAD',
        roleName: 'Campus Head',
        isActive: true,
        permissions: [
          { isGranted: true, node: { nodeCode: 'academics.curriculum.courses.view', isActive: true } },
        ],
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null);

      // Actor holds academics permission at Campus A, but attempt is made org-wide (locationId: null)
      (mockPermsService.getEffectivePermissions as any).mockImplementation(
        async (_userId: string, _orgId: string, locId?: string | null) => {
          if (locId === campusAId) {
            return new Set(['academics.curriculum.courses.view']);
          }
          return new Set<string>(); // Empty at org-wide or Campus B
        }
      );

      await expect(
        service.assignRole(
          adminActorId,
          orgId,
          {
            userId: targetStaffId,
            roleId: sampleRoleId,
            locationId: null, // Org-wide delegation attempt
          },
          auditContext
        )
      ).rejects.toThrow('Delegation ceiling violation');
    });

    it('should reject assignment if caller lacks assign authority at the target scope (SEC-2)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: targetStaffId,
        isActive: true,
        status: 'ACTIVE',
      });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });
      mockPrisma.role.findFirst.mockResolvedValue({
        id: sampleRoleId,
        roleCode: 'CAMPUS_HEAD',
        roleName: 'Campus Head',
        isActive: true,
        permissions: [],
      });
      mockPrisma.location.findFirst.mockResolvedValue({ id: campusBId });
      mockPrisma.userRole.findFirst.mockResolvedValue(null);

      // Actor does not hold settings.user_assignments.allocations.assign at Campus B
      (mockPermsService.hasPermission as any).mockImplementation(
        async (_userId: string, _orgId: string, locId?: string | null, nodeCode?: string) => {
          if (nodeCode === 'settings.user_assignments.allocations.assign' && locId === campusBId) {
            return false;
          }
          return true;
        }
      );

      await expect(
        service.assignRole(
          adminActorId,
          orgId,
          {
            userId: targetStaffId,
            roleId: sampleRoleId,
            locationId: campusBId,
          },
          auditContext
        )
      ).rejects.toThrow('You lack authority to assign roles at the target scope');
    });

    it('should reject revocation if caller lacks revoke authority at the assigned campus scope (SEC-2)', async () => {
      mockPrisma.userRole.findFirst.mockResolvedValue({
        id: 'assignment-1',
        userId: targetStaffId,
        organizationId: orgId,
        roleId: sampleRoleId,
        locationId: campusAId,
        isActive: true,
        role: { permissions: [] },
      });

      // Caller does not hold settings.user_assignments.allocations.revoke at campus A
      (mockPermsService.hasPermission as any).mockImplementation(
        async (_userId: string, _orgId: string, locId?: string | null, nodeCode?: string) => {
          if (nodeCode === 'settings.user_assignments.allocations.revoke' && locId === campusAId) {
            return false;
          }
          return true;
        }
      );

      await expect(
        service.revokeRole(
          adminActorId,
          orgId,
          'assignment-1',
          { reason: 'Revoking higher privilege' },
          auditContext
        )
      ).rejects.toThrow('You lack authority to revoke role assignments at the target assignment scope');
    });

    it('should permit revocation of specialist roles even if caller does not hold leaf operational permissions, provided caller has revoke authority (SEC-1)', async () => {
      const specialistAssignment = {
        id: 'specialist-assignment-1',
        userId: targetStaffId,
        organizationId: orgId,
        roleId: 'role-accountant-1',
        locationId: campusAId,
        isActive: true,
        role: {
          id: 'role-accountant-1',
          roleCode: 'ACCOUNTANT',
          roleName: 'Accountant',
          permissions: [
            { isGranted: true, node: { nodeCode: 'fees.payments.collections.create', isActive: true } },
          ],
        },
      };

      mockPrisma.userRole.findFirst.mockResolvedValue(specialistAssignment);

      // Caller holds revoke permission at Campus A
      (mockPermsService.hasPermission as any).mockResolvedValue(true);

      mockPrisma.userRole.update.mockResolvedValue({
        ...specialistAssignment,
        isActive: false,
        revokedBy: adminActorId,
        revokedAt: new Date(),
        reason: 'Staff reassigned',
      });

      const result = await service.revokeRole(
        adminActorId,
        orgId,
        'specialist-assignment-1',
        { reason: 'Staff reassigned' },
        auditContext
      );

      expect(result.isActive).toBe(false);
      expect(mockPrisma.userRole.update).toHaveBeenCalled();
    });
  });

  describe('6. Concurrency & Duplicate Active Assignment Guardrails', () => {
    it('should reject when an active assignment already exists for the same user, role, and scope', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: targetStaffId,
        isActive: true,
        status: 'ACTIVE',
      });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });
      mockPrisma.role.findFirst.mockResolvedValue({
        id: sampleRoleId,
        roleCode: 'TEACHER',
        roleName: 'Teacher',
        isActive: true,
        permissions: [],
      });

      // Existing active assignment found in repo check
      mockPrisma.userRole.findFirst.mockResolvedValue({
        id: 'existing-active-1',
        isActive: true,
      });

      await expect(
        service.assignRole(
          adminActorId,
          orgId,
          {
            userId: targetStaffId,
            roleId: sampleRoleId,
          },
          auditContext
        )
      ).rejects.toThrow('An active role assignment already exists for this user, role, and scope');
    });

    it('should handle concurrent race condition and translate database P2002 into 409 Conflict', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: targetStaffId,
        isActive: true,
        status: 'ACTIVE',
      });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });
      mockPrisma.role.findFirst.mockResolvedValue({
        id: sampleRoleId,
        roleCode: 'TEACHER',
        roleName: 'Teacher',
        isActive: true,
        permissions: [],
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null); // repo check passed

      (mockPermsService.getEffectivePermissions as any).mockResolvedValue(new Set());

      // Concurrent insert throws P2002
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`user_id`, `organization_id`, `role_id`)',
        { code: 'P2002', clientVersion: '5.x' }
      );
      mockPrisma.userRole.create.mockRejectedValue(p2002Error);

      await expect(
        service.assignRole(
          adminActorId,
          orgId,
          {
            userId: targetStaffId,
            roleId: sampleRoleId,
          },
          auditContext
        )
      ).rejects.toThrow('An active role assignment already exists for this user, role, and scope');
    });
  });

  describe('7. Successful Assignment & Transactional Outbox/Audit Integration', () => {
    it('should successfully create assignment, outbox event, audit log, and invalidate user cache', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: targetStaffId,
        isActive: true,
        status: 'ACTIVE',
      });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });
      mockPrisma.role.findFirst.mockResolvedValue({
        id: sampleRoleId,
        roleCode: 'TEACHER',
        roleName: 'Teacher',
        roleType: RoleType.SYSTEM_TEMPLATE,
        isActive: true,
        permissions: [
          { isGranted: true, node: { nodeCode: 'academics.classes.grades.view', isActive: true } },
        ],
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null); // No existing assignment

      (mockPermsService.getEffectivePermissions as any).mockResolvedValue(
        new Set(['academics.classes.grades.view'])
      );

      mockPrisma.userRole.create.mockResolvedValue({
        id: 'new-assignment-1',
        userId: targetStaffId,
        organizationId: orgId,
        roleId: sampleRoleId,
        locationId: null,
        membershipId: activeMembershipId,
        isActive: true,
        assignedBy: adminActorId,
        assignedAt: new Date(),
        revokedBy: null,
        revokedAt: null,
        reason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: {
          id: sampleRoleId,
          roleCode: 'TEACHER',
          roleName: 'Teacher',
          roleType: RoleType.SYSTEM_TEMPLATE,
          description: null,
        },
        location: null,
        user: {
          id: targetStaffId,
          email: 'teacher@greenwood.edu',
          firstName: 'John',
          lastName: 'Doe',
        },
      });

      const result = await service.assignRole(
        adminActorId,
        orgId,
        {
          userId: targetStaffId,
          roleId: sampleRoleId,
          locationId: null,
        },
        auditContext
      );

      expect(result.id).toBe('new-assignment-1');
      expect(result.isActive).toBe(true);

      // Verify Transactional Outbox Event created
      expect(mockPrisma.rbacInvalidationOutbox.create).toHaveBeenCalledWith({
        data: {
          eventType: 'USER_ROLE_ASSIGNED',
          organizationId: orgId,
          userId: targetStaffId,
          processed: false,
        },
      });

      // Verify Transactional Audit Log created
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            userId: adminActorId,
            action: 'USER_ROLE_ASSIGNED',
            entity: 'UserRole',
            entityId: 'new-assignment-1',
          }),
        })
      );

      // Verify targeted user cache invalidation
      expect(mockPermsService.invalidateUserCache).toHaveBeenCalledWith(
        targetStaffId,
        orgId
      );
    });
  });

  describe('8. Non-Destructive Revocation Lifecycle & Re-Assignment', () => {
    it('should reject revocation if assignment does not belong to the organization', async () => {
      mockPrisma.userRole.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeRole(
          adminActorId,
          orgId,
          'non-existent-or-other-tenant-id',
          { reason: 'Role changed' },
          auditContext
        )
      ).rejects.toThrow('Role assignment not found in this organization');
    });

    it('should reject revocation if assignment is already revoked', async () => {
      mockPrisma.userRole.findFirst.mockResolvedValue({
        id: 'assignment-1',
        organizationId: orgId,
        userId: targetStaffId,
        isActive: false, // Already revoked
      });

      await expect(
        service.revokeRole(
          adminActorId,
          orgId,
          'assignment-1',
          { reason: 'Role changed again' },
          auditContext
        )
      ).rejects.toThrow('Role assignment is already revoked');
    });

    it('should non-destructively revoke assignment, preserve lifecycle timestamps, and record USER_ROLE_REVOKED', async () => {
      const existingAssignment = {
        id: 'assignment-to-revoke',
        userId: targetStaffId,
        organizationId: orgId,
        roleId: sampleRoleId,
        locationId: campusAId,
        isActive: true,
        assignedBy: 'initial-admin',
        assignedAt: new Date('2026-01-01'),
        role: {
          id: sampleRoleId,
          roleCode: 'TEACHER',
          roleName: 'Teacher',
          permissions: [],
        },
      };

      mockPrisma.userRole.findFirst.mockResolvedValue(existingAssignment);
      (mockPermsService.getEffectivePermissions as any).mockResolvedValue(new Set());

      mockPrisma.userRole.update.mockResolvedValue({
        ...existingAssignment,
        isActive: false,
        revokedBy: adminActorId,
        revokedAt: new Date(),
        reason: 'Staff member transferred to branch campus',
        role: {
          id: sampleRoleId,
          roleCode: 'TEACHER',
          roleName: 'Teacher',
          roleType: RoleType.SYSTEM_TEMPLATE,
          description: null,
        },
        location: {
          id: campusAId,
          code: 'CAMPUS-NORTH',
          name: 'North Campus',
        },
        user: {
          id: targetStaffId,
          email: 'teacher@greenwood.edu',
          firstName: 'John',
          lastName: 'Doe',
        },
      });

      const revokedResult = await service.revokeRole(
        adminActorId,
        orgId,
        'assignment-to-revoke',
        { reason: 'Staff member transferred to branch campus' },
        auditContext
      );

      expect(revokedResult.isActive).toBe(false);
      expect(revokedResult.revokedBy).toBe(adminActorId);
      expect(revokedResult.reason).toBe('Staff member transferred to branch campus');

      // Verify update did not delete historical record
      expect(mockPrisma.userRole.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'assignment-to-revoke' },
          data: expect.objectContaining({
            isActive: false,
            revokedBy: adminActorId,
            reason: 'Staff member transferred to branch campus',
          }),
        })
      );

      // Verify USER_ROLE_REVOKED outbox event
      expect(mockPrisma.rbacInvalidationOutbox.create).toHaveBeenCalledWith({
        data: {
          eventType: 'USER_ROLE_REVOKED',
          organizationId: orgId,
          userId: targetStaffId,
          processed: false,
        },
      });

      // Verify Audit Log
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            userId: adminActorId,
            action: 'USER_ROLE_REVOKED',
            entity: 'UserRole',
            entityId: 'assignment-to-revoke',
          }),
        })
      );

      // Verify user cache invalidated
      expect(mockPermsService.invalidateUserCache).toHaveBeenCalledWith(
        targetStaffId,
        orgId
      );
    });

    it('should permit re-assignment after revocation, creating a new record without modifying the revoked one', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: targetStaffId,
        isActive: true,
        status: 'ACTIVE',
      });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });
      mockPrisma.role.findFirst.mockResolvedValue({
        id: sampleRoleId,
        roleCode: 'TEACHER',
        roleName: 'Teacher',
        roleType: RoleType.SYSTEM_TEMPLATE,
        isActive: true,
        permissions: [],
      });

      // When checking for existing active assignment, none is found (since previous is revoked isActive=false)
      mockPrisma.userRole.findFirst.mockResolvedValue(null);

      (mockPermsService.getEffectivePermissions as any).mockResolvedValue(new Set());

      mockPrisma.userRole.create.mockResolvedValue({
        id: 'new-reassignment-2',
        userId: targetStaffId,
        organizationId: orgId,
        roleId: sampleRoleId,
        locationId: null,
        membershipId: activeMembershipId,
        isActive: true,
        assignedBy: adminActorId,
        assignedAt: new Date(),
        role: {
          id: sampleRoleId,
          roleCode: 'TEACHER',
          roleName: 'Teacher',
          roleType: RoleType.SYSTEM_TEMPLATE,
        },
        user: { id: targetStaffId },
      });

      const reassignResult = await service.assignRole(
        adminActorId,
        orgId,
        {
          userId: targetStaffId,
          roleId: sampleRoleId,
        },
        auditContext
      );

      expect(reassignResult.id).toBe('new-reassignment-2');
      expect(reassignResult.isActive).toBe(true);
      expect(mockPrisma.userRole.create).toHaveBeenCalled();
    });
  });

  describe('9. User Assignment History Listing & Tenant Verification', () => {
    it('should reject listing if target user is not a member of the organization', async () => {
      mockPrisma.organizationMembership.findFirst.mockResolvedValue(null);

      await expect(
        service.listUserAssignments(adminActorId, orgId, 'external-user-id', {})
      ).rejects.toThrow('User not found in this organization');
    });

    it('should return active and historical assignments when caller has org-wide view authority', async () => {
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });

      // Caller has org-wide view authority
      (mockPermsService.hasPermission as any).mockResolvedValue(true);

      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          id: 'active-assignment-1',
          userId: targetStaffId,
          organizationId: orgId,
          roleId: sampleRoleId,
          locationId: null,
          membershipId: activeMembershipId,
          isActive: true,
          assignedBy: adminActorId,
          assignedAt: new Date('2026-02-01'),
          revokedBy: null,
          revokedAt: null,
          reason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: {
            id: sampleRoleId,
            roleCode: 'TEACHER',
            roleName: 'Teacher',
            roleType: RoleType.SYSTEM_TEMPLATE,
          },
          location: null,
          user: { id: targetStaffId },
        },
        {
          id: 'historical-revoked-assignment-2',
          userId: targetStaffId,
          organizationId: orgId,
          roleId: 'role-old-substitute',
          locationId: campusAId,
          membershipId: activeMembershipId,
          isActive: false,
          assignedBy: adminActorId,
          assignedAt: new Date('2025-09-01'),
          revokedBy: adminActorId,
          revokedAt: new Date('2026-01-15'),
          reason: 'Substitute period concluded',
          createdAt: new Date(),
          updatedAt: new Date(),
          role: {
            id: 'role-old-substitute',
            roleCode: 'SUBSTITUTE',
            roleName: 'Substitute Teacher',
            roleType: RoleType.CUSTOM,
          },
          location: { id: campusAId, code: 'CAMPUS-NORTH', name: 'North Campus' },
          user: { id: targetStaffId },
        },
      ]);

      const result = await service.listUserAssignments(adminActorId, orgId, targetStaffId, {});

      expect(result.length).toBe(2);
      expect(result[0].isActive).toBe(true);
      expect(result[1].isActive).toBe(false);
      expect(result[1].reason).toBe('Substitute period concluded');
    });

    it('should restrict assignments to caller authorized campuses when caller lacks org-wide view authority (SEC-3)', async () => {
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });

      // Caller lacks org-wide view authority, but holds view at campusAId
      (mockPermsService.hasPermission as any).mockImplementation(
        async (_userId: string, _orgId: string, locId?: string | null) => {
          if (locId === null) return false;
          if (locId === campusAId) return true;
          return false;
        }
      );

      mockPrisma.userRole.findMany.mockImplementation(async (args: any) => {
        // First call is caller's campus discovery
        if (args?.where?.userId === adminActorId) {
          return [{ locationId: campusAId }];
        }
        // Second call is target user assignments query filtered by allowedLocationIds
        expect(args?.where?.locationId).toEqual({ in: [campusAId] });
        return [
          {
            id: 'campus-a-assignment-1',
            userId: targetStaffId,
            organizationId: orgId,
            roleId: sampleRoleId,
            locationId: campusAId,
            isActive: true,
            role: { roleCode: 'TEACHER', roleName: 'Teacher', roleType: RoleType.SYSTEM_TEMPLATE },
          },
        ];
      });

      const result = await service.listUserAssignments(adminActorId, orgId, targetStaffId, {});

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('campus-a-assignment-1');
    });

    it('should reject listing when caller lacks view authority for the requested campus (SEC-3)', async () => {
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: activeMembershipId,
      });

      // Caller lacks org-wide view authority and only has campus A
      (mockPermsService.hasPermission as any).mockImplementation(
        async (_userId: string, _orgId: string, locId?: string | null) => {
          if (locId === campusAId) return true;
          return false;
        }
      );

      mockPrisma.userRole.findMany.mockResolvedValue([{ locationId: campusAId }]);

      // Caller requests campus B
      await expect(
        service.listUserAssignments(adminActorId, orgId, targetStaffId, {
          locationId: campusBId,
        })
      ).rejects.toThrow('You lack authority to view role assignments for the requested campus');
    });
  });

  describe('10. Validation Schema Tests', () => {
    it('should validate assignRoleSchema with valid org-wide payload', () => {
      const validPayload = {
        userId: '11111111-1111-1111-1111-111111111111',
        roleId: '22222222-2222-2222-2222-222222222222',
        locationId: null,
      };
      const result = assignRoleSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should validate assignRoleSchema with valid campus-scoped payload', () => {
      const validPayload = {
        userId: '11111111-1111-1111-1111-111111111111',
        roleId: '22222222-2222-2222-2222-222222222222',
        locationId: '33333333-3333-3333-3333-333333333333',
      };
      const result = assignRoleSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should reject assignRoleSchema with invalid UUID format', () => {
      const invalidPayload = {
        userId: 'not-a-uuid',
        roleId: '22222222-2222-2222-2222-222222222222',
      };
      const result = assignRoleSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should validate revokeRoleSchema with meaningful reason', () => {
      const valid = { reason: 'Staff member reassigned to administrative duties' };
      const result = revokeRoleSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject revokeRoleSchema with empty or too-short reason', () => {
      const invalid = { reason: '   ' };
      const result = revokeRoleSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should transform userRoleQuerySchema isActive parameter', () => {
      const parsedTrue = userRoleQuerySchema.safeParse({ isActive: 'true' });
      expect(parsedTrue.success).toBe(true);
      if (parsedTrue.success) {
        expect(parsedTrue.data.isActive).toBe(true);
      }

      const parsedFalse = userRoleQuerySchema.safeParse({ isActive: 'false' });
      expect(parsedFalse.success).toBe(true);
      if (parsedFalse.success) {
        expect(parsedFalse.data.isActive).toBe(false);
      }

      const parsedOmitted = userRoleQuerySchema.safeParse({});
      expect(parsedOmitted.success).toBe(true);
      if (parsedOmitted.success) {
        expect(parsedOmitted.data.isActive).toBeUndefined();
      }
    });
  });

  describe('11. UserRolesController Request Handlers', () => {
    let controller: UserRolesController;
    let mockReq: any;
    let mockRes: any;
    let mockNext: any;

    beforeEach(() => {
      controller = new UserRolesController(service);
      mockReq = {
        user: { id: adminActorId },
        organizationId: orgId,
        params: {},
        query: {},
        body: {},
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-browser' },
      };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
    });

    it('controller.assign should return 201 on success', async () => {
      const createdAssignment: any = { id: 'asgn-1', isActive: true };
      vi.spyOn(service, 'assignRole').mockResolvedValue(createdAssignment);

      mockReq.body = {
        userId: targetStaffId,
        roleId: sampleRoleId,
      };

      await controller.assign(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: createdAssignment,
          message: 'Role assigned successfully',
        })
      );
    });

    it('controller.revoke should return 200 on success', async () => {
      const revokedAssignment: any = { id: 'asgn-1', isActive: false };
      vi.spyOn(service, 'revokeRole').mockResolvedValue(revokedAssignment);

      mockReq.params.assignmentId = 'asgn-1';
      mockReq.body = { reason: 'Role revoked after promotion' };

      await controller.revoke(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: revokedAssignment,
          message: 'Role assignment revoked successfully',
        })
      );
    });

    it('controller.listByUser should return 200 on success', async () => {
      const assignments: any = [{ id: 'asgn-1' }, { id: 'asgn-2' }];
      vi.spyOn(service, 'listUserAssignments').mockResolvedValue(assignments);

      mockReq.params.userId = targetStaffId;
      mockReq.query = { isActive: true };

      await controller.listByUser(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: assignments,
          message: 'User role assignments retrieved successfully',
        })
      );
    });

    it('controller should call next(error) on service failure', async () => {
      const error = new Error('Service failure');
      vi.spyOn(service, 'assignRole').mockRejectedValue(error);

      await controller.assign(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
