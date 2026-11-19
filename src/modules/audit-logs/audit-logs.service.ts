import { Response } from 'express';
import { auditLogsRepository } from './audit-logs.repository';
import {
  AuditLogRecord,
  AuditLogQueryFilters,
  AuditLogExportFilters,
} from './audit-logs.types';
import { sanitizeAuditPayload } from '../../core/security/audit-sanitizer';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { prisma } from '../../core/database/prisma-client';
import { logger } from '../../core/logger/app-logger';

export class AuditLogsService {
  /**
   * Transforms database audit record into sanitized client-facing DTO.
   */
  private mapToRecord(log: any): AuditLogRecord {
    const actorName = log.user
      ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || 'System'
      : 'System';
    const actorEmail = log.user?.email || 'security@erp.internal';
    const campusName = log.location ? `${log.location.name} (${log.location.code})` : null;

    return {
      id: log.id,
      organizationId: log.organizationId,
      locationId: log.locationId,
      campusName,
      userId: log.userId,
      actorName,
      actorEmail,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      previousState: sanitizeAuditPayload(log.previousState as Record<string, unknown> | null),
      newState: sanitizeAuditPayload(log.newState as Record<string, unknown> | null),
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt.toISOString(),
    };
  }

  /**
   * Escapes a value for CSV output, defending against CSV Formula Injection.
   * If a value begins with '=', '+', '-', '@', tab, or carriage return,
   * prefix it with a single quote to prevent formula execution in spreadsheet software.
   */
  private escapeCsv(val: unknown): string {
    if (val === null || val === undefined) {
      return '""';
    }

    let str = typeof val === 'object' ? JSON.stringify(val) : String(val);

    // Defend against CSV Formula Injection
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }

    // Escape double quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }

  async getLogs(
    organizationId: string,
    filters: AuditLogQueryFilters,
    callerLocationId?: string
  ): Promise<{
    logs: AuditLogRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { total, rawLogs, page, limit } = await auditLogsRepository.findManyAndCount(
      organizationId,
      filters,
      callerLocationId
    );

    const logs = rawLogs.map((log) => this.mapToRecord(log));
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      logs,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getLogById(
    id: string,
    organizationId: string,
    callerLocationId?: string
  ): Promise<AuditLogRecord> {
    const log = await auditLogsRepository.findById(id, organizationId, callerLocationId);
    if (!log) {
      throw AppError.notFound('Audit log record not found', ErrorCode.NOT_FOUND);
    }

    return this.mapToRecord(log);
  }

  /**
   * Streams filtered audit records to CSV output with bounded memory usage and injection defense.
   */
  async exportLogs(
    organizationId: string,
    filters: AuditLogExportFilters,
    res: Response,
    actorUserId?: string,
    callerLocationId?: string
  ): Promise<void> {
    const MAX_EXPORT_LIMIT = 5000;
    const BATCH_SIZE = 500;

    const totalMatching = await auditLogsRepository.countExportRecords(
      organizationId,
      filters,
      callerLocationId
    );

    const recordsToExport = Math.min(totalMatching, MAX_EXPORT_LIMIT);

    const filename = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Total-Count', String(recordsToExport));

    // UTF-8 BOM for Microsoft Excel compatibility
    res.write('\uFEFF');

    // Header row
    const headers = [
      'ID',
      'Timestamp (UTC)',
      'Action',
      'Entity',
      'Entity ID',
      'Actor Name',
      'Actor Email',
      'Campus',
      'IP Address',
      'User Agent',
      'Previous State Diff',
      'New State Diff',
    ];
    res.write(headers.map((h) => this.escapeCsv(h)).join(',') + '\r\n');

    let processed = 0;
    while (processed < recordsToExport) {
      const currentBatchSize = Math.min(BATCH_SIZE, recordsToExport - processed);
      const batch = await auditLogsRepository.findExportBatch(
        organizationId,
        filters,
        processed,
        currentBatchSize,
        callerLocationId
      );

      if (batch.length === 0) break;

      for (const log of batch) {
        const record = this.mapToRecord(log);
        const row = [
          record.id,
          record.createdAt,
          record.action,
          record.entity,
          record.entityId || '',
          record.actorName,
          record.actorEmail,
          record.campusName || 'Institution-wide',
          record.ipAddress || '',
          record.userAgent || '',
          record.previousState ? JSON.stringify(record.previousState) : '',
          record.newState ? JSON.stringify(record.newState) : '',
        ];

        res.write(row.map((cell) => this.escapeCsv(cell)).join(',') + '\r\n');
      }

      processed += batch.length;
    }

    res.end();

    // Audit the export action itself (non-blocking)
    if (actorUserId) {
      await (prisma as any).auditLog
        .create({
          data: {
            organizationId: organizationId === 'platform-control' ? null : organizationId,
            locationId: callerLocationId || null,
            userId: actorUserId,
            action: 'AUDIT_LOGS_EXPORTED',
            entity: 'AuditLog',
            entityId: null,
            newState: sanitizeAuditPayload({
              recordCount: processed,
              format: filters.format || 'csv',
              filters: {
                action: filters.action,
                entity: filters.entity,
                search: filters.search,
                startDate: filters.startDate,
                endDate: filters.endDate,
              },
            }),
          },
        })
        .catch((err: any) => {
          logger.error({ err, organizationId }, 'Failed to record audit log for export operation');
        });
    }
  }
}

export const auditLogsService = new AuditLogsService();
