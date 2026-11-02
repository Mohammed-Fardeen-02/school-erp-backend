import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionsService } from './permissions.service';
import { NodeType } from '@prisma/client';
import { effectivePermissionsService } from '../../core/authorization/effective-permissions.service';

describe('Stage 3.4: Permissions Domain Service & Catalog Tree', () => {
  let mockPrisma: any;
  let service: PermissionsService;

  beforeEach(() => {
    mockPrisma = {
      permissionNode: {
        findMany: vi.fn(),
      },
    };
    service = new PermissionsService(mockPrisma as any);
    vi.clearAllMocks();
  });

  describe('1. Canonical Permission Tree Structure', () => {
    it('should assemble flat database nodes into a 4-level nested tree', async () => {
      mockPrisma.permissionNode.findMany.mockResolvedValue([
        {
          id: 'n-mod',
          nodeCode: 'academics',
          nodeName: 'Academics',
          nodeType: NodeType.MODULE,
          nodeLevel: 1,
          displayOrder: 1,
          description: 'Academics Module',
          parentId: null,
        },
        {
          id: 'n-sec',
          nodeCode: 'academics.curriculum',
          nodeName: 'Curriculum',
          nodeType: NodeType.SECTION,
          nodeLevel: 2,
          displayOrder: 1,
          description: 'Curriculum Section',
          parentId: 'n-mod',
        },
        {
          id: 'n-feat',
          nodeCode: 'academics.curriculum.courses',
          nodeName: 'Courses',
          nodeType: NodeType.FEATURE,
          nodeLevel: 3,
          displayOrder: 1,
          description: 'Courses Feature',
          parentId: 'n-sec',
        },
        {
          id: 'n-act-1',
          nodeCode: 'academics.curriculum.courses.view',
          nodeName: 'View Courses',
          nodeType: NodeType.ACTION,
          nodeLevel: 4,
          displayOrder: 1,
          description: 'View courses action',
          parentId: 'n-feat',
        },
        {
          id: 'n-act-2',
          nodeCode: 'academics.curriculum.courses.create',
          nodeName: 'Create Courses',
          nodeType: NodeType.ACTION,
          nodeLevel: 4,
          displayOrder: 2,
          description: 'Create courses action',
          parentId: 'n-feat',
        },
      ]);

      const tree = await service.getPermissionTree();

      expect(tree.length).toBe(1); // 1 root module
      const moduleNode = tree[0];
      expect(moduleNode.nodeCode).toBe('academics');
      expect(moduleNode.children?.length).toBe(1);

      const sectionNode = moduleNode.children![0];
      expect(sectionNode.nodeCode).toBe('academics.curriculum');
      expect(sectionNode.children?.length).toBe(1);

      const featureNode = sectionNode.children![0];
      expect(featureNode.nodeCode).toBe('academics.curriculum.courses');
      expect(featureNode.children?.length).toBe(2);

      const actionView = featureNode.children![0];
      expect(actionView.nodeCode).toBe('academics.curriculum.courses.view');
      expect(actionView.description).toBe('View courses action');
    });
  });

  describe('2. Caller Effective Permissions (/me)', () => {
    it('should resolve caller effective permissions within tenant context', async () => {
      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set([
          'academics.curriculum.courses.view',
          'attendance.student_daily.roster.view',
          'students.profiles.records.view',
        ])
      );

      const result = await service.getCallerEffectivePermissions(
        'user-teacher-1',
        'org-greenwood-1',
        'campus-main-uuid'
      );

      expect(result.userId).toBe('user-teacher-1');
      expect(result.organizationId).toBe('org-greenwood-1');
      expect(result.locationId).toBe('campus-main-uuid');
      expect(result.count).toBe(3);
      expect(result.permissions).toContain('academics.curriculum.courses.view');
      expect(result.permissions).toContain('attendance.student_daily.roster.view');
    });
  });
});

