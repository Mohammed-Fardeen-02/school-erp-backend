import { Router } from 'express';
import { locationsController } from './locations.controller';
import { authenticate } from '../../core/middleware/authenticate';
import { requireTenantContext } from '../../core/middleware/tenant-context';
import { requireTenantAdmin } from '../../core/middleware/tenant-admin';
import { validateRequest } from '../../core/middleware/validate-request';
import {
  createLocationSchema,
  updateLocationSchema,
  locationStatusSchema,
} from './locations.validation';

export const locationsRoutes: Router = Router();

// All location endpoints execute within the verified tenant context
locationsRoutes.use(
  authenticate,
  requireTenantContext({ requireActiveTenant: true, requireActiveLocation: false })
);

locationsRoutes.get('/', locationsController.list);

locationsRoutes.post(
  '/',
  requireTenantAdmin,
  validateRequest({ body: createLocationSchema }),
  locationsController.create
);

locationsRoutes.get('/:id', locationsController.getById);

locationsRoutes.put(
  '/:id',
  requireTenantAdmin,
  validateRequest({ body: updateLocationSchema }),
  locationsController.update
);

locationsRoutes.patch(
  '/:id/main-campus',
  requireTenantAdmin,
  locationsController.setMainCampus
);

locationsRoutes.patch(
  '/:id/status',
  requireTenantAdmin,
  validateRequest({ body: locationStatusSchema }),
  locationsController.toggleStatus
);

