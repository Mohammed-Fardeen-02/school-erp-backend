import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
} from './permission.middleware';
import { effectivePermissionsService } from '../authorization/effective-permissions.service';
import { prisma } from '../database/prisma-client';

describe('Stage 3.3: Permission Middleware Suite', () => {
  let mockReq: any;
  let mockRes: any;
  let nextFn: any;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      originalUrl: '/api/v1/academics/courses',
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      user: undefined,
      organizationId: undefined,
      locationId: undefined,
    };
    mockRes = {};
    nextFn = vi.fn();
    vi.clearAllMocks();
  });

  describe('1. Authentication Guard', () => {
    it('should return 401 when request is unauthenticated', async () => {
      const mw = requirePermission('academics.curriculum.courses.view');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      const err = nextFn.mock.calls[0][0];
      expect(err).toBeDefined();
      expect(err.statusCode).toBe(401);
      expect(err.errorCode).toBe('UNAUTHENTICATED');
    });
  });

  describe('2. Platform Operator Inspection vs Mutation Audit', () => {
    beforeEach(() => {
      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'plat-admin-1',
        email: 'superadmin@schoolerp.io',
        userType: 'PLATFORM',
        isActive: true,
      });
    });

    it('should reject platform operator if DB record is not an active PLATFORM user', async () => {
      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'plat-admin-1',
        email: 'imposter@schoolerp.io',
        userType: 'TENANT', // DB check fails!
        isActive: true,
      });

      mockReq.user = { id: 'plat-admin-1', userType: 'PLATFORM' };
      mockReq.method = 'GET';
      mockReq.organizationId = 'org-123';

      const mw = requirePermission('students.profiles.records.view');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      const err = nextFn.mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.message).toContain('Platform operator verification failed');
    });

    it('should allow platform operator read-only inspection (GET) with telemetry', async () => {
      mockReq.user = { id: 'plat-admin-1', userType: 'PLATFORM' };
      mockReq.method = 'GET';
      mockReq.organizationId = 'org-123';

      const auditSpy = vi.spyOn((prisma as any).auditLog, 'create').mockResolvedValue({} as any);

      const mw = requirePermission('students.profiles.records.view');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith(); // Called with no error
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'plat-admin-1',
            action: 'PLATFORM_INSPECT_NODE',
            entity: 'PermissionNode',
          }),
        })
      );
    });

    it('should forbid platform mutation (POST) if X-Platform-Override header is missing', async () => {
      mockReq.user = { id: 'plat-admin-1', userType: 'PLATFORM' };
      mockReq.method = 'POST';
      mockReq.organizationId = 'org-123';

      const mw = requirePermission('students.admissions.enrollment.create');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      const err = nextFn.mock.calls[0][0];
      expect(err).toBeDefined();
      expect(err.statusCode).toBe(403);
      expect(err.message).toContain('Platform operator override (X-Platform-Override: true) required');
    });

    it('should forbid platform mutation if justification reason is missing or shorter than 10 characters', async () => {
      mockReq.user = { id: 'plat-admin-1', userType: 'PLATFORM' };
      mockReq.method = 'POST';
      mockReq.organizationId = 'org-123';
      mockReq.headers['x-platform-override'] = 'true';
      mockReq.headers['x-override-reason'] = 'Short'; // Less than 10 characters!

      const mw = requirePermission('students.admissions.enrollment.create');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      const err = nextFn.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.errorCode).toBe('BAD_REQUEST');
      expect(err.message).toContain('mandatory justification reason');
    });

    it('should allow platform mutation (POST) and record PLATFORM_OVERRIDE audit when header and justification are present', async () => {
      mockReq.user = { id: 'plat-admin-1', userType: 'PLATFORM' };
      mockReq.method = 'POST';
      mockReq.organizationId = 'org-123';
      mockReq.headers['x-platform-override'] = 'true';
      mockReq.headers['x-override-reason'] = 'Emergency fix for invalid admission records';

      const auditSpy = vi.spyOn((prisma as any).auditLog, 'create').mockResolvedValue({} as any);

      const mw = requirePermission('students.admissions.enrollment.create');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'plat-admin-1',
            action: 'PLATFORM_OVERRIDE',
            entity: 'PermissionNode',
            entityId: 'students.admissions.enrollment.create',
          }),
        })
      );
    });
  });

  describe('3. Tenant Dynamic Permission Enforcement', () => {
    it('should return 400 when tenant organization context is missing', async () => {
      mockReq.user = { id: 'u-1', userType: 'TENANT' }; // No organizationId!

      const mw = requirePermission('fees.invoices.billing.create');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      const err = nextFn.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.errorCode).toBe('TENANT_CONTEXT_MISSING');
    });

    it('should return 400 when campus location is required but not provided', async () => {
      mockReq.user = { id: 'u-1', userType: 'TENANT' };
      mockReq.organizationId = 'org-1';
      mockReq.locationId = undefined; // Missing required location

      const mw = requirePermission('attendance.student_daily.roster.mark', {
        requireLocation: true,
      });
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      const err = nextFn.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.errorCode).toBe('BAD_REQUEST');
      expect(err.message).toContain('Location context missing');
    });

    it('should return 403 when tenant user lacks the required permission', async () => {
      mockReq.user = { id: 'u-student', userType: 'TENANT' };
      mockReq.organizationId = 'org-1';

      vi.spyOn(effectivePermissionsService, 'hasPermission').mockResolvedValue(false);

      const mw = requirePermission('fees.discounts.waivers.apply');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      const err = nextFn.mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(err.message).toContain('fees.discounts.waivers.apply');
    });

    it('should call next() without error when permission is granted', async () => {
      mockReq.user = { id: 'u-accountant', userType: 'TENANT' };
      mockReq.organizationId = 'org-1';

      vi.spyOn(effectivePermissionsService, 'hasPermission').mockResolvedValue(true);

      const mw = requirePermission('fees.invoices.billing.create');
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
    });
  });

  describe('4. requireAnyPermission & requireAllPermissions', () => {
    it('requireAnyPermission should allow access if user has at least one permission', async () => {
      mockReq.user = { id: 'u-1', userType: 'TENANT' };
      mockReq.organizationId = 'org-1';

      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['students.profiles.records.view'])
      );

      const mw = requireAnyPermission([
        'students.profiles.records.view',
        'students.profiles.records.edit',
      ]);
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
    });

    it('requireAnyPermission should return 403 if user lacks all specified permissions', async () => {
      mockReq.user = { id: 'u-1', userType: 'TENANT' };
      mockReq.organizationId = 'org-1';

      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['library.books.catalog.view'])
      );

      const mw = requireAnyPermission([
        'settings.campuses.locations.create',
        'settings.security_audit.trail.view',
      ]);
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      const err = nextFn.mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('requireAllPermissions should allow access only if user has ALL specified permissions', async () => {
      mockReq.user = { id: 'u-1', userType: 'TENANT' };
      mockReq.organizationId = 'org-1';

      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['academics.curriculum.courses.view', 'academics.curriculum.courses.edit'])
      );

      const mw = requireAllPermissions([
        'academics.curriculum.courses.view',
        'academics.curriculum.courses.edit',
      ]);
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
    });

    it('requireAllPermissions should return 403 if ANY specified permission is missing', async () => {
      mockReq.user = { id: 'u-1', userType: 'TENANT' };
      mockReq.organizationId = 'org-1';

      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['academics.curriculum.courses.view']) // Missing .edit!
      );

      const mw = requireAllPermissions([
        'academics.curriculum.courses.view',
        'academics.curriculum.courses.edit',
      ]);
      await mw(mockReq, mockRes, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
      const err = nextFn.mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.errorCode).toBe('INSUFFICIENT_PERMISSIONS');
      expect(err.message).toContain('academics.curriculum.courses.edit');
    });
  });
});
