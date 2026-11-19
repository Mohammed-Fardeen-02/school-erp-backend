import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../core/middleware/authenticate';
import { requireTenantContext } from '../../core/middleware/tenant-context';
import { requirePermission } from '../../core/middleware/permission.middleware';
import { validateRequest } from '../../core/middleware/validate-request';
import {
  loginRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
  refreshRateLimiter,
} from '../../core/middleware/rate-limiter';
import {
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateSecurityPolicySchema,
  authActivityQuerySchema,
  sessionQuerySchema,
} from './auth.validation';

export const authRoutes: Router = Router();

// ==========================================
// PUBLIC AUTHENTICATION ENDPOINTS
// ==========================================

authRoutes.post(
  '/login',
  loginRateLimiter,
  validateRequest({ body: loginSchema }),
  authController.login
);

authRoutes.post(
  '/refresh',
  refreshRateLimiter,
  validateRequest({ body: refreshTokenSchema }),
  authController.refresh
);

authRoutes.post(
  '/forgot-password',
  forgotPasswordRateLimiter,
  validateRequest({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

authRoutes.post(
  '/reset-password',
  resetPasswordRateLimiter,
  validateRequest({ body: resetPasswordSchema }),
  authController.resetPassword
);

// ==========================================
// AUTHENTICATED USER SESSIONS & PROFILE
// ==========================================

authRoutes.post('/logout', authenticate, authController.logout);

authRoutes.get('/me', authenticate, authController.getMe);

authRoutes.get('/sessions', authenticate, authController.getSessions);

authRoutes.delete('/sessions/:sessionId', authenticate, authController.revokeSession);

authRoutes.delete('/sessions', authenticate, authController.revokeOtherSessions);

authRoutes.post('/sessions/revoke-others', authenticate, authController.revokeOtherSessions);

authRoutes.post(
  '/change-password',
  authenticate,
  validateRequest({ body: changePasswordSchema }),
  authController.changePassword
);

// ==========================================
// STAGE 4: TENANT SECURITY & DEVICE MANAGEMENT
// ==========================================

// Organization Active Sessions Discovery
authRoutes.get(
  '/organization-sessions',
  authenticate,
  requireTenantContext(),
  requirePermission('settings.organization_profile.identity.view'),
  validateRequest({ query: sessionQuerySchema }),
  authController.getOrganizationSessions
);

// Admin Revocation of an Individual Member Session
authRoutes.delete(
  '/organization-sessions/:sessionId',
  authenticate,
  requireTenantContext(),
  requirePermission('settings.user_assignments.allocations.revoke'),
  authController.revokeSession
);

// Admin Revocation of ALL Active Sessions for a Member (Bumping tokenVersion)
authRoutes.delete(
  '/organization-users/:userId/sessions',
  authenticate,
  requireTenantContext(),
  requirePermission('settings.user_assignments.allocations.revoke'),
  authController.adminRevokeUserSessions
);

// Security Policies (Password Complexity, Lockout, Timeout, MFA)
authRoutes.get(
  '/policies',
  authenticate,
  requireTenantContext(),
  requirePermission('settings.organization_profile.identity.view'),
  authController.getSecurityPolicies
);

authRoutes.put(
  '/policies',
  authenticate,
  requireTenantContext(),
  requirePermission('settings.organization_profile.identity.edit'),
  validateRequest({ body: updateSecurityPolicySchema }),
  authController.updateSecurityPolicies
);

// Authentication & Security Forensics Activity Log
authRoutes.get(
  '/activity',
  authenticate,
  requireTenantContext(),
  requirePermission('settings.audit_logs.trail.view'),
  validateRequest({ query: authActivityQuerySchema }),
  authController.getAuthenticationActivity
);

export default authRoutes;

