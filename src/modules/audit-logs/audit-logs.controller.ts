import { Request, Response, NextFunction } from 'express';
import { auditLogsService } from './audit-logs.service';
import { ResponseHelper } from '../../core/http/response';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';

export class AuditLogsController {
  async getLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isPlatformUser = req.user?.userType === 'PLATFORM';
      const organizationId = req.organizationId || (isPlatformUser ? 'platform-control' : null);

      if (!organizationId) {
        throw new AppError(
          'Organization context is required to query audit logs',
          400,
          ErrorCode.TENANT_CONTEXT_MISSING
        );
      }

      const callerLocationId = req.locationId;
      const result = await auditLogsService.getLogs(organizationId, req.query, callerLocationId);

      res.status(200).json({
        success: true,
        data: result.logs,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
        message: 'Audit logs retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getLogById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isPlatformUser = req.user?.userType === 'PLATFORM';
      const organizationId = req.organizationId || (isPlatformUser ? 'platform-control' : null);

      if (!organizationId) {
        throw new AppError(
          'Organization context is required to inspect audit logs',
          400,
          ErrorCode.TENANT_CONTEXT_MISSING
        );
      }

      const id = req.params.id as string;
      const callerLocationId = req.locationId;

      const record = await auditLogsService.getLogById(id, organizationId, callerLocationId);
      ResponseHelper.ok(res, record, 'Audit log record retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async exportLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const isPlatformUser = req.user?.userType === 'PLATFORM';
      const organizationId = req.organizationId || (isPlatformUser ? 'platform-control' : null);

      if (!organizationId) {
        throw new AppError(
          'Organization context is required to export audit logs',
          400,
          ErrorCode.TENANT_CONTEXT_MISSING
        );
      }

      const callerLocationId = req.locationId;
      await auditLogsService.exportLogs(
        organizationId,
        req.query,
        res,
        req.user?.id,
        callerLocationId
      );
    } catch (error) {
      next(error);
    }
  }
}

export const auditLogsController = new AuditLogsController();
