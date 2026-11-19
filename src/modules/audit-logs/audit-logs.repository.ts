import { prisma } from '../../core/database/prisma-client';
import { AuditLogQueryFilters, AuditLogExportFilters } from './audit-logs.types';

export class AuditLogsRepository {
  private buildWhereClause(
    organizationId: string,
    filters: AuditLogQueryFilters | AuditLogExportFilters,
    callerLocationId?: string
  ): any {
    const where: any = {};

    // 1. Strict Tenant Scoping
    if (organizationId !== 'platform-control') {
      where.organizationId = organizationId;
    }

    // 2. Campus / Location Scoping
    if (callerLocationId) {
      where.OR = [
        { locationId: callerLocationId },
        { locationId: null },
      ];
    } else if (filters.locationId) {
      where.locationId = filters.locationId;
    }

    // 3. Exact Field Filters
    if (filters.action && filters.action !== 'ALL') {
      where.action = filters.action;
    }

    if (filters.entity && filters.entity !== 'ALL') {
      where.entity = filters.entity;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    // 4. Date Range Filters
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        // If date-only (YYYY-MM-DD), include the entire day
        const end = new Date(filters.endDate);
        if (filters.endDate.length === 10) {
          end.setUTCHours(23, 59, 59, 999);
        }
        where.createdAt.lte = end;
      }
    }

    // 5. Global Search Across Context & Actor
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim();
      const searchConditions = [
        { action: { contains: q, mode: 'insensitive' } },
        { entity: { contains: q, mode: 'insensitive' } },
        { entityId: { contains: q, mode: 'insensitive' } },
        { ipAddress: { contains: q, mode: 'insensitive' } },
        { userAgent: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { firstName: { contains: q, mode: 'insensitive' } } },
        { user: { lastName: { contains: q, mode: 'insensitive' } } },
      ];

      if (where.OR) {
        where.AND = [{ OR: searchConditions }];
      } else {
        where.OR = searchConditions;
      }
    }

    return where;
  }

  async findManyAndCount(
    organizationId: string,
    filters: AuditLogQueryFilters,
    callerLocationId?: string
  ) {
    const where = this.buildWhereClause(organizationId, filters, callerLocationId);
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const [total, rawLogs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          location: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        skip,
      }),
    ]);

    return { total, rawLogs, page, limit };
  }

  async findById(
    id: string,
    organizationId: string,
    callerLocationId?: string
  ) {
    const where: any = { id };
    if (organizationId !== 'platform-control') {
      where.organizationId = organizationId;
    }
    if (callerLocationId) {
      where.OR = [
        { locationId: callerLocationId },
        { locationId: null },
      ];
    }

    return prisma.auditLog.findFirst({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        location: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  }

  async findExportBatch(
    organizationId: string,
    filters: AuditLogExportFilters,
    skip: number,
    take: number,
    callerLocationId?: string
  ) {
    const where = this.buildWhereClause(organizationId, filters, callerLocationId);

    return prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        location: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      skip,
    });
  }

  async countExportRecords(
    organizationId: string,
    filters: AuditLogExportFilters,
    callerLocationId?: string
  ): Promise<number> {
    const where = this.buildWhereClause(organizationId, filters, callerLocationId);
    return prisma.auditLog.count({ where });
  }
}

export const auditLogsRepository = new AuditLogsRepository();
