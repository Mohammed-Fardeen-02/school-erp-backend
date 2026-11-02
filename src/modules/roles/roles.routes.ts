import { Router } from 'express';
import { rolesController } from './roles.controller';
import { authenticate } from '../../core/middleware/authenticate';
import { requireTenantContext } from '../../core/middleware/tenant-context';
import { requirePermission } from '../../core/middleware/permission.middleware';
import { validateRequest } from '../../core/middleware/validate-request';
import {
  createRoleSchema,
  updateRoleSchema,
  roleStatusSchema,
  cloneTemplateSchema,
  updateRolePermissionsSchema,
  roleQuerySchema,
} from './roles.validation';

export const rolesRoutes: Router = Router();

// All roles endpoints operate within authenticated tenant context
rolesRoutes.use(authenticate, requireTenantContext());

// 1. List accessible roles (Templates + Tenant Custom)
rolesRoutes.get(
  '/',
  validateRequest({ query: roleQuerySchema }),
  requirePermission('settings.roles_permissions.rbac.view'),
  rolesController.list
);

// 2. Create custom role
rolesRoutes.post(
  '/',
  validateRequest({ body: createRoleSchema }),
  requirePermission('settings.roles_permissions.rbac.create'),
  rolesController.create
);

// 3. Clone system template into custom role
rolesRoutes.post(
  '/templates/:templateId/clone',
  validateRequest({ body: cloneTemplateSchema }),
  requirePermission('settings.roles_permissions.rbac.create'),
  rolesController.clone
);

// 4. Get role details
rolesRoutes.get(
  '/:roleId',
  requirePermission('settings.roles_permissions.rbac.view'),
  rolesController.getById
);

// 5. Update role metadata
rolesRoutes.patch(
  '/:roleId',
  validateRequest({ body: updateRoleSchema }),
  requirePermission('settings.roles_permissions.rbac.edit'),
  rolesController.update
);

// 6. Toggle role active status
rolesRoutes.patch(
  '/:roleId/status',
  validateRequest({ body: roleStatusSchema }),
  requirePermission('settings.roles_permissions.rbac.edit'),
  rolesController.toggleStatus
);

// 7. Delete or archive custom role
rolesRoutes.delete(
  '/:roleId',
  requirePermission('settings.roles_permissions.rbac.delete'),
  rolesController.deleteOrArchive
);

// 8. Get role permission capability matrix
rolesRoutes.get(
  '/:roleId/permissions',
  requirePermission('settings.roles_permissions.rbac.view'),
  rolesController.getPermissionsMatrix
);

// 9. Update role permission capability matrix
rolesRoutes.put(
  '/:roleId/permissions',
  validateRequest({ body: updateRolePermissionsSchema }),
  requirePermission('settings.roles_permissions.rbac.edit'),
  rolesController.updatePermissionsMatrix
);

