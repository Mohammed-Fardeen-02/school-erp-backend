import { Router } from 'express';
import { userRolesController } from './user-roles.controller';
import { authenticate } from '../../core/middleware/authenticate';
import { requireTenantContext } from '../../core/middleware/tenant-context';
import { requirePermission } from '../../core/middleware/permission.middleware';
import { validateRequest } from '../../core/middleware/validate-request';
import {
  assignRoleSchema,
  revokeRoleSchema,
  assignmentParamsSchema,
  userParamsSchema,
  userRoleQuerySchema,
} from './user-roles.validation';

export const userRolesRoutes: Router = Router();

// All user-role assignment endpoints operate within authenticated tenant context
userRolesRoutes.use(authenticate, requireTenantContext());

// 1. Assign role to user (Org-Wide or Campus-Scoped)
userRolesRoutes.post(
  '/assign',
  validateRequest({ body: assignRoleSchema }),
  requirePermission('settings.user_assignments.allocations.assign'),
  userRolesController.assign
);

// 2. Revoke an active role assignment
userRolesRoutes.post(
  '/:assignmentId/revoke',
  validateRequest({
    params: assignmentParamsSchema,
    body: revokeRoleSchema,
  }),
  requirePermission('settings.user_assignments.allocations.revoke'),
  userRolesController.revoke
);

// 3. List active and historical assignments for a user
userRolesRoutes.get(
  '/users/:userId',
  validateRequest({
    params: userParamsSchema,
    query: userRoleQuerySchema,
  }),
  requirePermission('settings.user_assignments.allocations.view'),
  userRolesController.listByUser
);

