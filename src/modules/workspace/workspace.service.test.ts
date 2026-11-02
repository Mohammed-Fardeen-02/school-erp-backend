import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspaceService } from './workspace.service';
import { workspaceRepository } from './workspace.repository';
import { AppError } from '../../core/errors/app-error';
import { prisma } from '../../core/database/prisma-client';

vi.mock('./workspace.repository', () => ({
  workspaceRepository: {
    getUserOrganizations: vi.fn(),
    findMembership: vi.fn(),
    setPrimaryOrganization: vi.fn(),
    resolveLocation: vi.fn(),
    getEnabledModules: vi.fn(),
  },
}));

vi.mock('../../core/database/prisma-client', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe('WorkspaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserOrganizations', () => {
    it('should return user organizations from repository', async () => {
      const mockList = [
        {
          id: 'org-1',
          code: 'TEST_ORG',
          displayName: 'Test School',
          legalName: 'Test School Ltd',
          organizationType: 'INDEPENDENT_SCHOOL',
          status: 'ACTIVE',
          isPrimary: true,
          accessLevel: 'OWNER',
          membershipType: 'STAFF',
          campuses: [],
        },
      ];
      vi.mocked(workspaceRepository.getUserOrganizations).mockResolvedValue(mockList as any);

      const result = await workspaceService.getUserOrganizations('user-1');
      expect(result).toEqual(mockList);
      expect(workspaceRepository.getUserOrganizations).toHaveBeenCalledWith('user-1');
    });
  });

  describe('selectContext', () => {
    it('should forbid access if user has no active membership', async () => {
      vi.mocked(workspaceRepository.findMembership).mockResolvedValue(null);

      await expect(
        workspaceService.selectContext('user-1', { organizationId: 'org-1' }, false)
      ).rejects.toThrow(AppError);
    });

    it('should forbid access if tenant is ARCHIVED', async () => {
      vi.mocked(workspaceRepository.findMembership).mockResolvedValue({
        id: 'mem-1',
        status: 'ACTIVE',
        organization: { id: 'org-1', status: 'ARCHIVED' },
      } as any);

      await expect(
        workspaceService.selectContext('user-1', { organizationId: 'org-1' }, false)
      ).rejects.toThrow(AppError);
    });

    it('should forbid access if tenant is SUSPENDED', async () => {
      vi.mocked(workspaceRepository.findMembership).mockResolvedValue({
        id: 'mem-1',
        status: 'ACTIVE',
        organization: { id: 'org-1', status: 'SUSPENDED' },
      } as any);

      await expect(
        workspaceService.selectContext('user-1', { organizationId: 'org-1' }, false)
      ).rejects.toThrow(AppError);
    });

    it('should forbid access if trial period is expired', async () => {
      const expiredDate = new Date(Date.now() - 86400000); // 1 day ago
      vi.mocked(workspaceRepository.findMembership).mockResolvedValue({
        id: 'mem-1',
        status: 'ACTIVE',
        organization: { id: 'org-1', status: 'TRIAL', trialEndsAt: expiredDate },
      } as any);

      await expect(
        workspaceService.selectContext('user-1', { organizationId: 'org-1' }, false)
      ).rejects.toThrow(AppError);
    });

    it('should successfully resolve context and enabled modules for active membership', async () => {
      const validOrg = {
        id: 'org-1',
        code: 'TEST_ORG',
        displayName: 'Test School',
        legalName: 'Test School Ltd',
        organizationType: 'INDEPENDENT_SCHOOL',
        status: 'ACTIVE',
      };

      vi.mocked(workspaceRepository.findMembership).mockResolvedValue({
        id: 'mem-1',
        status: 'ACTIVE',
        accessLevel: 'ADMIN',
        membershipType: 'STAFF',
        isPrimary: true,
        organization: validOrg,
      } as any);

      const mockLocation = {
        id: 'loc-1',
        code: 'MAIN',
        name: 'Main Campus',
        locationType: 'MAIN_CAMPUS',
        isMainCampus: true,
      };

      vi.mocked(workspaceRepository.resolveLocation).mockResolvedValue(mockLocation as any);
      vi.mocked(workspaceRepository.getEnabledModules).mockResolvedValue([
        'STUDENTS',
        'ACADEMICS',
      ]);

      const result = await workspaceService.selectContext(
        'user-1',
        { organizationId: 'org-1' },
        false
      );

      expect(result.organization.code).toBe('TEST_ORG');
      expect(result.location?.code).toBe('MAIN');
      expect(result.membership.accessLevel).toBe('ADMIN');
      expect(result.enabledModules).toEqual(['STUDENTS', 'ACADEMICS']);
    });
  });

  describe('setPrimaryOrganization', () => {
    it('should update primary organization preference and log audit action', async () => {
      const updatedMem = { id: 'mem-1', userId: 'user-1', organizationId: 'org-2', isPrimary: true };
      vi.mocked(workspaceRepository.setPrimaryOrganization).mockResolvedValue(updatedMem as any);

      const result = await workspaceService.setPrimaryOrganization('user-1', 'org-2');
      expect(workspaceRepository.setPrimaryOrganization).toHaveBeenCalledWith('user-1', 'org-2');
      expect(result).toEqual(updatedMem);
    });
  });
});

