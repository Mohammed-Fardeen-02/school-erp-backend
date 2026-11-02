import { describe, it, expect, vi, beforeEach } from 'vitest';
import { locationsService } from '../../modules/locations/locations.service';
import { locationsRepository } from '../../modules/locations/locations.repository';
import { workspaceService } from '../../modules/workspace/workspace.service';
import { workspaceRepository } from '../../modules/workspace/workspace.repository';
import { organizationsService } from '../../modules/organizations/organizations.service';
import { organizationsRepository } from '../../modules/organizations/organizations.repository';
import { AppError } from '../../core/errors/app-error';

vi.mock('../../modules/locations/locations.repository');
vi.mock('../../modules/workspace/workspace.repository');
vi.mock('../../modules/organizations/organizations.repository');
vi.mock('../../core/database/prisma-client', () => ({
  prisma: {
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

describe('Phase 2 Multi-Tenant Security & Isolation Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Tenant and Resource Isolation (Cross-Tenant Tampering Prevention)', () => {
    it('should block tenant users from retrieving another organization by ID', async () => {
      const callerOrgId = 'org-tenant-a';
      const targetOrgId = 'org-tenant-b';

      await expect(
        organizationsService.getOrganizationById(targetOrgId, callerOrgId, false)
      ).rejects.toThrow(
        /Cross-tenant access forbidden/
      );
    });

    it('should block cross-tenant organization modification', async () => {
      const callerOrgId = 'org-tenant-a';
      const targetOrgId = 'org-tenant-b';

      await expect(
        organizationsService.updateOrganization(
          targetOrgId,
          { displayName: 'Tampered Name' },
          callerOrgId,
          false,
          'user-1'
        )
      ).rejects.toThrow(
        /Cross-tenant modification forbidden/
      );
    });

    it('should throw 404 when querying location belonging to another tenant', async () => {
      // Repository dual-key findById returns null when organizationId does not match
      vi.mocked(locationsRepository.findById).mockResolvedValue(null);

      await expect(
        locationsService.getLocationById('loc-belongs-to-b', 'org-tenant-a')
      ).rejects.toThrow(AppError);
    });
  });

  describe('2. Active-Campus Quota & Main Campus Integrity', () => {
    it('should enforce active-campus quota limit on creation', async () => {
      vi.mocked(locationsRepository.findByCode).mockResolvedValue(null);
      vi.mocked(locationsRepository.createWithQuotaLock).mockRejectedValue(
        AppError.badRequest('Location quota reached. Your plan allows a maximum of 2 active campuses.')
      );

      await expect(
        locationsService.createLocation(
          'org-1',
          { code: 'CAMPUS_3', name: 'Third Campus' },
          'user-1'
        )
      ).rejects.toThrow(/Location quota reached/);
    });

    it('should reject deactivation of designated main campus', async () => {
      vi.mocked(locationsRepository.toggleStatus).mockRejectedValue(
        AppError.badRequest('Cannot deactivate the designated main campus')
      );

      await expect(
        locationsService.toggleStatus('loc-main', 'org-1', false, 'user-1')
      ).rejects.toThrow(/Cannot deactivate the designated main campus/);
    });
  });

  describe('3. Tenant Lifecycle Invariants', () => {
    it('should reject context selection for ARCHIVED organizations', async () => {
      vi.mocked(workspaceRepository.findMembership).mockResolvedValue({
        id: 'mem-1',
        status: 'ACTIVE',
        organization: { id: 'org-archived', status: 'ARCHIVED' },
      } as any);

      await expect(
        workspaceService.selectContext('user-1', { organizationId: 'org-archived' }, false)
      ).rejects.toThrow(/archived/);
    });

    it('should reject context selection for SUSPENDED organizations', async () => {
      vi.mocked(workspaceRepository.findMembership).mockResolvedValue({
        id: 'mem-1',
        status: 'ACTIVE',
        organization: { id: 'org-suspended', status: 'SUSPENDED' },
      } as any);

      await expect(
        workspaceService.selectContext('user-1', { organizationId: 'org-suspended' }, false)
      ).rejects.toThrow(/suspended/);
    });
  });
});

