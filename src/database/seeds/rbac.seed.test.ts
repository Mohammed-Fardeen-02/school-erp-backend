import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  CANONICAL_PERMISSION_TREE,
  SYSTEM_ROLE_TEMPLATES,
  PermissionNodeDefinition,
} from '../../shared/constants/permissions-catalog';
import { seedRbacCatalog } from './rbac.seed';

describe('Stage 3.2: RBAC Canonical Catalog & Seeders Suite', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Canonical Permission Tree Structure & Invariants', () => {
    it('should contain all 12 top-level School ERP modules', () => {
      const expectedModules = [
        'academics',
        'students',
        'attendance',
        'fees',
        'staff',
        'exams',
        'front_office',
        'timetable',
        'transport',
        'library',
        'hostel',
        'settings',
      ];

      const moduleCodes = CANONICAL_PERMISSION_TREE.map((m) => m.nodeCode);
      for (const expected of expectedModules) {
        expect(moduleCodes).toContain(expected);
      }
      expect(CANONICAL_PERMISSION_TREE.length).toBe(12);
    });

    it('should satisfy strict 4-level hierarchy and progression invariants', () => {
      const allCodes = new Set<string>();

      function validateNode(node: PermissionNodeDefinition, parentLevel: number = 0) {
        // Uniqueness
        expect(allCodes.has(node.nodeCode)).toBe(false);
        allCodes.add(node.nodeCode);

        // Required text metadata
        expect(node.nodeCode).toBeTruthy();
        expect(node.nodeName).toBeTruthy();
        expect(node.description).toBeTruthy();
        expect(node.description.length).toBeGreaterThan(10);

        // Level progression
        expect(node.nodeLevel).toBe(parentLevel + 1);

        if (node.nodeLevel === 1) {
          expect(node.nodeType).toBe('MODULE');
        } else if (node.nodeLevel === 2) {
          expect(node.nodeType).toBe('SECTION');
        } else if (node.nodeLevel === 3) {
          expect(node.nodeType).toBe('FEATURE');
        } else if (node.nodeLevel === 4) {
          expect(node.nodeType).toBe('ACTION');
        }

        if (node.children) {
          for (const child of node.children) {
            validateNode(child, node.nodeLevel);
          }
        }
      }

      for (const root of CANONICAL_PERMISSION_TREE) {
        validateNode(root, 0);
      }

      // Assert at least 200 granular nodes in total
      expect(allCodes.size).toBeGreaterThanOrEqual(200);
    });
  });

  describe('2. System Role Templates Definition', () => {
    it('should contain exactly the 8 approved platform templates', () => {
      const expectedRoleCodes = [
        'SCHOOL_ADMIN',
        'PRINCIPAL',
        'INSTITUTION_HEAD',
        'TEACHER',
        'ACCOUNTANT',
        'LIBRARIAN',
        'STUDENT',
        'PARENT',
      ];

      const codes = SYSTEM_ROLE_TEMPLATES.map((t) => t.roleCode);
      for (const expected of expectedRoleCodes) {
        expect(codes).toContain(expected);
      }
      expect(SYSTEM_ROLE_TEMPLATES.length).toBe(8);
    });

    it('every granted node code in templates must exist in the canonical tree', () => {
      const allTreeCodes = new Set<string>();

      function collect(node: PermissionNodeDefinition) {
        allTreeCodes.add(node.nodeCode);
        if (node.children) {
          for (const child of node.children) collect(child);
        }
      }
      for (const root of CANONICAL_PERMISSION_TREE) collect(root);

      for (const tpl of SYSTEM_ROLE_TEMPLATES) {
        for (const grantedCode of tpl.grantedNodeCodes) {
          expect(
            allTreeCodes.has(grantedCode),
            `Role template ${tpl.roleCode} references unknown node: ${grantedCode}`
          ).toBe(true);
        }
      }
    });
  });

  describe('3. Database Seeding & Idempotence', () => {
    it('should seed canonical tree and system role templates idempotently', async () => {
      // First seed execution
      const run1 = await seedRbacCatalog(prisma);
      expect(run1.nodesCount.total).toBeGreaterThanOrEqual(200);
      expect(run1.rolesCount).toBe(8);
      expect(run1.rolePermissionsCount).toBeGreaterThan(0);

      // Verify records in DB
      const dbModules = await prisma.permissionNode.count({ where: { nodeType: 'MODULE' } });
      expect(dbModules).toBe(12);

      const dbRoles = await prisma.role.findMany({
        where: { roleType: 'SYSTEM_TEMPLATE', organizationId: null },
      });
      expect(dbRoles.length).toBe(8);

      const dbGrants = await prisma.rolePermission.count({
        where: { isGranted: true },
      });
      expect(dbGrants).toBeGreaterThan(0);

      // Second seed execution to verify idempotence
      const run2 = await seedRbacCatalog(prisma);
      expect(run2.nodesCount.total).toBe(run1.nodesCount.total);
      expect(run2.rolesCount).toBe(run1.rolesCount);
      expect(run2.rolePermissionsCount).toBe(run1.rolePermissionsCount);

      // Verify no duplicate roles or nodes were created
      const dbRolesAfter = await prisma.role.count({
        where: { roleType: 'SYSTEM_TEMPLATE', organizationId: null },
      });
      expect(dbRolesAfter).toBe(8);

      const dbNodesAfter = await prisma.permissionNode.count();
      expect(dbNodesAfter).toBe(run1.nodesCount.total);
    }, 30000);
  });
});
