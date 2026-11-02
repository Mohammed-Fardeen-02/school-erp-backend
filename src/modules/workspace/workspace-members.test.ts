import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../app';
import { env } from '../../config/env';
import { prisma } from '../../core/database/prisma-client';
import { workspaceRepository } from './workspace.repository';
import { memberQuerySchema } from './workspace.validation';
import { effectivePermissionsService } from '../../core/authorization/effective-permissions.service';

describe('Stage 3.6.5.2: Backend Workspace Member Discovery', () => {
  describe('1. Zod Validation (memberQuerySchema)', () => {
    it('accepts valid query with defaults', async () => {
      const parsed = await memberQuerySchema.parseAsync({});
      expect(parsed).toEqual({
        search: undefined,
        page: 1,
        limit: 20,
      });
    });

    it('trims search query and respects valid pagination', async () => {
      const parsed = await memberQuerySchema.parseAsync({
        search: '  alice  ',
        page: '2',
        limit: '50',
      });
      expect(parsed).toEqual({
        search: 'alice',
        page: 2,
        limit: 50,
      });
    });

    it('rejects search queries exceeding 100 characters', async () => {
      const longSearch = 'a'.repeat(101);
      await expect(memberQuerySchema.parseAsync({ search: longSearch })).rejects.toThrow();
    });

    it('rejects non-numeric and malformed page values', async () => {
      await expect(memberQuerySchema.parseAsync({ page: 'abc' })).rejects.toThrow(/positive integer/i);
      await expect(memberQuerySchema.parseAsync({ page: '1.5' })).rejects.toThrow(/positive integer/i);
      await expect(memberQuerySchema.parseAsync({ page: '0' })).rejects.toThrow(/positive integer/i);
      await expect(memberQuerySchema.parseAsync({ page: '-3' })).rejects.toThrow(/positive integer/i);
    });

    it('rejects non-numeric and malformed limit values', async () => {
      await expect(memberQuerySchema.parseAsync({ limit: 'xyz' })).rejects.toThrow(/positive integer/i);
      await expect(memberQuerySchema.parseAsync({ limit: '0' })).rejects.toThrow(/positive integer/i);
      await expect(memberQuerySchema.parseAsync({ limit: '-10' })).rejects.toThrow(/positive integer/i);
    });

    it('rejects limit exceeding 100', async () => {
      await expect(memberQuerySchema.parseAsync({ limit: '101' })).rejects.toThrow(/cannot exceed 100/i);
      await expect(memberQuerySchema.parseAsync({ limit: '500' })).rejects.toThrow(/cannot exceed 100/i);
    });
  });

  describe('2. Repository Logic & Filtering (WorkspaceRepository.listMembers)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('constructs correct tenant-scoped whereClause with dual active filters', async () => {
      const findManySpy = vi
        .spyOn((prisma as any).organizationMembership, 'findMany')
        .mockResolvedValue([]);
      const countSpy = vi
        .spyOn((prisma as any).organizationMembership, 'count')
        .mockResolvedValue(0);

      const orgId = 'org-tenant-1';
      const result = await workspaceRepository.listMembers(orgId, { page: 1, limit: 20 });

      expect(findManySpy).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          status: 'ACTIVE',
          user: {
            isActive: true,
          },
        },
        select: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              isActive: true,
            },
          },
        },
        orderBy: [
          { user: { firstName: 'asc' } },
          { user: { lastName: 'asc' } },
          { userId: 'asc' },
        ],
        skip: 0,
        take: 20,
      });

      expect(countSpy).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          status: 'ACTIVE',
          user: {
            isActive: true,
          },
        },
      });

      expect(result).toEqual({
        members: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
    });

    it('applies case-insensitive search across firstName, lastName, email, phone', async () => {
      const findManySpy = vi
        .spyOn((prisma as any).organizationMembership, 'findMany')
        .mockResolvedValue([]);
      vi.spyOn((prisma as any).organizationMembership, 'count').mockResolvedValue(0);

      const orgId = 'org-tenant-1';
      await workspaceRepository.listMembers(orgId, { search: 'Sarah', page: 2, limit: 10 });

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: orgId,
            status: 'ACTIVE',
            user: {
              isActive: true,
              OR: [
                { firstName: { contains: 'Sarah', mode: 'insensitive' } },
                { lastName: { contains: 'Sarah', mode: 'insensitive' } },
                { email: { contains: 'Sarah', mode: 'insensitive' } },
                { phone: { contains: 'Sarah', mode: 'insensitive' } },
              ],
            },
          },
          skip: 10,
          take: 10,
        })
      );
    });

    it('maps records accurately and computes totalPages correctly', async () => {
      const mockRecords = [
        {
          user: {
            id: 'u-1',
            email: 'edna@springfield.edu',
            firstName: 'Edna',
            lastName: 'Krabappel',
            phone: '+15550100',
            isActive: true,
          },
        },
        {
          user: {
            id: 'u-2',
            email: 'seymour@springfield.edu',
            firstName: 'Seymour',
            lastName: 'Skinner',
            phone: '+15550101',
            isActive: true,
          },
        },
      ];

      vi.spyOn((prisma as any).organizationMembership, 'findMany').mockResolvedValue(mockRecords);
      vi.spyOn((prisma as any).organizationMembership, 'count').mockResolvedValue(25);

      const result = await workspaceRepository.listMembers('org-1', { page: 1, limit: 10 });

      expect(result.members).toHaveLength(2);
      expect(result.members[0]).toEqual({
        id: 'u-1',
        email: 'edna@springfield.edu',
        firstName: 'Edna',
        lastName: 'Krabappel',
        phone: '+15550100',
        isActive: true,
      });
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(3); // Math.ceil(25 / 10) = 3
    });
  });

  describe('3. Route Middleware Pipeline & Authorization', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    const createToken = (userId: string, userType: 'TENANT' | 'PLATFORM' = 'TENANT') => {
      return jwt.sign(
        { sub: userId, email: `${userId}@springfield.edu`, userType, tokenVersion: 1 },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '1h' }
      );
    };

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .get('/api/v1/workspace/members')
        .set('X-Organization-Id', 'org-1');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects request with missing X-Organization-Id context with 400', async () => {
      const token = createToken('user-admin');

      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'user-admin',
        userType: 'TENANT',
        isActive: true,
        tokenVersion: 1,
      });

      const res = await request(app)
        .get('/api/v1/workspace/members')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TENANT_CONTEXT_MISSING');
    });

    it('rejects caller when tenant membership is not ACTIVE with 403', async () => {
      const token = createToken('user-suspended');

      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'user-suspended',
        userType: 'TENANT',
        isActive: true,
        tokenVersion: 1,
      });

      // Suspended membership
      vi.spyOn((prisma as any).organizationMembership, 'findUnique').mockResolvedValue({
        id: 'mem-1',
        userId: 'user-suspended',
        organizationId: 'org-1',
        status: 'SUSPENDED',
        organization: { id: 'org-1', status: 'ACTIVE' },
      });

      const res = await request(app)
        .get('/api/v1/workspace/members')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-1');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TENANT_ACCESS_DENIED');
    });

    it('rejects caller when organization is SUSPENDED with 403', async () => {
      const token = createToken('user-admin');

      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'user-admin',
        userType: 'TENANT',
        isActive: true,
        tokenVersion: 1,
      });

      vi.spyOn((prisma as any).organizationMembership, 'findUnique').mockResolvedValue({
        id: 'mem-1',
        userId: 'user-admin',
        organizationId: 'org-1',
        status: 'ACTIVE',
        organization: { id: 'org-1', status: 'SUSPENDED' },
      });

      const res = await request(app)
        .get('/api/v1/workspace/members')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-1');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TENANT_ACCESS_DENIED');
    });

    it('rejects caller when lacking both assign and view permissions with 403', async () => {
      const token = createToken('user-student');

      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'user-student',
        userType: 'TENANT',
        isActive: true,
        tokenVersion: 1,
      });

      vi.spyOn((prisma as any).organizationMembership, 'findUnique').mockResolvedValue({
        id: 'mem-1',
        userId: 'user-student',
        organizationId: 'org-1',
        status: 'ACTIVE',
        organization: { id: 'org-1', status: 'ACTIVE' },
      });

      // Caller has neither permission
      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(new Set());

      const res = await request(app)
        .get('/api/v1/workspace/members')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-1');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });

    it('allows caller possessing settings.user_assignments.allocations.assign and returns 200 envelope', async () => {
      const token = createToken('user-admin');

      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'user-admin',
        userType: 'TENANT',
        isActive: true,
        tokenVersion: 1,
      });

      vi.spyOn((prisma as any).organizationMembership, 'findUnique').mockResolvedValue({
        id: 'mem-admin',
        userId: 'user-admin',
        organizationId: 'org-1',
        status: 'ACTIVE',
        organization: { id: 'org-1', status: 'ACTIVE' },
      });

      // Grant .assign
      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['settings.user_assignments.allocations.assign'])
      );

      vi.spyOn(workspaceRepository, 'listMembers').mockResolvedValue({
        members: [
          {
            id: 'u-target-1',
            email: 'target@springfield.edu',
            firstName: 'Target',
            lastName: 'User',
            phone: null,
            isActive: true,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await request(app)
        .get('/api/v1/workspace/members')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Organization members retrieved successfully');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('u-target-1');
      expect(res.body.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('allows caller possessing settings.user_assignments.allocations.view and returns 200 envelope', async () => {
      const token = createToken('user-principal');

      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'user-principal',
        userType: 'TENANT',
        isActive: true,
        tokenVersion: 1,
      });

      vi.spyOn((prisma as any).organizationMembership, 'findUnique').mockResolvedValue({
        id: 'mem-principal',
        userId: 'user-principal',
        organizationId: 'org-1',
        status: 'ACTIVE',
        organization: { id: 'org-1', status: 'ACTIVE' },
      });

      // Grant .view
      vi.spyOn(effectivePermissionsService, 'getEffectivePermissions').mockResolvedValue(
        new Set(['settings.user_assignments.allocations.view'])
      );

      vi.spyOn(workspaceRepository, 'listMembers').mockResolvedValue({
        members: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      const res = await request(app)
        .get('/api/v1/workspace/members?search=nonexistent')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toEqual({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
    });

    it('rejects malformed query parameters with 422 validation error', async () => {
      const token = createToken('user-admin');

      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'user-admin',
        userType: 'TENANT',
        isActive: true,
        tokenVersion: 1,
      });

      vi.spyOn((prisma as any).organizationMembership, 'findUnique').mockResolvedValue({
        id: 'mem-admin',
        userId: 'user-admin',
        organizationId: 'org-1',
        status: 'ACTIVE',
        organization: { id: 'org-1', status: 'ACTIVE' },
      });

      const res = await request(app)
        .get('/api/v1/workspace/members?page=badpage&limit=200')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-1');

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('allows platform super-admin via trusted server-side authorization', async () => {
      const token = createToken('platform-super-admin', 'PLATFORM');

      vi.spyOn((prisma as any).user, 'findUnique').mockResolvedValue({
        id: 'platform-super-admin',
        email: 'superadmin@eduerp.internal',
        userType: 'PLATFORM',
        isActive: true,
        tokenVersion: 1,
      });

      vi.spyOn((prisma as any).organization, 'findUnique').mockResolvedValue({
        id: 'org-1',
        status: 'ACTIVE',
      });

      vi.spyOn((prisma as any).auditLog, 'create').mockResolvedValue({});

      vi.spyOn(workspaceRepository, 'listMembers').mockResolvedValue({
        members: [
          {
            id: 'u-1',
            email: 'admin@springfield.edu',
            firstName: 'Admin',
            lastName: 'User',
            phone: null,
            isActive: true,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await request(app)
        .get('/api/v1/workspace/members')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });
});
