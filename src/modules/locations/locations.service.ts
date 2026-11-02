import { locationsRepository } from './locations.repository';
import {
  CreateLocationDto,
  UpdateLocationDto,
  LocationQueryFilters,
} from './locations.types';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { withTransactionRetry } from '../../shared/utils/transaction-retry';
import { prisma } from '../../core/database/prisma-client';
import { sanitizeAuditPayload } from '../../core/security/audit-sanitizer';

export class LocationsService {
  async getLocations(organizationId: string, filters?: LocationQueryFilters) {
    return locationsRepository.findByOrganization(organizationId, filters);
  }

  async getLocationById(id: string, organizationId: string) {
    const location = await locationsRepository.findById(id, organizationId);
    if (!location) {
      throw AppError.notFound(
        'Location not found in this organization',
        ErrorCode.NOT_FOUND
      );
    }
    return location;
  }

  async createLocation(
    organizationId: string,
    data: CreateLocationDto,
    actorUserId: string
  ) {
    // 1. Verify code uniqueness in organization
    const existing = await locationsRepository.findByCode(organizationId, data.code);
    if (existing) {
      throw AppError.conflict(
        `Location with code '${data.code}' already exists in this organization.`,
        ErrorCode.CONFLICT
      );
    }

    // 2. Create with parent row-lock quota enforcement and retry logic
    const location = await withTransactionRetry(() =>
      locationsRepository.createWithQuotaLock(organizationId, data)
    );

    // 3. Audit logging
    await (prisma as any).auditLog
      .create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'LOCATION_CREATED',
          entity: 'Location',
          entityId: location.id,
          newState: sanitizeAuditPayload({
            code: location.code,
            name: location.name,
            locationType: location.locationType,
            isMainCampus: location.isMainCampus,
          }),
        },
      })
      .catch(() => {});

    return location;
  }

  async updateLocation(
    id: string,
    organizationId: string,
    data: UpdateLocationDto,
    actorUserId: string
  ) {
    const existing = await locationsRepository.findById(id, organizationId);
    if (!existing) {
      throw AppError.notFound(
        'Location not found in this organization',
        ErrorCode.NOT_FOUND
      );
    }

    await locationsRepository.update(id, organizationId, data);
    const updated = await locationsRepository.findById(id, organizationId);

    await (prisma as any).auditLog
      .create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'LOCATION_UPDATED',
          entity: 'Location',
          entityId: id,
          oldState: sanitizeAuditPayload(existing),
          newState: sanitizeAuditPayload(updated),
        },
      })
      .catch(() => {});

    return updated;
  }

  async setMainCampus(
    organizationId: string,
    targetLocationId: string,
    actorUserId: string
  ) {
    const result = await withTransactionRetry(() =>
      locationsRepository.setMainCampus(organizationId, targetLocationId)
    );

    await (prisma as any).auditLog
      .create({
        data: {
          organizationId,
          userId: actorUserId,
          action: 'MAIN_CAMPUS_DESIGNATED',
          entity: 'Location',
          entityId: targetLocationId,
          newState: sanitizeAuditPayload({
            id: result.id,
            code: result.code,
            name: result.name,
            isMainCampus: true,
          }),
        },
      })
      .catch(() => {});

    return result;
  }

  async toggleStatus(
    id: string,
    organizationId: string,
    isActive: boolean,
    actorUserId: string
  ) {
    const result = await withTransactionRetry(() =>
      locationsRepository.toggleStatus(id, organizationId, isActive)
    );

    await (prisma as any).auditLog
      .create({
        data: {
          organizationId,
          userId: actorUserId,
          action: isActive ? 'LOCATION_ACTIVATED' : 'LOCATION_DEACTIVATED',
          entity: 'Location',
          entityId: id,
          newState: sanitizeAuditPayload({
            id: result.id,
            isActive: result.isActive,
          }),
        },
      })
      .catch(() => {});

    return result;
  }
}

export const locationsService = new LocationsService();

