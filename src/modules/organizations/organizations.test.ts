import { describe, it, expect, vi, beforeEach } from 'vitest';
import { organizationsService } from './organizations.service';
import { organizationsRepository } from './organizations.repository';
import { AppError } from '../../core/errors/app-error';

vi.mock('./organizations.repository', () => ({
  organizationsRepository: {
    findAll: vi.fn(),
    findAllForUser: vi.fn(),
    findById: vi.fn(),
    findByCode: vi.fn(),
    createWithProvisioning: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    getModules: vi.fn(),
    setModules: vi.fn(),
    getActivity: vi.fn(),
  },
}));

vi.mock('../../core/database/prisma-client', () => ({
  prisma: {
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { prisma } from '../../core/database/prisma-client';

describe('OrganizationsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrganizations', () => {
    it('should query all organizations for platform operator', async () => {
      const mockResult = {
        items: [{ id: 'org-1', code: 'SPRING', displayName: 'Springfield Academy' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      vi.mocked(organizationsRepository.findAll).mockResolvedValue(mockResult as any);

      const result = await organizationsService.getOrganizations({ page: 1, limit: 10 }, true);

      expect(organizationsRepository.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
    });

    it('should query tenant-scoped organizations for regular tenant user', async () => {
      const mockResult = {
        items: [{ id: 'org-1', code: 'SPRING', displayName: 'Springfield Academy' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      vi.mocked(organizationsRepository.findAllForUser).mockResolvedValue(mockResult as any);

      const result = await organizationsService.getOrganizations({ page: 1, limit: 10 }, false, 'usr-123');

      expect(organizationsRepository.findAllForUser).toHaveBeenCalledWith('usr-123', { page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getOrganizationById', () => {
    it('should return organization when accessed by authorized user', async () => {
      const mockOrg = { id: 'org-1', code: 'SPRING', displayName: 'Springfield Academy' };
      vi.mocked(organizationsRepository.findById).mockResolvedValue(mockOrg as any);

      const result = await organizationsService.getOrganizationById('org-1', 'org-1', false);

      expect(result).toEqual(mockOrg);
    });

    it('should block cross-tenant inspection and throw 403', async () => {
      await expect(
        organizationsService.getOrganizationById('org-target', 'org-other', false)
      ).rejects.toThrow('Cross-tenant access forbidden');
    });

    it('should allow platform operator to inspect any organization', async () => {
      const mockOrg = { id: 'org-target', code: 'TARGET', displayName: 'Target Academy' };
      vi.mocked(organizationsRepository.findById).mockResolvedValue(mockOrg as any);

      const result = await organizationsService.getOrganizationById('org-target', 'org-platform', true);

      expect(result).toEqual(mockOrg);
    });

    it('should throw 404 when organization is not found', async () => {
      vi.mocked(organizationsRepository.findById).mockResolvedValue(null);

      await expect(
        organizationsService.getOrganizationById('org-unknown', 'org-unknown', false)
      ).rejects.toThrow(AppError);
    });
  });

  describe('createOrganization', () => {
    it('should reject duplicate organization codes with 409 conflict', async () => {
      vi.mocked(organizationsRepository.findByCode).mockResolvedValue({ id: 'org-existing' } as any);

      await expect(
        organizationsService.createOrganization(
          {
            code: 'DUPLICATE',
            legalName: 'Duplicate School',
            displayName: 'Duplicate',
            email: 'admin@dup.com',
            phone: '1234567890',
          },
          'admin-1'
        )
      ).rejects.toThrow('already registered');
    });

    it('should provision organization atomically and record audit log', async () => {
      vi.mocked(organizationsRepository.findByCode).mockResolvedValue(null);
      const mockProvisioned = {
        organization: { id: 'org-new', code: 'NEW-ORG', legalName: 'New School', status: 'ACTIVE' },
        mainCampus: { id: 'loc-main', code: 'NEW-ORG-MAIN', name: 'Main Campus' },
        enabledModules: ['ACADEMICS', 'STUDENTS'],
      };
      vi.mocked(organizationsRepository.createWithProvisioning).mockResolvedValue(mockProvisioned as any);

      const result = await organizationsService.createOrganization(
        {
          code: 'NEW-ORG',
          legalName: 'New School',
          displayName: 'New School',
          email: 'admin@new.com',
          phone: '1234567890',
        },
        'admin-1'
      );

      expect(organizationsRepository.createWithProvisioning).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ORGANIZATION_PROVISIONED',
            organizationId: 'org-new',
          }),
        })
      );
      expect(result.organization.code).toBe('NEW-ORG');
    });
  });

  describe('updateOrganization', () => {
    it('should prevent cross-tenant modifications', async () => {
      await expect(
        organizationsService.updateOrganization('org-1', { displayName: 'Hacked' }, 'org-2', false)
      ).rejects.toThrow('Cross-tenant modification forbidden');
    });

    it('should prevent modifying ARCHIVED organizations', async () => {
      vi.mocked(organizationsRepository.findById).mockResolvedValue({ id: 'org-1', status: 'ARCHIVED' } as any);

      await expect(
        organizationsService.updateOrganization('org-1', { displayName: 'Update' }, 'org-1', false)
      ).rejects.toThrow('Archived organizations cannot be modified');
    });

    it('should update organization and record audit event', async () => {
      vi.mocked(organizationsRepository.findById).mockResolvedValue({ id: 'org-1', status: 'ACTIVE', displayName: 'Old' } as any);
      vi.mocked(organizationsRepository.update).mockResolvedValue({ id: 'org-1', status: 'ACTIVE', displayName: 'New' } as any);

      const result = await organizationsService.updateOrganization(
        'org-1',
        { displayName: 'New' },
        'org-1',
        false,
        'admin-usr-1'
      );

      expect(organizationsRepository.update).toHaveBeenCalledWith('org-1', { displayName: 'New' });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ORGANIZATION_UPDATED',
            organizationId: 'org-1',
          }),
        })
      );
      expect(result.displayName).toBe('New');
    });
  });

  describe('updateStatus', () => {
    it('should prevent modifying ARCHIVED organization status', async () => {
      vi.mocked(organizationsRepository.findById).mockResolvedValue({ id: 'org-1', status: 'ARCHIVED' } as any);

      await expect(
        organizationsService.updateStatus('org-1', { status: 'ACTIVE' }, 'admin-1')
      ).rejects.toThrow('Organization is permanently archived');
    });

    it('should transition organization status and record audit log', async () => {
      vi.mocked(organizationsRepository.findById).mockResolvedValue({ id: 'org-1', status: 'ACTIVE' } as any);
      vi.mocked(organizationsRepository.updateStatus).mockResolvedValue({ id: 'org-1', status: 'SUSPENDED' } as any);

      const result = await organizationsService.updateStatus(
        'org-1',
        { status: 'SUSPENDED', reason: 'Non-payment' },
        'admin-1'
      );

      expect(organizationsRepository.updateStatus).toHaveBeenCalledWith('org-1', 'SUSPENDED');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ORGANIZATION_STATUS_SUSPENDED',
            organizationId: 'org-1',
          }),
        })
      );
      expect(result.status).toBe('SUSPENDED');
    });
  });

  describe('getActivity', () => {
    it('should return activity history for organization', async () => {
      vi.mocked(organizationsRepository.findById).mockResolvedValue({ id: 'org-1' } as any);
      const mockActivity = [
        { id: 'aud-1', action: 'ORGANIZATION_UPDATED', createdAt: new Date() },
      ];
      vi.mocked(organizationsRepository.getActivity).mockResolvedValue(mockActivity as any);

      const result = await organizationsService.getActivity('org-1', 'org-1', false);

      expect(organizationsRepository.getActivity).toHaveBeenCalledWith('org-1');
      expect(result).toHaveLength(1);
    });

    it('should block cross-tenant activity inspection', async () => {
      await expect(
        organizationsService.getActivity('org-1', 'org-2', false)
      ).rejects.toThrow('Cross-tenant access forbidden');
    });
  });
});

