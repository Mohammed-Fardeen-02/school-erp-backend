import { Router } from 'express';
import { settingsController } from './settings.controller';
import { authenticate } from '../../core/middleware/authenticate';
import { validateRequest } from '../../core/middleware/validate-request';
import {
  updateTenantConfigSchema,
  sendTestEmailSchema,
  testStorageSchema,
  testRazorpaySchema,
} from './settings.validation';

export const settingsRoutes: Router = Router();

// ==========================================
// TENANT CONFIGURATION & INTEGRATIONS ROUTES
// ==========================================

// 1. Retrieve tenant configuration
settingsRoutes.get(
  '/tenant-config',
  authenticate,
  settingsController.getConfiguration.bind(settingsController)
);

settingsRoutes.get(
  '/tenant-config/:organizationId',
  authenticate,
  settingsController.getConfiguration.bind(settingsController)
);

// 2. Update tenant configuration
settingsRoutes.put(
  '/tenant-config',
  authenticate,
  validateRequest({ body: updateTenantConfigSchema }),
  settingsController.updateConfiguration.bind(settingsController)
);

settingsRoutes.put(
  '/tenant-config/:organizationId',
  authenticate,
  validateRequest({ body: updateTenantConfigSchema }),
  settingsController.updateConfiguration.bind(settingsController)
);

// 3. Integration Diagnostic Runners
settingsRoutes.post(
  '/test-email',
  authenticate,
  validateRequest({ body: sendTestEmailSchema }),
  settingsController.sendTestEmail.bind(settingsController)
);

settingsRoutes.post(
  '/test-storage',
  authenticate,
  validateRequest({ body: testStorageSchema }),
  settingsController.testStorage.bind(settingsController)
);

settingsRoutes.post(
  '/test-razorpay',
  authenticate,
  validateRequest({ body: testRazorpaySchema }),
  settingsController.testRazorpay.bind(settingsController)
);
