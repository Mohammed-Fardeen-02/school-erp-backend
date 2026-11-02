import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RolesService } from './roles.service';
import { RolesRepository } from './roles.repository';
import { RoleType } from '@prisma/client';
import { effectivePermissionsService } from '../../core/authorization/effective-permissions.service';

describe('Stage 3.4: Roles Domain Service & Security Controls', () => {
  let mockPrisma: any;
  let mockRepo: RolesRepository;
  let service: RolesService;

  const orgId = 'org-greenwood-1';
  const otherOrgId = 'org-oakridge-2';
  const adminUserId = 'user-admin-1';
  const auditContext = {
    actorUserId: adminUserId,
    ipAddress: '127.0.0.1',
    userAgent: 'vitest-test-agent',
  };

  beforeEach(() => {
    mockPrisma = {
      role: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
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
        count: vi.fn(),
      },
      rbacInvalidationOutbox: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    mockRepo = new RolesRepository(mockPrisma as any);
    service = new RolesService(mockRepo, mockPrisma as any);
    vi.clearAllMocks();
  });

  describe('1. Role Listing & Cross-Tenant Isolation', () => {
    it('should list system templates and custom roles only for the caller tenant', async () => {
      mockPrisma.role.findMany.mockResolvedValue([
        {
          id: 'template-1',
          organizationId: null,
          roleCode: 'SCHOOL_ADMIN',
          roleName: 'School Administrator',
          roleType: RoleType.SYSTEM_TEMPLATE,
          isActive: true,
          _count: { permissions: 12, userRoles: 1 },
        },
        {
          id: 'custom-1',
          organizationId: orgId,
          roleCode: 'DEPT_HEAD',
          roleName: 'Department Head',
          roleType: RoleType.CUSTOM,
          isActive: true,
          _count: { permissions: 5, userRoles: 2 },
        },
      ]);
      mockPrisma.role.count.mockResolvedValue(2);

      const result = await service.listRoles(orgId, { page: 1, limit: 10 });

      expect(result.roles.length).toBe(2);
      expect(result.roles[0].roleType).toBe('SYSTEM_TEMPLATE');
      expect(result.roles[1].roleType).toBe('CUSTOM');

      // Verify query enforced tenant isolation: OR [organizationId: null, organizationId: orgId]
      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { organizationId: null, roleType: RoleType.SYSTEM_TEMPLATE },
              { organizationId: orgId, roleType: RoleType.CUSTOM },
            ],
          }),
        })
      );
    });

    it('should reject retrieval of another tenant custom role with 404', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null); // Isolated query returned null

      await expect(service.getRoleById('foreign-role-id', orgId)).rejects.toMatchObject({
        statusCode: 404,
        errorCode: 'NOT_FOUND',
      });
    });
  });

  describe('2. Custom Role Creation & Role Code Uniqueness', () => {
    it('should create custom role and record outbox + audit in the same transaction', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null); // No collision
      mockPrisma.role.create.mockResolvedValue({
        id: 'new-role-id',
        organizationId: orgId,
        roleCode: 'ACADEMIC_COUNSELOR',
        roleName: 'Academic Counselor',
        roleType: RoleType.CUSTOM,
        isActive: true,
      });

      const created = await service.createCustomRole(
        orgId,
        {
          roleCode: 'ACADEMIC_COUNSELOR',
          roleName: 'Academic Counselor',
          description: 'Guidance and counseling counselor',
        },
        auditContext
      );

      expect(created.id).toBe('new-role-id');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.role.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          roleCode: 'ACADEMIC_COUNSELOR',
          roleType: 'CUSTOM',
          isActive: true,
        }),
      });

      // Verify transactional outbox event
      expect(mockPrisma.rbacInvalidationOutbox.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'ROLE_CREATED',
          organizationId: orgId,
          processed: false,
        }),
      });

      // Verify audit log
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          userId: adminUserId,
          action: 'ROLE_CREATED',
          entity: 'Role',
        }),
      });
    });

    it('should reject duplicate custom role code within same organization with 409 Conflict', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'existing-role',
        roleCode: 'TEACHER_ASSISTANT',
        organizationId: orgId,
      });

      await expect(
        service.createCustomRole(
          orgId,
          {
            roleCode: 'TEACHER_ASSISTANT',
            roleName: 'Teacher Assistant',
          },
          auditContext
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'CONFLICT',
      });
    });
  });

  describe('3. System Template Immutability Guardrails', () => {
    const templateRole = {
      id: 'template-principal',
      organizationId: null,
      roleCode: 'PRINCIPAL',
      roleName: 'Principal',
      roleType: RoleType.SYSTEM_TEMPLATE,
      isActive: true,
      permissions: [],
    };

    it('should reject updating system template metadata with 403', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(templateRole);

      await expect(
        service.updateCustomRole(
          'template-principal',
          orgId,
          { roleName: 'Modified Principal' },
          auditContext
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'INSUFFICIENT_PERMISSIONS',
      });
    });

    it('should reject deactivating system template with 403', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(templateRole);

      await expect(
        service.toggleRoleStatus('template-principal', orgId, false, auditContext)
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'INSUFFICIENT_PERMISSIONS',
      });
    });

    it('should reject deleting or archiving system template with 403', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(templateRole);

      await expect(
        service.deleteOrArchiveRole('template-principal', orgId, auditContext)
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'INSUFFICIENT_PERMISSIONS',
      });
    });

    it('should reject modifying capability matrix of a system template with 403', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(templateRole);

      await expect(
        service.updateRolePermissions(
          'template-principal',
          orgId,
          { permissions: [{ nodeCode: 'fees.invoices.billing.view', isGranted: true }] },
          auditContext
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'INSUFFICIENT_PERMISSIONS',
      });
    });
  });

  describe('4. System Template Cloning', () => {
    it('should clone system template into independent custom role with copied grants', async () => {
      mockPrisma.role.findFirst
        .mockResolvedValueOnce({
          id: 'template-librarian',
          roleCode: 'LIBRARIAN',
          roleType: RoleType.SYSTEM_TEMPLATE,
          organizationId: null,
          isActive: true,
          permissions: [
            { nodeId: 'node-lib-1', isGranted: true, node: { nodeCode: 'library' } },
            { nodeId: 'node-lib-2', isGranted: true, node: { nodeCode: 'library.books.catalog.view' } },
          ],
        })
        .mockResolvedValueOnce(null); // No collision on new custom code

      // Mock caller having library permissions (satisfies delegation ceiling)
      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['library', 'library.books.catalog.view'])
      );

      mockPrisma.role.create.mockResolvedValue({
        id: 'cloned-custom-role-id',
        roleCode: 'SENIOR_LIBRARIAN',
        roleName: 'Senior Librarian',
        roleType: RoleType.CUSTOM,
        organizationId: orgId,
        isActive: true,
      });

      const cloned = await service.cloneTemplate(
        'template-librarian',
        orgId,
        {
          roleCode: 'SENIOR_LIBRARIAN',
          roleName: 'Senior Librarian',
        },
        auditContext
      );

      expect(cloned.id).toBe('cloned-custom-role-id');
      expect(mockPrisma.role.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          roleCode: 'SENIOR_LIBRARIAN',
          roleType: 'CUSTOM',
          organizationId: orgId,
        }),
      });

      // Verify copied permissions
      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: 'cloned-custom-role-id', nodeId: 'node-lib-1', isGranted: true },
          { roleId: 'cloned-custom-role-id', nodeId: 'node-lib-2', isGranted: true },
        ],
      });

      // Verify outbox & audit
      expect(mockPrisma.rbacInvalidationOutbox.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ROLE_CLONED',
        }),
      });
    });

    it('should reject cloning if caller lacks permissions present in template (Delegation Ceiling)', async () => {
      mockPrisma.role.findFirst
        .mockResolvedValueOnce({
          id: 'template-accountant',
          roleCode: 'ACCOUNTANT',
          roleType: RoleType.SYSTEM_TEMPLATE,
          organizationId: null,
          isActive: true,
          permissions: [
            { nodeId: 'n-fees', isGranted: true, node: { nodeCode: 'fees' } },
          ],
        })
        .mockResolvedValueOnce(null);

      // Caller does NOT have fees permission!
      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['academics'])
      );

      await expect(
        service.cloneTemplate(
          'template-accountant',
          orgId,
          {
            roleCode: 'BURSAR_CLONE',
            roleName: 'Bursar Clone',
          },
          auditContext
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'INSUFFICIENT_PERMISSIONS',
        message: expect.stringContaining('Delegation ceiling violation'),
      });
    });
  });

  describe('5. Delegation Ceiling on Matrix Updates', () => {
    it('should reject granting a permission node that the caller does not actively possess', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'custom-role-1',
        roleType: RoleType.CUSTOM,
        organizationId: orgId,
        permissions: [],
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null); // Not self

      mockPrisma.permissionNode.findUnique.mockResolvedValue({
        id: 'node-audit-export',
        nodeCode: 'settings.audit_logs.trail.export',
        isActive: true,
      });

      // Caller only possesses audit view, NOT export!
      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['settings.audit_logs.trail.view'])
      );

      await expect(
        service.updateRolePermissions(
          'custom-role-1',
          orgId,
          {
            permissions: [
              {
                nodeCode: 'settings.audit_logs.trail.export',
                isGranted: true, // Attempting to grant unheld privilege!
              },
            ],
          },
          auditContext
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'INSUFFICIENT_PERMISSIONS',
        message: expect.stringContaining('Delegation ceiling violation'),
      });
    });
  });

  describe('6. Anti-Self-Modification Protection', () => {
    it('should reject role update if the role is actively assigned to the calling user', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'my-own-role-id',
        roleType: RoleType.CUSTOM,
        organizationId: orgId,
        permissions: [],
      });

      // Caller is actively assigned this role!
      mockPrisma.userRole.findFirst.mockResolvedValue({
        id: 'ur-self',
        userId: adminUserId,
        roleId: 'my-own-role-id',
        isActive: true,
      });

      await expect(
        service.updateCustomRole(
          'my-own-role-id',
          orgId,
          { roleName: 'Supercharged Me' },
          auditContext
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'UNAUTHORIZED',
        message: expect.stringContaining('Anti-self-modification violation'),
      });
    });
  });

  describe('7. Archival vs Hard Deletion (onDelete: Restrict preservation)', () => {
    it('should soft-archive role (isActive: false) when historical assignments exist', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'role-with-history',
        roleCode: 'FORMER_ROLE',
        roleType: RoleType.CUSTOM,
        organizationId: orgId,
        isActive: true,
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null); // Not self

      // Role has 3 assignments in database
      mockPrisma.userRole.count.mockResolvedValue(3);

      const result = await service.deleteOrArchiveRole('role-with-history', orgId, auditContext);

      expect(result.action).toBe('ARCHIVED');
      expect(result.message).toContain('safely archived to preserve authorization audit records');

      // Verify role was updated to isActive: false (NOT deleted)
      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { id: 'role-with-history' },
        data: { isActive: false },
      });
      expect(mockPrisma.role.delete).not.toHaveBeenCalled();

      // Verify outbox & audit
      expect(mockPrisma.rbacInvalidationOutbox.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventType: 'ROLE_ARCHIVED' }),
      });
    });

    it('should hard delete role when zero assignments exist', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({
        id: 'empty-role',
        roleCode: 'TEST_EMPTY',
        roleType: RoleType.CUSTOM,
        organizationId: orgId,
        isActive: true,
      });
      mockPrisma.userRole.findFirst.mockResolvedValue(null);

      // 0 assignments
      mockPrisma.userRole.count.mockResolvedValue(0);

      const result = await service.deleteOrArchiveRole('empty-role', orgId, auditContext);

      expect(result.action).toBe('DELETED');
      expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'empty-role' },
      });
      expect(mockPrisma.role.delete).toHaveBeenCalledWith({
        where: { id: 'empty-role' },
      });
      expect(mockPrisma.rbacInvalidationOutbox.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventType: 'ROLE_DELETED' }),
      });
    });
  });
});

