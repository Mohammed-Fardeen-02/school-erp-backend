import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EffectivePermissionsService } from './effective-permissions.service';
import {
  recordInvalidationEvent,
  processPendingInvalidations,
} from './invalidation-outbox.worker';

describe('Stage 3.3: Effective Permissions Service & Redis Cache Suite', () => {
  let mockPrisma: any;
  let mockRedis: any;
  let service: EffectivePermissionsService;

  beforeEach(() => {
    // In-memory mock Redis key-value store
    const store = new Map<string, string>();

    mockRedis = {
      mget: vi.fn(async (...keys: string[]) => {
        return keys.map((k) => store.get(k) || null);
      }),
      get: vi.fn(async (key: string) => store.get(key) || null),
      set: vi.fn(async (key: string, val: string, mode?: string, _ttl?: number) => {
        if (mode === 'NX' && store.has(key)) {
          return null;
        }
        store.set(key, val);
        return 'OK';
      }),
      incr: vi.fn(async (key: string) => {
        const cur = parseInt(store.get(key) || '0', 10);
        const next = (cur + 1).toString();
        store.set(key, next);
        return cur + 1;
      }),
      pipeline: vi.fn(() => {
        const batch: Array<() => Promise<any>> = [];
        const pipe = {
          incr: (key: string) => {
            batch.push(async () => {
              const cur = parseInt(store.get(key) || '0', 10);
              const next = (cur + 1).toString();
              store.set(key, next);
            });
            return pipe;
          },
          exec: async () => {
            for (const fn of batch) await fn();
            return [];
          },
        };
        return pipe;
      }),
    };

    mockPrisma = {
      userRole: {
        findMany: vi.fn(),
      },
      permissionNode: {
        findMany: vi.fn(),
      },
      rbacInvalidationOutbox: {
        create: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    service = new EffectivePermissionsService(
      mockPrisma as any,
      () => mockRedis as any,
      () => Promise.resolve(true)
    );
  });

  describe('1. Direct PostgreSQL Computation & Hierarchy Traversal', () => {
    it('should compute effective permissions from database when cache misses', async () => {
      // Mock hierarchy nodes
      mockPrisma.permissionNode.findMany.mockResolvedValue([
        { nodeCode: 'academics', parent: null },
        { nodeCode: 'academics.curriculum', parent: { nodeCode: 'academics' } },
        { nodeCode: 'academics.curriculum.courses', parent: { nodeCode: 'academics.curriculum' } },
        { nodeCode: 'academics.curriculum.courses.view', parent: { nodeCode: 'academics.curriculum.courses' } },
        { nodeCode: 'academics.curriculum.courses.create', parent: { nodeCode: 'academics.curriculum.courses' } },
      ]);

      // Mock active user roles with grants
      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          id: 'ur-1',
          userId: 'user-123',
          organizationId: 'org-123',
          isActive: true,
          locationId: null,
          role: {
            id: 'role-1',
            roleCode: 'TEACHER',
            isActive: true,
            permissions: [
              {
                isGranted: true,
                node: { nodeCode: 'academics.curriculum' }, // Grants section and all descendants
              },
            ],
          },
        },
      ]);

      const permissions = await service.getEffectivePermissions('user-123', 'org-123');

      expect(permissions.has('academics.curriculum')).toBe(true);
      expect(permissions.has('academics.curriculum.courses')).toBe(true);
      expect(permissions.has('academics.curriculum.courses.view')).toBe(true);
      expect(permissions.has('academics.curriculum.courses.create')).toBe(true);
      expect(permissions.has('academics')).toBe(false); // Root not granted by section grant

      // Verify membership active filter was enforced in query
      expect(mockPrisma.userRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-123',
            organizationId: 'org-123',
            isActive: true,
            membership: {
              status: 'ACTIVE',
            },
          }),
        })
      );
    });

    it('should correctly evaluate hasPermission helper', async () => {
      mockPrisma.permissionNode.findMany.mockResolvedValue([
        { nodeCode: 'students', parent: null },
        { nodeCode: 'students.admissions', parent: { nodeCode: 'students' } },
        { nodeCode: 'students.admissions.inquiries', parent: { nodeCode: 'students.admissions' } },
        { nodeCode: 'students.admissions.inquiries.view', parent: { nodeCode: 'students.admissions.inquiries' } },
      ]);

      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          id: 'ur-1',
          userId: 'user-1',
          organizationId: 'org-1',
          isActive: true,
          locationId: null,
          role: {
            id: 'r-1',
            roleCode: 'ADMISSIONS_OFFICER',
            isActive: true,
            permissions: [
              {
                isGranted: true,
                node: { nodeCode: 'students.admissions' },
              },
            ],
          },
        },
      ]);

      const hasView = await service.hasPermission(
        'user-1',
        'org-1',
        null,
        'students.admissions.inquiries.view'
      );
      expect(hasView).toBe(true);

      const hasUnrelated = await service.hasPermission(
        'user-1',
        'org-1',
        null,
        'fees.invoices.billing.create'
      );
      expect(hasUnrelated).toBe(false);
    });
  });

  describe('2. Distributed Redis Caching & Cache Invalidation', () => {
    it('should write computed permissions to Redis cache with 300s TTL and serve on cache hit', async () => {
      mockPrisma.permissionNode.findMany.mockResolvedValue([
        { nodeCode: 'library', parent: null },
        { nodeCode: 'library.books.catalog.view', parent: { nodeCode: 'library' } },
      ]);

      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          id: 'ur-lib',
          userId: 'u-lib',
          organizationId: 'org-lib',
          isActive: true,
          locationId: null,
          role: {
            id: 'r-lib',
            roleCode: 'LIBRARIAN',
            isActive: true,
            permissions: [
              {
                isGranted: true,
                node: { nodeCode: 'library' },
              },
            ],
          },
        },
      ]);

      // 1. First call: Cache miss -> queries DB and sets Redis
      const firstCall = await service.getEffectivePermissions('u-lib', 'org-lib');
      expect(firstCall.has('library.books.catalog.view')).toBe(true);
      expect(mockPrisma.userRole.findMany).toHaveBeenCalledTimes(1);

      // Verify Redis set was called with EX 300
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('rbac:perms:org-lib:u-lib:org:'),
        expect.any(String),
        'EX',
        300
      );

      // 2. Second call: Cache hit -> does NOT query DB again
      const secondCall = await service.getEffectivePermissions('u-lib', 'org-lib');
      expect(secondCall.has('library.books.catalog.view')).toBe(true);
      expect(mockPrisma.userRole.findMany).toHaveBeenCalledTimes(1); // Still 1!
    });

    it('should bust cache when user version counter is incremented', async () => {
      mockPrisma.permissionNode.findMany.mockResolvedValue([
        { nodeCode: 'transport', parent: null },
        { nodeCode: 'transport.routes.stops.view', parent: { nodeCode: 'transport' } },
      ]);

      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          id: 'ur-t',
          userId: 'u-driver',
          organizationId: 'org-1',
          isActive: true,
          locationId: null,
          role: {
            id: 'r-driver',
            roleCode: 'DRIVER',
            isActive: true,
            permissions: [{ isGranted: true, node: { nodeCode: 'transport' } }],
          },
        },
      ]);

      // First call (populates cache at vUser=1)
      await service.getEffectivePermissions('u-driver', 'org-1');
      expect(mockPrisma.userRole.findMany).toHaveBeenCalledTimes(1);

      // Invalidate user cache (increments vUser to 2)
      await service.invalidateUserCache('u-driver', 'org-1');

      // Subsequent call should produce cache miss with new key and query DB again
      await service.getEffectivePermissions('u-driver', 'org-1');
      expect(mockPrisma.userRole.findMany).toHaveBeenCalledTimes(2);
    });

    it('should bust cache when organization version counter is incremented', async () => {
      mockPrisma.permissionNode.findMany.mockResolvedValue([
        { nodeCode: 'exams', parent: null },
        { nodeCode: 'exams.schedules.planning.view', parent: { nodeCode: 'exams' } },
      ]);

      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          id: 'ur-ex',
          userId: 'u-teacher',
          organizationId: 'org-2',
          isActive: true,
          locationId: null,
          role: {
            id: 'r-t',
            roleCode: 'TEACHER',
            isActive: true,
            permissions: [{ isGranted: true, node: { nodeCode: 'exams' } }],
          },
        },
      ]);

      await service.getEffectivePermissions('u-teacher', 'org-2');
      expect(mockPrisma.userRole.findMany).toHaveBeenCalledTimes(1);

      // Invalidate org cache (e.g. role definition changed)
      await service.invalidateOrgCache('org-2');

      await service.getEffectivePermissions('u-teacher', 'org-2');
      expect(mockPrisma.userRole.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('3. Transactional Invalidation Outbox Worker', () => {
    it('should record outbox event in same transaction', async () => {
      mockPrisma.rbacInvalidationOutbox.create.mockResolvedValue({
        id: 'outbox-1',
        eventType: 'ROLE_UPDATED',
        organizationId: 'org-test',
        userId: null,
        processed: false,
      });

      const res = await recordInvalidationEvent(mockPrisma, {
        eventType: 'ROLE_UPDATED',
        organizationId: 'org-test',
      });

      expect(mockPrisma.rbacInvalidationOutbox.create).toHaveBeenCalledWith({
        data: {
          eventType: 'ROLE_UPDATED',
          organizationId: 'org-test',
          userId: null,
          processed: false,
        },
      });
      expect(res.id).toBe('outbox-1');
    });

    it('should process pending outbox events and mark them processed', async () => {
      mockPrisma.rbacInvalidationOutbox.findMany.mockResolvedValue([
        {
          id: 'ev-1',
          eventType: 'USER_ROLE_ASSIGNED',
          organizationId: 'org-abc',
          userId: 'user-xyz',
          processed: false,
        },
        {
          id: 'ev-2',
          eventType: 'ROLE_UPDATED',
          organizationId: 'org-abc',
          userId: null,
          processed: false,
        },
      ]);
      mockPrisma.rbacInvalidationOutbox.updateMany.mockResolvedValue({ count: 2 });

      const processedCount = await processPendingInvalidations(
        mockPrisma,
        mockRedis as any,
        50,
        () => Promise.resolve(true)
      );

      expect(processedCount).toBe(2);
      expect(mockPrisma.rbacInvalidationOutbox.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ev-1', 'ev-2'] } },
        data: {
          processed: true,
          processedAt: expect.any(Date),
        },
      });
    });
  });

  describe('4. Fail-Closed Resilience on Redis Errors', () => {
    it('should safely fall back to PostgreSQL if Redis throws during cache get', async () => {
      // Force Redis get to throw
      mockRedis.get.mockRejectedValue(new Error('Redis connection refused'));

      mockPrisma.permissionNode.findMany.mockResolvedValue([
        { nodeCode: 'hostel', parent: null },
        { nodeCode: 'hostel.rooms.inventory.view', parent: { nodeCode: 'hostel' } },
      ]);

      mockPrisma.userRole.findMany.mockResolvedValue([
        {
          id: 'ur-h',
          userId: 'u-warden',
          organizationId: 'org-h',
          isActive: true,
          locationId: null,
          role: {
            id: 'r-w',
            roleCode: 'WARDEN',
            isActive: true,
            permissions: [{ isGranted: true, node: { nodeCode: 'hostel' } }],
          },
        },
      ]);

      // Service should not throw, but fallback to DB
      const perms = await service.getEffectivePermissions('u-warden', 'org-h');
      expect(perms.has('hostel.rooms.inventory.view')).toBe(true);
      expect(mockPrisma.userRole.findMany).toHaveBeenCalled();
    });
  });
});
