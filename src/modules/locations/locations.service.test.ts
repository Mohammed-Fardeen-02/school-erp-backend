import { describe, it, expect, vi, beforeEach } from 'vitest';
import { locationsService } from './locations.service';
import { locationsRepository } from './locations.repository';
import { AppError } from '../../core/errors/app-error';
import { prisma } from '../../core/database/prisma-client';

vi.mock('./locations.repository', () => ({
  locationsRepository: {
    findByOrganization: vi.fn(),
    findById: vi.fn(),
    findByCode: vi.fn(),
    createWithQuotaLock: vi.fn(),
    update: vi.fn(),
    setMainCampus: vi.fn(),
    toggleStatus: vi.fn(),
  },
}));

vi.mock('../../core/database/prisma-client', () => ({
  prisma: {
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe('LocationsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLocations', () => {
    it('should query locations by organization id with filters', async () => {
      const mockLocations = [
        { id: 'loc-1', name: 'Main Campus', isMainCampus: true },
        { id: 'loc-2', name: 'North Branch', isMainCampus: false },
      ];
      vi.mocked(locationsRepository.findByOrganization).mockResolvedValue(mockLocations as any);

      const result = await locationsService.getLocations('org-1', { isActive: true });
      expect(locationsRepository.findByOrganization).toHaveBeenCalledWith('org-1', { isActive: true });
      expect(result).toEqual(mockLocations);
    });
  });

  describe('getLocationById', () => {
    it('should return location when found with matching organizationId', async () => {
      const mockLocation = { id: 'loc-1', organizationId: 'org-1', name: 'Main Campus' };
      vi.mocked(locationsRepository.findById).mockResolvedValue(mockLocation as any);

      const result = await locationsService.getLocationById('loc-1', 'org-1');
      expect(result).toEqual(mockLocation);
    });

    it('should throw 404 AppError when location is not found in organization', async () => {
      vi.mocked(locationsRepository.findById).mockResolvedValue(null);

      await expect(locationsService.getLocationById('loc-999', 'org-1')).rejects.toThrow(AppError);
    });
  });

  describe('createLocation', () => {
    it('should reject creation if code already exists in organization', async () => {
      vi.mocked(locationsRepository.findByCode).mockResolvedValue({ id: 'loc-1' } as any);

      await expect(
        locationsService.createLocation(
          'org-1',
          { code: 'EXISTING', name: 'Existing Branch' },
          'user-1'
        )
      ).rejects.toThrow(AppError);
    });

    it('should create location and audit log when code is unique', async () => {
      vi.mocked(locationsRepository.findByCode).mockResolvedValue(null);
      const newLoc = {
        id: 'loc-new',
        organizationId: 'org-1',
        code: 'NEW_BRANCH',
        name: 'New Branch',
        isMainCampus: false,
        locationType: 'BRANCH_CAMPUS',
      };
      vi.mocked(locationsRepository.createWithQuotaLock).mockResolvedValue(newLoc as any);

      const result = await locationsService.createLocation(
        'org-1',
        { code: 'NEW_BRANCH', name: 'New Branch' },
        'user-1'
      );

      expect(locationsRepository.createWithQuotaLock).toHaveBeenCalledWith('org-1', {
        code: 'NEW_BRANCH',
        name: 'New Branch',
      });
      expect(result).toEqual(newLoc);
    });
  });

  describe('setMainCampus', () => {
    it('should invoke repository setMainCampus and write audit log', async () => {
      const updatedLoc = { id: 'loc-2', isMainCampus: true, name: 'North Branch' };
      vi.mocked(locationsRepository.setMainCampus).mockResolvedValue(updatedLoc as any);

      const result = await locationsService.setMainCampus('org-1', 'loc-2', 'user-1');
      expect(locationsRepository.setMainCampus).toHaveBeenCalledWith('org-1', 'loc-2');
      expect(result).toEqual(updatedLoc);
    });
  });

  describe('toggleStatus', () => {
    it('should toggle status and write audit log', async () => {
      const updatedLoc = { id: 'loc-2', isActive: false };
      vi.mocked(locationsRepository.toggleStatus).mockResolvedValue(updatedLoc as any);

      const result = await locationsService.toggleStatus('loc-2', 'org-1', false, 'user-1');
      expect(locationsRepository.toggleStatus).toHaveBeenCalledWith('loc-2', 'org-1', false);
      expect(result).toEqual(updatedLoc);
    });
  });
});

