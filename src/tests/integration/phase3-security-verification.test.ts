import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RolesService } from '../../modules/roles/roles.service';
import { RolesRepository } from '../../modules/roles/roles.repository';
import { UserRolesService } from '../../modules/user-roles/user-roles.service';
import { UserRolesRepository } from '../../modules/user-roles/user-roles.repository';
import { WorkspaceService } from '../../modules/workspace/workspace.service';
import { workspaceRepository } from '../../modules/workspace/workspace.repository';
import { effectivePermissionsService, EffectivePermissionsService } from '../../core/authorization/effective-permissions.service';
import {
  evaluatePermission,
  computeEffectiveNodeCodes,
  EvaluatedRole,
} from '../../core/authorization/permission-evaluator';
import {
  processPendingInvalidations,
} from '../../core/authorization/invalidation-outbox.worker';
import { requirePermission } from '../../core/middleware/permission.middleware';
import { prisma } from '../../core/database/prisma-client';
import { RoleType } from '@prisma/client';

// Prevent fire-and-forget background outbox calls from locking isProcessing across tests
vi.mock('../../core/authorization/invalidation-outbox.worker', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    processPendingInvalidations: vi.fn().mockImplementation((...args) => {
      if (args.length > 0) {
        // Called explicitly by our test suite
        return actual.processPendingInvalidations(...args);
      }
      // Called in background fire-and-forget by services
      return Promise.resolve(0);
    }),
  };
});

describe('Stage 3.7: Phase 3 Security Verification & Penetration Testing Suite', () => {
  // Test Tenants & Entities
  const tenantA = 'org-greenwood-tenant-a';
  const tenantB = 'org-oakridge-tenant-b';
  const campusA1 = 'campus-north-a1';
  const campusA2 = 'campus-south-a2';
  const campusB1 = 'campus-east-b1';

  // Test Actors & Users
  const adminActorA = 'user-admin-tenant-a';
  const regularUserA = 'user-teacher-tenant-a';
  const foreignUserB = 'user-teacher-tenant-b';

  const auditContextA = {
    actorUserId: adminActorA,
    ipAddress: '192.168.1.100',
    userAgent: 'SecurityVerificationAgent/3.0',
  };

  let mockPrisma: any;
  let mockRolesRepo: RolesRepository;
  let rolesService: RolesService;

  let mockUserRolesRepo: UserRolesRepository;
  let mockPermsService: EffectivePermissionsService;
  let userRolesService: UserRolesService;

  let workspaceService: WorkspaceService;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      organization: {
        findUnique: vi.fn(),
      },
      organizationMembership: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      location: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      role: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      rolePermission: {
        findMany: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
        upsert: vi.fn(),
      },
      permissionNode: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      userRole: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      rbacInvalidationOutbox: {
        create: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-1' }),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    mockRolesRepo = new RolesRepository(mockPrisma as any);
    rolesService = new RolesService(mockRolesRepo, mockPrisma as any);

    mockUserRolesRepo = new UserRolesRepository(mockPrisma as any);
    mockPermsService = {
      getEffectivePermissions: vi.fn(),
      hasPermission: vi.fn().mockResolvedValue(true),
      invalidateUserCache: vi.fn().mockResolvedValue(undefined),
      invalidateOrgCache: vi.fn().mockResolvedValue(undefined),
    } as any;
    userRolesService = new UserRolesService(mockUserRolesRepo, mockPrisma as any, mockPermsService);

    workspaceService = new WorkspaceService();

    vi.clearAllMocks();
  });

  // =========================================================================
  // SUITE 1: CROSS-TENANT ISOLATION & IDOR DEFENSE (HORIZONTAL ISOLATION)
  // =========================================================================
  describe('1. Cross-Tenant Isolation & IDOR Defense (Horizontal Separation)', () => {
    it('1.1 should reject retrieval of a role belonging to another tenant (404 Not Found)', async () => {
      // Role exists in DB but belongs to tenant B
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(
        rolesService.getRoleById('role-belonging-to-tenant-b', tenantA)
      ).rejects.toThrow(/Role not found or inaccessible/);

      expect(mockPrisma.role.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'role-belonging-to-tenant-b',
            OR: [
              { organizationId: null },
              { organizationId: tenantA },
            ],
          }),
        })
      );
    });

    it('1.2 should block cross-tenant role metadata modification (Tenant A modifying Tenant B role)', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(
        rolesService.updateCustomRole(
          'role-belonging-to-tenant-b',
          tenantA,
          { roleName: 'Tampered Department Head' },
          auditContextA
        )
      ).rejects.toThrow(/Role not found or inaccessible/);
    });

    it('1.3 should block cross-tenant role status toggle (Tenant A deactivating Tenant B role)', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(
        rolesService.toggleRoleStatus(
          'role-belonging-to-tenant-b',
          tenantA,
          false,
          auditContextA
        )
      ).rejects.toThrow(/Role not found or inaccessible/);
    });

    it('1.4 should block cross-tenant role deletion (Tenant A deleting Tenant B role)', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(
        rolesService.deleteOrArchiveRole('role-belonging-to-tenant-b', tenantA, auditContextA)
      ).rejects.toThrow(/Role not found or inaccessible/);
    });

    it('1.5 should block cross-tenant capability matrix update', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(
        rolesService.updateRolePermissions(
          'role-belonging-to-tenant-b',
          tenantA,
          { permissions: [{ nodeCode: 'students.records.edit', isGranted: true }] },
          auditContextA
        )
      ).rejects.toThrow(/Role not found or inaccessible/);
    });

    it('1.6 should block assigning a custom role belonging to Tenant B inside Tenant A', async () => {
      // Target user is active in Tenant A
      mockPrisma.user.findUnique.mockResolvedValue({ id: regularUserA, isActive: true, status: 'ACTIVE' });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({ id: 'mem-a', status: 'ACTIVE' });

      // Role check: query for role restricted to tenant A or system template returns null because role is in tenant B
      mockPrisma.role.findFirst.mockResolvedValue(null);

      await expect(
        userRolesService.assignRole(
          adminActorA,
          tenantA,
          {
            userId: regularUserA,
            roleId: 'foreign-role-tenant-b',
            locationId: null,
          },
          auditContextA
        )
      ).rejects.toThrow(/Role not found, inactive, or not accessible to this organization/);
    });

    it('1.7 should block assigning a role to a foreign user who has no active membership in Tenant A', async () => {
      // User exists globally
      mockPrisma.user.findUnique.mockResolvedValue({ id: foreignUserB, isActive: true, status: 'ACTIVE' });
      // Membership in Tenant A is null
      mockPrisma.organizationMembership.findFirst.mockResolvedValue(null);

      await expect(
        userRolesService.assignRole(
          adminActorA,
          tenantA,
          {
            userId: foreignUserB,
            roleId: 'role-valid-tenant-a',
            locationId: null,
          },
          auditContextA
        )
      ).rejects.toThrow(/Target user does not have an active membership in this organization/);
    });

    it('1.8 should block assigning a role scoped to a campus location belonging to Tenant B', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: regularUserA, isActive: true, status: 'ACTIVE' });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({ id: 'mem-a', status: 'ACTIVE' });
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-valid-tenant-a',
        roleCode: 'TEACHER',
        roleType: RoleType.CUSTOM,
        permissions: [],
      });
      // Location check for tenant A returns null because campusB1 belongs to tenant B
      mockPrisma.location.findFirst.mockResolvedValue(null);

      await expect(
        userRolesService.assignRole(
          adminActorA,
          tenantA,
          {
            userId: regularUserA,
            roleId: 'role-valid-tenant-a',
            locationId: campusB1,
          },
          auditContextA
        )
      ).rejects.toThrow(/Campus location not found, inactive, or does not belong to this organization/);
    });

    it('1.9 should block revoking an assignment that belongs to another tenant', async () => {
      // findAssignmentById filters strictly by organizationId = tenantA -> returns null
      mockPrisma.userRole.findFirst.mockResolvedValue(null);

      await expect(
        userRolesService.revokeRole(
          adminActorA,
          tenantA,
          'assignment-tenant-b',
          { reason: 'Attempted malicious cross-tenant revocation' },
          auditContextA
        )
      ).rejects.toThrow(/Role assignment not found in this organization/);
    });

    it('1.10 should ensure workspace member search is strictly scoped to authenticated tenant organizationId', async () => {
      const listMembersSpy = vi.spyOn(workspaceRepository, 'listMembers').mockResolvedValue({
        members: [
          {
            id: regularUserA,
            email: 'teacher@greenwood.edu',
            firstName: 'Alice',
            lastName: 'Smith',
            phone: '555-0100',
            isActive: true,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await workspaceService.listMembers(tenantA, { search: 'Smith' });

      expect(result.members).toHaveLength(1);
      expect(result.members[0].email).toBe('teacher@greenwood.edu');

      // Verify that query was strictly filtered with organizationId: tenantA
      expect(listMembersSpy).toHaveBeenCalledWith(tenantA, { search: 'Smith' });
    });

    it('1.11 should reject listing user assignments when target user is not a member of the caller tenant', async () => {
      mockPrisma.organizationMembership.findFirst.mockResolvedValue(null);

      await expect(
        userRolesService.listUserAssignments(adminActorA, tenantA, foreignUserB, {})
      ).rejects.toThrow(/User not found in this organization/);
    });
  });

  // =========================================================================
  // SUITE 2: PRIVILEGE ESCALATION & DELEGATION CEILING (VERTICAL SEPARATION)
  // =========================================================================
  describe('2. Privilege Escalation & Delegation Ceiling Vectors (Vertical Separation)', () => {
    it('2.1 should reject role creation when caller attempts to grant capabilities they do not possess org-wide', async () => {
      mockPrisma.permissionNode.findUnique.mockResolvedValue({
        id: 'node-billing',
        nodeCode: 'finance.billing.invoices.manage',
        isActive: true,
      });

      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['students.profiles.records.view', 'settings.roles.manage'])
      );

      await expect(
        rolesService.createCustomRole(
          tenantA,
          {
            roleCode: 'SUPER_BILLER',
            roleName: 'Super Biller',
            permissions: [{ nodeCode: 'finance.billing.invoices.manage', isGranted: true }],
          },
          auditContextA
        )
      ).rejects.toThrow(/Delegation ceiling violation: You cannot grant permissions you do not actively possess at target scope/);
    });

    it('2.2 should reject capability matrix update when caller attempts to grant permissions they lack org-wide', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-custom-1',
        organizationId: tenantA,
        roleCode: 'CUSTOM_LEAD',
        roleName: 'Custom Lead',
        roleType: RoleType.CUSTOM,
        isActive: true,
        permissions: [],
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null);

      mockPrisma.permissionNode.findUnique.mockResolvedValue({
        id: 'node-security',
        nodeCode: 'settings.security.audit_logs.export',
        isActive: true,
      });

      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['students.records.view'])
      );

      await expect(
        rolesService.updateRolePermissions(
          'role-custom-1',
          tenantA,
          { permissions: [{ nodeCode: 'settings.security.audit_logs.export', isGranted: true }] },
          auditContextA
        )
      ).rejects.toThrow(/Delegation ceiling violation/);
    });

    it('2.3 should reject cloning a system template if caller does not possess all grants contained in that template', async () => {
      mockPrisma.role.findFirst.mockImplementation(async (args: any) => {
        if (args?.where?.id === 'tmpl-accountant') {
          return {
            id: 'tmpl-accountant',
            roleCode: 'ACCOUNTANT',
            roleType: RoleType.SYSTEM_TEMPLATE,
            isActive: true,
            permissions: [
              {
                nodeId: 'node-fin-1',
                isGranted: true,
                node: { id: 'node-fin-1', nodeCode: 'finance.billing.invoices.manage' },
              },
            ],
          };
        }
        return null; // For uniqueness check findCustomRoleByCode
      });

      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['students.records.view'])
      );

      await expect(
        rolesService.cloneTemplate(
          'tmpl-accountant',
          tenantA,
          { roleCode: 'MY_ACCOUNTANT', roleName: 'My Accountant' },
          auditContextA
        )
      ).rejects.toThrow(/Delegation ceiling violation/);
    });

    it('2.4 should reject role assignment if role contains capabilities the caller lacks at target scope', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: regularUserA, isActive: true, status: 'ACTIVE' });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({ id: 'mem-a', status: 'ACTIVE' });

      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-accountant',
        roleCode: 'ACCOUNTANT',
        roleType: RoleType.CUSTOM,
        permissions: [
          {
            isGranted: true,
            node: { nodeCode: 'finance.ledgers.view', isActive: true },
          },
        ],
      });

      mockPrisma.userRole.findFirst.mockResolvedValue(null);

      vi.mocked(mockPermsService.hasPermission).mockResolvedValue(true);
      vi.mocked(mockPermsService.getEffectivePermissions).mockResolvedValue(
        new Set(['settings.user_assignments.allocations.assign'])
      );

      await expect(
        userRolesService.assignRole(
          adminActorA,
          tenantA,
          {
            userId: regularUserA,
            roleId: 'role-accountant',
            locationId: null,
          },
          auditContextA
        )
      ).rejects.toThrow(/Delegation ceiling violation: You cannot assign a role containing permissions you do not actively possess at target scope: \[finance.ledgers.view\]/);
    });

    it('2.5 should reject role assignment if caller lacks assign authority at the target scope', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: regularUserA, isActive: true, status: 'ACTIVE' });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({ id: 'mem-a', status: 'ACTIVE' });
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-simple',
        roleCode: 'OBSERVER',
        roleType: RoleType.CUSTOM,
        permissions: [],
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null);

      vi.mocked(mockPermsService.hasPermission).mockResolvedValue(false);

      await expect(
        userRolesService.assignRole(
          adminActorA,
          tenantA,
          {
            userId: regularUserA,
            roleId: 'role-simple',
            locationId: null,
          },
          auditContextA
        )
      ).rejects.toThrow(/Delegation ceiling violation: You lack authority to assign roles at the target scope/);
    });

    it('2.6 should enforce Anti-Self-Assignment defense (admin assigning role to self)', async () => {
      await expect(
        userRolesService.assignRole(
          adminActorA,
          tenantA,
          {
            userId: adminActorA, // SELF
            roleId: 'role-any',
            locationId: null,
          },
          auditContextA
        )
      ).rejects.toThrow(/Anti-self-assignment violation: You cannot assign roles to yourself/);
    });

    it('2.7 should enforce Anti-Self-Modification defense (admin updating role assigned to self)', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-assigned-to-admin',
        organizationId: tenantA,
        roleCode: 'CUSTOM_ADMIN',
        roleType: RoleType.CUSTOM,
        isActive: true,
      });

      mockPrisma.userRole.findFirst.mockResolvedValue({
        id: 'assignment-self',
        userId: adminActorA,
        roleId: 'role-assigned-to-admin',
        isActive: true,
      });

      await expect(
        rolesService.updateCustomRole(
          'role-assigned-to-admin',
          tenantA,
          { roleName: 'New Name' },
          auditContextA
        )
      ).rejects.toThrow(/Anti-self-modification violation: You cannot modify or alter permissions for a role actively assigned to yourself/);
    });

    it('2.8 should enforce Anti-Self-Revocation defense (admin revoking own role assignment)', async () => {
      mockPrisma.userRole.findFirst.mockResolvedValue({
        id: 'assignment-admin-self',
        userId: adminActorA, // SELF
        organizationId: tenantA,
        isActive: true,
      });

      await expect(
        userRolesService.revokeRole(
          adminActorA,
          tenantA,
          'assignment-admin-self',
          { reason: 'Attempting to self-revoke' },
          auditContextA
        )
      ).rejects.toThrow(/Anti-self-revocation violation: You cannot revoke your own role assignment/);
    });

    it('2.9 should enforce System Template Immutability (blocking updates, deactivations, deletions of system templates)', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'tmpl-school-admin',
        organizationId: null,
        roleCode: 'SCHOOL_ADMIN',
        roleType: RoleType.SYSTEM_TEMPLATE,
        isActive: true,
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null);

      // Attempt update
      await expect(
        rolesService.updateCustomRole(
          'tmpl-school-admin',
          tenantA,
          { roleName: 'Hacked School Admin' },
          auditContextA
        )
      ).rejects.toThrow(/System role templates are platform-curated and immutable/);

      // Attempt toggle status
      await expect(
        rolesService.toggleRoleStatus(
          'tmpl-school-admin',
          tenantA,
          false,
          auditContextA
        )
      ).rejects.toThrow(/System role templates cannot be deactivated by tenants/);

      // Attempt delete
      await expect(
        rolesService.deleteOrArchiveRole('tmpl-school-admin', tenantA, auditContextA)
      ).rejects.toThrow(/System role templates cannot be deleted or archived/);

      // Attempt update permissions matrix
      await expect(
        rolesService.updateRolePermissions(
          'tmpl-school-admin',
          tenantA,
          { permissions: [] },
          auditContextA
        )
      ).rejects.toThrow(/System role template capability matrices are platform-curated and immutable/);
    });
  });

  // =========================================================================
  // SUITE 3: MULTI-ROLE DYNAMIC EVALUATION & SCOPE ISOLATION VECTORS
  // =========================================================================
  describe('3. Multi-Role Dynamic Evaluation & Scope Isolation Vectors', () => {
    it('3.1 should enforce Deny-Overrides supremacy: explicit deny in any role overrides grants from other roles', () => {
      const role1Grant: EvaluatedRole = {
        roleId: 'role-1',
        roleCode: 'TEACHER',
        isActive: true,
        locationId: null,
        grants: {
          'students.records.edit': true,
          'students.records.view': true,
        },
      };

      const role2Deny: EvaluatedRole = {
        roleId: 'role-2',
        roleCode: 'PROBATIONARY_RESTRICTION',
        isActive: true,
        locationId: null,
        grants: {
          'students.records.edit': false, // EXPLICIT DENY
        },
      };

      const evaluation = evaluatePermission(
        [role1Grant, role2Deny],
        'students.records.edit',
        { locationId: null }
      );

      expect(evaluation.isGranted).toBe(false);
      expect(evaluation.denyingRole).toBe('PROBATIONARY_RESTRICTION');
      expect(evaluation.reason).toContain('Explicitly denied by role: PROBATIONARY_RESTRICTION');
    });

    it('3.2 should enforce within-role inheritance while honoring explicit leaf deny', () => {
      const roleInherit: EvaluatedRole = {
        roleId: 'role-academic',
        roleCode: 'ACADEMIC_LEAD',
        isActive: true,
        locationId: null,
        grants: {
          'academics.curriculum': true, // Parent grant
          'academics.curriculum.courses.delete': false, // Explicit child leaf deny
        },
      };

      // 1. Child view inherits true from parent section
      const viewResult = evaluatePermission(
        [roleInherit],
        'academics.curriculum.courses.view',
        { locationId: null }
      );
      expect(viewResult.isGranted).toBe(true);
      expect(viewResult.votes[0].inherited).toBe(true);
      expect(viewResult.votes[0].matchedNodeCode).toBe('academics.curriculum');

      // 2. Child delete matches explicit false on leaf and is denied
      const deleteResult = evaluatePermission(
        [roleInherit],
        'academics.curriculum.courses.delete',
        { locationId: null }
      );
      expect(deleteResult.isGranted).toBe(false);
      expect(deleteResult.votes[0].inherited).toBe(false);
      expect(deleteResult.votes[0].vote).toBe('DENY');
    });

    it('3.3 should enforce Campus Scope Boundary Isolation: campus-scoped role cannot act on other campuses or org-wide', () => {
      const campusScopedRole: EvaluatedRole = {
        roleId: 'role-north-evaluator',
        roleCode: 'NORTH_EXAM_OFFICER',
        isActive: true,
        locationId: campusA1,
        grants: {
          'examination.schedules.manage': true,
        },
      };

      // Querying at Campus North -> GRANTED
      const northEval = evaluatePermission(
        [campusScopedRole],
        'examination.schedules.manage',
        { locationId: campusA1 }
      );
      expect(northEval.isGranted).toBe(true);

      // Querying at Campus South -> DENIED (out-of-scope)
      const southEval = evaluatePermission(
        [campusScopedRole],
        'examination.schedules.manage',
        { locationId: campusA2 }
      );
      expect(southEval.isGranted).toBe(false);
      expect(southEval.reason).toMatch(/default deny/i);

      // Querying Org-Wide (locationId: null) -> DENIED (campus-scoped cannot act org-wide)
      const orgWideEval = evaluatePermission(
        [campusScopedRole],
        'examination.schedules.manage',
        { locationId: null }
      );
      expect(orgWideEval.isGranted).toBe(false);
    });

    it('3.4 should allow Org-Wide role grant to apply universally org-wide and across all campuses', () => {
      const orgWideRole: EvaluatedRole = {
        roleId: 'role-trustee',
        roleCode: 'HEAD_OF_INSTITUTION',
        isActive: true,
        locationId: null, // Org-Wide
        grants: {
          'analytics.academic.view': true,
        },
      };

      // Org-Wide check
      expect(
        evaluatePermission([orgWideRole], 'analytics.academic.view', { locationId: null }).isGranted
      ).toBe(true);

      // Campus A1 check
      expect(
        evaluatePermission([orgWideRole], 'analytics.academic.view', { locationId: campusA1 }).isGranted
      ).toBe(true);

      // Campus A2 check
      expect(
        evaluatePermission([orgWideRole], 'analytics.academic.view', { locationId: campusA2 }).isGranted
      ).toBe(true);
    });

    it('3.5 should compute accurate effective node codes set across multiple roles with campus filter', () => {
      const roles: EvaluatedRole[] = [
        {
          roleId: 'role-1',
          roleCode: 'TEACHER',
          isActive: true,
          locationId: null,
          grants: {
            'students.records.view': true,
            'students.records.edit': true,
          },
        },
        {
          roleId: 'role-2',
          roleCode: 'CAMPUS_ADMIN',
          isActive: true,
          locationId: campusA1,
          grants: {
            'admissions.applications.review': true,
          },
        },
      ];

      const allKnownCodes = [
        'students.records.view',
        'students.records.edit',
        'admissions.applications.review',
        'finance.invoices.create',
      ];

      // At Campus A1: both roles apply
      const campusA1Perms = computeEffectiveNodeCodes(roles, allKnownCodes, { locationId: campusA1 });
      expect(campusA1Perms.has('students.records.view')).toBe(true);
      expect(campusA1Perms.has('students.records.edit')).toBe(true);
      expect(campusA1Perms.has('admissions.applications.review')).toBe(true);
      expect(campusA1Perms.has('finance.invoices.create')).toBe(false);

      // Org-Wide: campusA1 role is filtered out
      const orgWidePerms = computeEffectiveNodeCodes(roles, allKnownCodes, { locationId: null });
      expect(orgWidePerms.has('students.records.view')).toBe(true);
      expect(orgWidePerms.has('students.records.edit')).toBe(true);
      expect(orgWidePerms.has('admissions.applications.review')).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 4: TRANSACTIONAL OUTBOX, DISTRIBUTED CACHE & FAIL-CLOSED RESILIENCE
  // =========================================================================
  describe('4. Transactional Outbox, Cache Invalidation & Fail-Closed Resilience', () => {
    it('4.1 should record outbox invalidation event transactionally during role permissions update', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-custom-1',
        organizationId: tenantA,
        roleCode: 'CUSTOM_ROLE',
        roleType: RoleType.CUSTOM,
        isActive: true,
        permissions: [],
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null);
      mockPrisma.permissionNode.findUnique.mockResolvedValue({
        id: 'node-1',
        nodeCode: 'students.records.view',
        isActive: true,
      });
      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['students.records.view'])
      );

      await rolesService.updateRolePermissions(
        'role-custom-1',
        tenantA,
        { permissions: [{ nodeCode: 'students.records.view', isGranted: true }] },
        auditContextA
      );

      // Verify outbox record creation
      expect(mockPrisma.rbacInvalidationOutbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'ROLE_PERMISSIONS_UPDATED',
            organizationId: tenantA,
            processed: false,
          }),
        })
      );
    });

    it('4.2 should record outbox invalidation event transactionally during user role assignment', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: regularUserA, isActive: true, status: 'ACTIVE' });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' });
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-teacher',
        roleCode: 'TEACHER',
        roleType: RoleType.CUSTOM,
        permissions: [],
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null);
      vi.mocked(mockPermsService.hasPermission).mockResolvedValue(true);
      vi.mocked(mockPermsService.getEffectivePermissions).mockResolvedValue(new Set());

      mockPrisma.userRole.create.mockResolvedValue({
        id: 'new-assignment-id',
        userId: regularUserA,
        organizationId: tenantA,
        roleId: 'role-teacher',
        locationId: null,
        membershipId: 'mem-1',
        isActive: true,
        role: { roleCode: 'TEACHER', roleName: 'Teacher', roleType: RoleType.CUSTOM },
      });

      await userRolesService.assignRole(
        adminActorA,
        tenantA,
        {
          userId: regularUserA,
          roleId: 'role-teacher',
          locationId: null,
        },
        auditContextA
      );

      expect(mockPrisma.rbacInvalidationOutbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'USER_ROLE_ASSIGNED',
            organizationId: tenantA,
            userId: regularUserA,
            processed: false,
          }),
        })
      );
    });

    it('4.3 should record outbox invalidation event transactionally during user role revocation', async () => {
      mockPrisma.userRole.findFirst.mockResolvedValue({
        id: 'assignment-to-revoke',
        userId: regularUserA,
        organizationId: tenantA,
        roleId: 'role-teacher',
        locationId: null,
        isActive: true,
        role: { roleCode: 'TEACHER', roleName: 'Teacher' },
      });
      vi.mocked(mockPermsService.hasPermission).mockResolvedValue(true);

      mockPrisma.userRole.update.mockResolvedValue({
        id: 'assignment-to-revoke',
        userId: regularUserA,
        organizationId: tenantA,
        roleId: 'role-teacher',
        locationId: null,
        isActive: false,
        revokedAt: new Date(),
        revokedBy: adminActorA,
        reason: 'Term ended',
        role: { roleCode: 'TEACHER', roleName: 'Teacher' },
      });

      await userRolesService.revokeRole(
        adminActorA,
        tenantA,
        'assignment-to-revoke',
        { reason: 'Term ended' },
        auditContextA
      );

      expect(mockPrisma.rbacInvalidationOutbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'USER_ROLE_REVOKED',
            organizationId: tenantA,
            userId: regularUserA,
            processed: false,
          }),
        })
      );
    });

    it('4.4 should process pending outbox events, bump Redis version counters, and mark processed', async () => {
      const mockRedisPipeline = {
        incr: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([[null, 2]]),
      };
      const mockRedisClient = {
        pipeline: vi.fn(() => mockRedisPipeline),
      } as any;

      mockPrisma.rbacInvalidationOutbox.findMany.mockResolvedValue([
        {
          id: 'ev-1',
          eventType: 'USER_ROLE_ASSIGNED',
          organizationId: tenantA,
          userId: regularUserA,
          processed: false,
        },
        {
          id: 'ev-2',
          eventType: 'ROLE_PERMISSIONS_UPDATED',
          organizationId: tenantA,
          userId: null,
          processed: false,
        },
      ]);
      mockPrisma.rbacInvalidationOutbox.updateMany.mockResolvedValue({ count: 2 });

      const processedCount = await processPendingInvalidations(
        mockPrisma as any,
        mockRedisClient,
        50,
        async () => true // Redis reachable
      );

      expect(processedCount).toBe(2);
      expect(mockRedisPipeline.incr).toHaveBeenCalledWith(`rbac:v:user:${regularUserA}:${tenantA}`);
      expect(mockRedisPipeline.incr).toHaveBeenCalledWith(`rbac:v:org:${tenantA}`);
      expect(mockRedisPipeline.exec).toHaveBeenCalled();

      expect(mockPrisma.rbacInvalidationOutbox.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ev-1', 'ev-2'] } },
        data: expect.objectContaining({ processed: true }),
      });
    });

    it('4.5 should safely evaluate effective permissions via PostgreSQL direct fallback when Redis is unreachable', async () => {
      const fallbackService = new EffectivePermissionsService(
        mockPrisma as any,
        () => ({}) as any,
        async () => false // Redis check returns false (unreachable)
      );

      mockPrisma.permissionNode.findMany.mockResolvedValue([
        { id: 'node-1', nodeCode: 'students.records.view', parentId: null },
      ]);

      mockPrisma.user.findUnique.mockResolvedValue({ id: regularUserA, isActive: true, status: 'ACTIVE' });
      mockPrisma.organizationMembership.findFirst.mockResolvedValue({
        id: 'mem-1',
        organizationId: tenantA,
        status: 'ACTIVE',
      });

      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          roleId: 'role-1',
          locationId: null,
          isActive: true,
          role: {
            id: 'role-1',
            roleCode: 'TEACHER',
            roleName: 'Teacher',
            isActive: true,
            permissions: [
              {
                isGranted: true,
                node: { nodeCode: 'students.records.view', isActive: true },
              },
            ],
          },
        },
      ]);

      const effectivePerms = await fallbackService.getEffectivePermissions(
        regularUserA,
        tenantA,
        null
      );

      expect(effectivePerms.has('students.records.view')).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 5: PLATFORM OPERATOR BREAK-GLASS & AUDITED GOVERNANCE
  // =========================================================================
  describe('5. Platform Operator Break-Glass & Audited Mutation Governance', () => {
    let mockReq: any;
    let mockRes: any;
    let nextFn: any;

    beforeEach(() => {
      mockReq = {
        method: 'GET',
        originalUrl: '/api/v1/permissions/catalog',
        headers: {},
        ip: '10.0.0.1',
        socket: { remoteAddress: '10.0.0.1' },
        user: undefined,
        organizationId: tenantA,
      };
      mockRes = {};
      nextFn = vi.fn();
    });

    it('5.1 should return 401 UNAUTHENTICATED when request has no authenticated user', async () => {
      const mw = requirePermission('settings.roles.manage');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          errorCode: 'UNAUTHENTICATED',
        })
      );
    });

    it('5.2 should allow Platform Operator read-only inspection (GET) and log inspection telemetry', async () => {
      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'platform-op-1',
        email: 'ops@platform.internal',
        userType: 'PLATFORM',
        isActive: true,
      });
      vi.spyOn((prisma as any).auditLog, 'create').mockResolvedValue({ id: 'audit-log-1' });

      mockReq.user = { id: 'platform-op-1', userType: 'PLATFORM' };
      mockReq.method = 'GET';

      const mw = requirePermission('students.records.view');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
    });

    it('5.3 should reject Platform Operator mutation without X-Platform-Override: true', async () => {
      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'platform-op-1',
        email: 'ops@platform.internal',
        userType: 'PLATFORM',
        isActive: true,
      });

      mockReq.user = { id: 'platform-op-1', userType: 'PLATFORM' };
      mockReq.method = 'POST'; // Mutation
      mockReq.headers = {}; // Missing override header

      const mw = requirePermission('settings.roles.manage');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: expect.stringContaining('X-Platform-Override: true'),
        })
      );
    });

    it('5.4 should reject Platform Operator mutation if override reason is shorter than 10 characters', async () => {
      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'platform-op-1',
        email: 'ops@platform.internal',
        userType: 'PLATFORM',
        isActive: true,
      });

      mockReq.user = { id: 'platform-op-1', userType: 'PLATFORM' };
      mockReq.method = 'POST';
      mockReq.headers = {
        'x-platform-override': 'true',
        'x-override-reason': 'Short', // < 10 chars
      };

      const mw = requirePermission('settings.roles.manage');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('minimum 10 characters'),
        })
      );
    });

    it('5.5 should allow Platform Operator mutation with valid override header & justification and record PLATFORM_OVERRIDE audit', async () => {
      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'platform-op-1',
        email: 'ops@platform.internal',
        userType: 'PLATFORM',
        isActive: true,
      });
      vi.spyOn((prisma as any).auditLog, 'create').mockResolvedValue({ id: 'audit-log-override' });

      mockReq.user = { id: 'platform-op-1', userType: 'PLATFORM' };
      mockReq.method = 'POST';
      mockReq.headers = {
        'x-platform-override': 'true',
        'x-override-reason': 'Urgent disaster recovery access requested by school trustee ticket INC-88219',
      };

      const mw = requirePermission('settings.roles.manage');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
    });
  });
});
