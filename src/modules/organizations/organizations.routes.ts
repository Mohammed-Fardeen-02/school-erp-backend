import { Router } from 'express';
import { organizationsController } from './organizations.controller';
import { authenticate } from '../../core/middleware/authenticate';
import { authorizeRoles } from '../../core/middleware/authorize';
import { requireTenantContext } from '../../core/middleware/tenant-context';
import { requireTenantOwner } from '../../core/middleware/tenant-admin';
import { validateRequest } from '../../core/middleware/validate-request';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  updateTenantStatusSchema,
  updateModulesSchema,
  organizationQuerySchema,
} from './organizations.validation';

export const organizationsRoutes: Router = Router();

// ==========================================
// PLATFORM OPERATOR MANAGEMENT ROUTES
// ==========================================

organizationsRoutes.get(
  '/',
  authenticate,
  authorizeRoles('SUPER_ADMIN'),
  validateRequest({ query: organizationQuerySchema }),
  organizationsController.list
);

organizationsRoutes.post(
  '/',
  authenticate,
  authorizeRoles('SUPER_ADMIN'),
  validateRequest({ body: createOrganizationSchema }),
  organizationsController.create
);

organizationsRoutes.patch(
  '/:id/status',
  authenticate,
  authorizeRoles('SUPER_ADMIN'),
  validateRequest({ body: updateTenantStatusSchema }),
  organizationsController.updateStatus
);

organizationsRoutes.put(
  '/:id/modules',
  authenticate,
  authorizeRoles('SUPER_ADMIN'),
  validateRequest({ body: updateModulesSchema }),
  organizationsController.updateModules
);

// ==========================================
// TENANT CONTEXT PROFILE ROUTES
// ==========================================

organizationsRoutes.get(
  '/:id',
  authenticate,
  requireTenantContext(),
  organizationsController.getById
);

organizationsRoutes.put(
  '/:id',
  authenticate,
  requireTenantContext(),
  requireTenantOwner,
  validateRequest({ body: updateOrganizationSchema }),
  organizationsController.update
);

organizationsRoutes.get(
  '/:id/modules',
  authenticate,
  requireTenantContext(),
  organizationsController.getModules
);

