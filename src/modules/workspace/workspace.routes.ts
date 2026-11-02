import { Router } from 'express';
import { workspaceController } from './workspace.controller';
import { authenticate } from '../../core/middleware/authenticate';
import { requireTenantContext } from '../../core/middleware/tenant-context';
import { validateRequest } from '../../core/middleware/validate-request';
import {
  selectWorkspaceContextSchema,
  setPrimaryOrganizationSchema,
} from './workspace.validation';

export const workspaceRoutes: Router = Router();

// Retrieve all organizations the authenticated user has active access to
workspaceRoutes.get('/my-organizations', authenticate, workspaceController.myOrganizations);

// Select or switch workspace context (returns tenant profile, campuses, and enabled modules)
workspaceRoutes.post(
  '/select-context',
  authenticate,
  validateRequest({ body: selectWorkspaceContextSchema }),
  workspaceController.selectContext
);

// Get the current verified tenant & location workspace profile
workspaceRoutes.get(
  '/current',
  authenticate,
  requireTenantContext({ requireActiveTenant: true, requireActiveLocation: false }),
  workspaceController.getCurrent
);

// Explicitly set the user's primary organization preference
workspaceRoutes.put(
  '/primary-organization',
  authenticate,
  validateRequest({ body: setPrimaryOrganizationSchema }),
  workspaceController.setPrimaryOrganization
);

