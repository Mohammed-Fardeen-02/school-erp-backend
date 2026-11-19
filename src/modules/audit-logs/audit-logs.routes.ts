import { Router } from 'express';
import { auditLogsController } from './audit-logs.controller';
import { authenticate } from '../../core/middleware/authenticate';
import { requireTenantContext } from '../../core/middleware/tenant-context';
import { requirePermission } from '../../core/middleware/permission.middleware';
import { validateRequest } from '../../core/middleware/validate-request';
import {
  auditLogQuerySchema,
  auditLogExportQuerySchema,
  auditLogParamsSchema,
} from './audit-logs.validation';

export const auditLogsRoutes: Router = Router();

// ==========================================
// AUDIT & COMPLIANCE LOG ROUTES
// ==========================================

// 1. Export Audit Records (Registered before /:id parameter)
auditLogsRoutes.get(
  '/export',
  authenticate,
  requireTenantContext(),
  requirePermission('settings.audit_logs.trail.export'),
  validateRequest({ query: auditLogExportQuerySchema }),
  auditLogsController.exportLogs
);

// 2. Query Paginated Audit Records
auditLogsRoutes.get(
  '/',
  authenticate,
  requireTenantContext(),
  requirePermission('settings.audit_logs.trail.view'),
  validateRequest({ query: auditLogQuerySchema }),
  auditLogsController.getLogs
);

// 3. Inspect Single Audit Record Detail
auditLogsRoutes.get(
  '/:id',
  authenticate,
  requireTenantContext(),
  requirePermission('settings.audit_logs.trail.view'),
  validateRequest({ params: auditLogParamsSchema }),
  auditLogsController.getLogById
);

export default auditLogsRoutes;
