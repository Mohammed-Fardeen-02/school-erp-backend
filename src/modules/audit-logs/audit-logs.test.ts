import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../app';
import { auditLogsRepository } from './audit-logs.repository';
import { prisma } from '../../core/database/prisma-client';
import { env } from '../../config/env';
import { effectivePermissionsService } from '../../core/authorization/effective-permissions.service';

describe('Stage 5.2: Centralized Audit Logs & Immutability Test Suite', () => {
  let testOrg: any;
  let testCampus: any;

  const createToken = (userId: string = 'usr-audit-tester', userType: 'TENANT' | 'PLATFORM' = 'TENANT') => {
    return jwt.sign(
      { sub: userId, email: `${userId}@school.edu`, userType, tokenVersion: 1 },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h' }
    );
  };

  beforeAll(async () => {
    const timestamp = Date.now();
    testOrg = await prisma.organization.create({
      data: {
        code: `AUDIT_T_${timestamp}`.substring(0, 20),
        legalName: 'Audit Test Legal Org',
        displayName: 'Audit Test Org',
        email: `audit_t_${timestamp}@test.edu`,
        phone: '1234567890',
        status: 'ACTIVE',
      },
    });

    testCampus = await prisma.location.create({
      data: {
        organizationId: testOrg.id,
        code: `CAMPUS_${timestamp}`.substring(0, 20),
        name: 'Audit Test Campus',
        isMainCampus: true,
      },
    });
  });

  afterAll(async () => {
    try {
      // Allow cleanup with explicit session variable for test suite within a single transaction
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_modification = 'true'");
        await tx.auditLog.deleteMany({
          where: { organizationId: testOrg.id },
        });
      });
      await prisma.location.deleteMany({
        where: { id: testCampus.id },
      });
      await prisma.organization.deleteMany({
        where: { id: testOrg.id },
      });
    } catch {
      // Safe teardown
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();

    // Default mock authenticated active user
    vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
      id: 'usr-audit-tester',
      email: 'usr-audit-tester@school.edu',
      userType: 'TENANT',
      isActive: true,
      tokenVersion: 1,
    });

    // Default mock active tenant membership
    vi.spyOn((prisma as any).organizationMembership, 'findUnique').mockResolvedValue({
      id: 'mem-audit-1',
      userId: 'usr-audit-tester',
      organizationId: testOrg.id,
      status: 'ACTIVE',
      organization: { status: 'ACTIVE' },
    });
  });

  const setupPermissions = (permissions: string[]) => {
    vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
      new Set(permissions)
    );
    vi.spyOn(effectivePermissionsService, 'hasPermission').mockImplementation(
      async (_userId, _orgId, _locId, targetCode) => permissions.includes(targetCode)
    );
  };

  // =========================================================================
  // 1. PostgreSQL Database Immutability & Append-Only Protection
  // =========================================================================
  describe('1. Database Engine Immutability Trigger', () => {
    it('allows INSERT into audit.audit_logs', async () => {
      const created = await prisma.auditLog.create({
        data: {
          organizationId: testOrg.id,
          locationId: testCampus.id,
          action: 'TEST_INSERT_ALLOWED',
          entity: 'TestEntity',
          entityId: 'ent-001',
          newState: { status: 'created' },
        },
      });

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.action).toBe('TEST_INSERT_ALLOWED');
      expect(created.locationId).toBe(testCampus.id);
    });

    it('rejects ordinary UPDATE operations on audit.audit_logs at PostgreSQL level', async () => {
      const created = await prisma.auditLog.create({
        data: {
          organizationId: testOrg.id,
          action: 'TEST_UPDATE_PREVENTION',
          entity: 'TestEntity',
          entityId: 'ent-002',
          newState: { original: true },
        },
      });

      // Direct SQL or Prisma UPDATE must fail with immutability exception
      await expect(
        prisma.auditLog.update({
          where: { id: created.id },
          data: { action: 'ATTEMPTED_TAMPERING' },
        })
      ).rejects.toThrow(/append-only audit log table.*UPDATE and DELETE operations are prohibited/i);
    });

    it('rejects ordinary DELETE operations on audit.audit_logs at PostgreSQL level', async () => {
      const created = await prisma.auditLog.create({
        data: {
          organizationId: testOrg.id,
          action: 'TEST_DELETE_PREVENTION',
          entity: 'TestEntity',
          entityId: 'ent-003',
          newState: { original: true },
        },
      });

      // Direct SQL or Prisma DELETE must fail with immutability exception
      await expect(
        prisma.auditLog.delete({
          where: { id: created.id },
        })
      ).rejects.toThrow(/append-only audit log table.*UPDATE and DELETE operations are prohibited/i);
    });
  });

  // =========================================================================
  // 2. Centralized Audit Log Listing API (GET /api/v1/audit-logs)
  // =========================================================================
  describe('2. GET /api/v1/audit-logs', () => {
    it('requires settings.audit_logs.trail.view permission', async () => {
      setupPermissions([]); // User lacks permission
      const token = createToken();

      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', testOrg.id);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('returns paginated audit records scoped to active organization', async () => {
      setupPermissions(['settings.audit_logs.trail.view']);
      const token = createToken();

      const mockLogs = [
        {
          id: 'aud-001',
          organizationId: testOrg.id,
          locationId: testCampus.id,
          userId: 'usr-1',
          action: 'ROLE_CREATED',
          entity: 'Role',
          entityId: 'role-123',
          previousState: null,
          newState: { roleName: 'Department Head' },
          ipAddress: '192.168.1.50',
          userAgent: 'Chrome 131',
          createdAt: new Date('2026-11-19T10:00:00Z'),
          user: { id: 'usr-1', firstName: 'John', lastName: 'Doe', email: 'john@school.edu' },
          location: { id: testCampus.id, code: testCampus.code, name: testCampus.name },
        },
      ];

      vi.spyOn(auditLogsRepository, 'findManyAndCount').mockResolvedValue({
        total: 1,
        rawLogs: mockLogs as any,
        page: 1,
        limit: 10,
      });

      const res = await request(app)
        .get('/api/v1/audit-logs?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', testOrg.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].action).toBe('ROLE_CREATED');
      expect(res.body.data[0].actorName).toBe('John Doe');
      expect(res.body.data[0].actorEmail).toBe('john@school.edu');
      expect(res.body.data[0].campusName).toBe(`${testCampus.name} (${testCampus.code})`);
      expect(res.body.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('enforces multi-tenant query isolation', async () => {
      setupPermissions(['settings.audit_logs.trail.view']);
      const token = createToken();

      const repoSpy = vi.spyOn(auditLogsRepository, 'findManyAndCount').mockResolvedValue({
        total: 0,
        rawLogs: [],
        page: 1,
        limit: 10,
      });

      await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', testOrg.id);

      // Verify repository was invoked with caller's organization ID, NOT any foreign tenant
      expect(repoSpy).toHaveBeenCalledWith(
        testOrg.id,
        expect.anything(),
        undefined
      );
    });

    it('enforces campus scope when location context is present', async () => {
      setupPermissions(['settings.audit_logs.trail.view']);
      const token = createToken();

      const repoSpy = vi.spyOn(auditLogsRepository, 'findManyAndCount').mockResolvedValue({
        total: 0,
        rawLogs: [],
        page: 1,
        limit: 10,
      });

      await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', testOrg.id)
        .set('X-Location-Id', testCampus.id);

      expect(repoSpy).toHaveBeenCalledWith(
        testOrg.id,
        expect.anything(),
        testCampus.id
      );
    });
  });

  // =========================================================================
  // 3. Single Audit Record Inspection (GET /api/v1/audit-logs/:id)
  // =========================================================================
  describe('3. GET /api/v1/audit-logs/:id', () => {
    it('returns single sanitized audit record detail', async () => {
      setupPermissions(['settings.audit_logs.trail.view']);
      const token = createToken();

      const mockLog = {
        id: 'aud-single-1',
        organizationId: testOrg.id,
        locationId: testCampus.id,
        userId: 'usr-1',
        action: 'USER_ROLE_ASSIGNED',
        entity: 'UserRole',
        entityId: 'ur-1',
        previousState: null,
        newState: {
          roleId: 'role-1',
          apiKey: 'pk_secret_12345', // Must be sanitized!
        },
        ipAddress: '10.0.0.1',
        userAgent: 'Firefox 133',
        createdAt: new Date('2026-11-19T11:00:00Z'),
        user: { id: 'usr-1', firstName: 'Admin', lastName: 'User', email: 'admin@school.edu' },
        location: { id: testCampus.id, code: testCampus.code, name: testCampus.name },
      };

      vi.spyOn(auditLogsRepository, 'findById').mockResolvedValue(mockLog as any);

      const res = await request(app)
        .get('/api/v1/audit-logs/00000000-0000-4000-a000-000000000099')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', testOrg.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.action).toBe('USER_ROLE_ASSIGNED');
      // Assert sensitive apiKey is redacted in response
      expect(res.body.data.newState.apiKey).toBe('[REDACTED]');
    });

    it('returns 404 when record does not exist or belongs to another tenant', async () => {
      setupPermissions(['settings.audit_logs.trail.view']);
      const token = createToken();

      vi.spyOn(auditLogsRepository, 'findById').mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/audit-logs/00000000-0000-4000-a000-000000000099')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', testOrg.id);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // 4. CSV Export & Formula Injection Defense (GET /api/v1/audit-logs/export)
  // =========================================================================
  describe('4. GET /api/v1/audit-logs/export', () => {
    it('requires settings.audit_logs.trail.export permission', async () => {
      setupPermissions(['settings.audit_logs.trail.view']); // Lacks export permission
      const token = createToken();

      const res = await request(app)
        .get('/api/v1/audit-logs/export')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', testOrg.id);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('streams CSV with header and neutralizes CSV Formula Injection', async () => {
      setupPermissions(['settings.audit_logs.trail.export']);
      const token = createToken();

      const dangerousMockLogs = [
        {
          id: 'aud-vuln-1',
          organizationId: testOrg.id,
          locationId: testCampus.id,
          userId: 'usr-attacker',
          // Formula injection payloads in action, entity, actor
          action: '=cmd|"/C calc"!A0',
          entity: '+1+2',
          entityId: '-@evil.com',
          previousState: null,
          newState: { payload: '@SUM(A1:A10)' },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla',
          createdAt: new Date('2026-11-19T12:00:00Z'),
          user: { id: 'usr-attacker', firstName: '=DDE', lastName: 'Attack', email: 'calc@evil.com' },
          location: null,
        },
      ];

      vi.spyOn(auditLogsRepository, 'countExportRecords').mockResolvedValue(1);
      vi.spyOn(auditLogsRepository, 'findExportBatch').mockResolvedValue(dangerousMockLogs as any);
      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      const res = await request(app)
        .get('/api/v1/audit-logs/export')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', testOrg.id);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename="audit_logs_');

      const csvText = res.text;
      // Formula prefix characters must be prepended with a single quote to prevent execution in Excel
      expect(csvText).toContain("'=cmd|\"\"/C calc\"\"!A0");
      expect(csvText).toContain("'+1+2");
      expect(csvText).toContain("'-@evil.com");
      expect(csvText).toContain("'=DDE Attack");
    });
  });
});
