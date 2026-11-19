import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../core/middleware/authenticate';
import { requireTenantContext } from '../../core/middleware/tenant-context';
import { requirePermission } from '../../core/middleware/permission.middleware';
import { validateRequest } from '../../core/middleware/validate-request';
import {
  inviteUserSchema,
  acceptInvitationSchema,
  updateUserProfileSchema,
  toggleUserStatusSchema,
  userQuerySchema,
} from './users.validation';

export const usersRoutes: Router = Router();

// ==========================================
// PUBLIC ONBOARDING INVITATION ACCEPTANCE
// ==========================================
usersRoutes.post(
  '/invitations/accept',
  validateRequest({ body: acceptInvitationSchema }),
  usersController.acceptInvitation
);

// ==========================================
// AUTHENTICATED MULTI-TENANT USER DIRECTORY ROUTES
// ==========================================
usersRoutes.use(authenticate, requireTenantContext());

// 1. List users in active organization
usersRoutes.get(
  '/',
  validateRequest({ query: userQuerySchema }),
  requirePermission('settings.user_assignments.allocations.view'),
  usersController.list
);

// 2. Invite a new or existing user to organization
usersRoutes.post(
  '/invite',
  validateRequest({ body: inviteUserSchema }),
  requirePermission('settings.user_assignments.allocations.assign'),
  usersController.invite
);

// 3. List invitations for organization
usersRoutes.get(
  '/invitations',
  requirePermission('settings.user_assignments.allocations.view'),
  usersController.listInvitations
);

// 4. Resend pending invitation
usersRoutes.post(
  '/invitations/:id/resend',
  requirePermission('settings.user_assignments.allocations.assign'),
  usersController.resendInvite
);

// 5. Revoke pending invitation
usersRoutes.post(
  '/invitations/:id/revoke',
  requirePermission('settings.user_assignments.allocations.revoke'),
  usersController.revokeInvite
);

// 6. Get single user details
usersRoutes.get(
  '/:id',
  requirePermission('settings.user_assignments.allocations.view'),
  usersController.getById
);

// 7. Update permitted profile fields
usersRoutes.put(
  '/:id',
  validateRequest({ body: updateUserProfileSchema }),
  requirePermission('settings.user_assignments.allocations.assign'),
  usersController.update
);

// 8. Activate / Deactivate user account
usersRoutes.patch(
  '/:id/status',
  validateRequest({ body: toggleUserStatusSchema }),
  requirePermission('settings.user_assignments.allocations.revoke'),
  usersController.toggleStatus
);
