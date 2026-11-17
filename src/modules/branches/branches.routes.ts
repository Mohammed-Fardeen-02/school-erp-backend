import { Router } from 'express';
import { branchesController } from './branches.controller';
import { authenticate } from '../../core/middleware/authenticate';
import { requireTenantContext } from '../../core/middleware/tenant-context';
import { requireTenantAdmin } from '../../core/middleware/tenant-admin';
import { validateRequest } from '../../core/middleware/validate-request';
import {
  createBranchSchema,
  updateBranchSchema,
  branchStatusSchema,
  branchQuerySchema,
} from './branches.validation';

export const branchesRoutes: Router = Router();

// Multi-tenant scoped routes
branchesRoutes.use(
  authenticate,
  requireTenantContext({ requireLocation: false })
);

branchesRoutes.get(
  '/',
  validateRequest({ query: branchQuerySchema }),
  branchesController.list
);

branchesRoutes.post(
  '/',
  requireTenantAdmin,
  validateRequest({ body: createBranchSchema }),
  branchesController.create
);

branchesRoutes.get('/:id', branchesController.getById);

branchesRoutes.put(
  '/:id',
  requireTenantAdmin,
  validateRequest({ body: updateBranchSchema }),
  branchesController.update
);

branchesRoutes.patch(
  '/:id/main',
  requireTenantAdmin,
  branchesController.setMainBranch
);

branchesRoutes.patch(
  '/:id/status',
  requireTenantAdmin,
  validateRequest({ body: branchStatusSchema }),
  branchesController.toggleStatus
);

branchesRoutes.delete(
  '/:id',
  requireTenantAdmin,
  branchesController.delete
);
