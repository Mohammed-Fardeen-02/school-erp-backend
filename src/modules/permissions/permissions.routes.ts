import { Router } from 'express';
import { permissionsController } from './permissions.controller';
import { authenticate } from '../../core/middleware/authenticate';
import { requireTenantContext } from '../../core/middleware/tenant-context';
import { requirePermission } from '../../core/middleware/permission.middleware';

export const permissionsRoutes: Router = Router();

// Operating within authenticated tenant context
permissionsRoutes.use(authenticate, requireTenantContext());

// 1. Hierarchical Canonical Tree Catalog
permissionsRoutes.get(
  '/tree',
  requirePermission('settings.roles_permissions.rbac.view'),
  permissionsController.getTree
);

// 2. Caller Effective Permissions
permissionsRoutes.get('/me', permissionsController.getMe);

