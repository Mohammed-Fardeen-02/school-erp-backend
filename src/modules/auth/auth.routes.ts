import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../core/middleware/authenticate';
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
// AUTHENTICATED ENDPOINTS
// ==========================================

authRoutes.post('/logout', authenticate, authController.logout);

authRoutes.get('/me', authenticate, authController.getMe);

authRoutes.get('/sessions', authenticate, authController.getSessions);

authRoutes.delete('/sessions/:sessionId', authenticate, authController.revokeSession);

authRoutes.delete('/sessions', authenticate, authController.revokeOtherSessions);

authRoutes.post(
  '/change-password',
  authenticate,
  validateRequest({ body: changePasswordSchema }),
  authController.changePassword
);

export default authRoutes;

