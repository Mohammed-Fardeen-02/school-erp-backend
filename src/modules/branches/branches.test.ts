import { describe, it, expect, vi, beforeEach } from 'vitest';
import { branchesService } from './branches.service';
import { branchesRepository } from './branches.repository';
import { AppError } from '../../core/errors/app-error';

vi.mock('./branches.repository', () => ({
  branchesRepository: {
    findByOrganization: vi.fn(),
    findById: vi.fn(),
    findByCode: vi.fn(),
    createWithQuotaLock: vi.fn(),
    update: vi.fn(),
    setMainBranch: vi.fn(),
    toggleStatus: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../core/database/prisma-client', () => ({
  prisma: {
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe('BranchesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBranches', () => {
    it('should query branches scoped to the target organization', async () => {
      const mockBranches = [
        { id: 'br-1', code: 'BR-MAIN', name: 'Main Campus Branch', isMainCampus: true },
        { id: 'br-2', code: 'BR-NORTH', name: 'North Branch', isMainCampus: false },
      ];
      vi.mocked(branchesRepository.findByOrganization).mockResolvedValue(mockBranches as any);

      const result = await branchesService.getBranches('org-123', { isActive: true });
      expect(branchesRepository.findByOrganization).toHaveBeenCalledWith('org-123', { isActive: true });
      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('BR-MAIN');
    });
  });

  describe('getBranchById', () => {
    it('should return branch when found in active organization', async () => {
      const mockBranch = { id: 'br-1', organizationId: 'org-123', name: 'Main Campus Branch' };
      vi.mocked(branchesRepository.findById).mockResolvedValue(mockBranch as any);

      const result = await branchesService.getBranchById('br-1', 'org-123');
      expect(result).toEqual(mockBranch);
    });

    it('should throw 404 AppError when branch does not exist in organization', async () => {
      vi.mocked(branchesRepository.findById).mockResolvedValue(null);

      await expect(branchesService.getBranchById('br-unknown', 'org-123')).rejects.toThrow(AppError);
    });
  });

  describe('createBranch', () => {
    it('should create a branch with user-provided code when unique', async () => {
      vi.mocked(branchesRepository.findByCode).mockResolvedValue(null);
      vi.mocked(branchesRepository.createWithQuotaLock).mockImplementation(async (_orgId, data) => ({
        id: 'br-new',
        organizationId: 'org-123',
        ...data,
      } as any));

      const payload = {
        code: 'BR-EAST',
        name: 'East Wing Academic Branch',
        locationType: 'BRANCH_CAMPUS' as const,
      };

      const result = await branchesService.createBranch('org-123', payload, 'user-admin');
      expect(branchesRepository.findByCode).toHaveBeenCalledWith('org-123', 'BR-EAST');
      expect(result.code).toBe('BR-EAST');
      expect(result.name).toBe('East Wing Academic Branch');
    });

    it('should auto-generate a unique branch code when code is omitted', async () => {
      vi.mocked(branchesRepository.findByCode).mockResolvedValue(null);
      vi.mocked(branchesRepository.createWithQuotaLock).mockImplementation(async (_orgId, data) => ({
        id: 'br-new-auto',
        organizationId: 'org-123',
        ...data,
      } as any));

      const payload = {
        name: 'Science & Technology Branch',
      };

      const result = await branchesService.createBranch('org-123', payload, 'user-admin');
      expect(result.code).toBeDefined();
      expect(result.code.length).toBeGreaterThan(2);
      expect(result.name).toBe('Science & Technology Branch');
    });

    it('should throw 409 conflict when code is already taken in the organization', async () => {
      vi.mocked(branchesRepository.findByCode).mockResolvedValue({ id: 'br-existing' } as any);

      const payload = {
        code: 'BR-DUPLICATE',
        name: 'Duplicate Branch',
      };

      await expect(branchesService.createBranch('org-123', payload, 'user-admin')).rejects.toThrow(AppError);
    });
  });

  describe('updateBranch', () => {
    it('should update branch details and return updated entity', async () => {
      const existing = { id: 'br-1', organizationId: 'org-123', name: 'Old Branch Name' };
      const updated = { id: 'br-1', organizationId: 'org-123', name: 'Updated Branch Name' };

      vi.mocked(branchesRepository.findById).mockResolvedValueOnce(existing as any).mockResolvedValueOnce(updated as any);
      vi.mocked(branchesRepository.update).mockResolvedValue(updated as any);

      const res = await branchesService.updateBranch('br-1', 'org-123', { name: 'Updated Branch Name' }, 'user-admin');
      expect(res.name).toBe('Updated Branch Name');
    });
  });

  describe('toggleStatus', () => {
    it('should toggle branch status to inactive for non-main branch', async () => {
      const existing = { id: 'br-2', organizationId: 'org-123', isMainCampus: false, isActive: true };
      vi.mocked(branchesRepository.findById).mockResolvedValue(existing as any);
      vi.mocked(branchesRepository.toggleStatus).mockResolvedValue({ ...existing, isActive: false } as any);

      const res = await branchesService.toggleStatus('br-2', 'org-123', false, 'user-admin');
      expect(res.isActive).toBe(false);
    });

    it('should reject deactivation if the branch is the designated main campus', async () => {
      const mainBranch = { id: 'br-1', organizationId: 'org-123', isMainCampus: true, isActive: true };
      vi.mocked(branchesRepository.findById).mockResolvedValue(mainBranch as any);

      await expect(branchesService.toggleStatus('br-1', 'org-123', false, 'user-admin')).rejects.toThrow(AppError);
    });
  });

  describe('setMainBranch', () => {
    it('should designate a branch as the main campus', async () => {
      const target = { id: 'br-2', organizationId: 'org-123', isMainCampus: true, locationType: 'MAIN_CAMPUS' };
      vi.mocked(branchesRepository.setMainBranch).mockResolvedValue(target as any);

      const res = await branchesService.setMainBranch('br-2', 'org-123', 'user-admin');
      expect(res.isMainCampus).toBe(true);
    });
  });
});
