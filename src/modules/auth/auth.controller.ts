import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { ResponseHelper } from '../../core/http/response';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import { usersRepository } from '../users/users.repository';

export class AuthController {
  /**
   * User sign-in with brute-force lockout and session creation
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const deviceInfo = (req.headers['x-device-info'] as string) || userAgent;
      const explicitOrgId = (req.headers['x-organization-id'] as string) || req.body?.organizationId;

      const result = await authService.login({
        email,
        password,
        ipAddress: clientIp,
        userAgent,
        deviceInfo,
        organizationId: explicitOrgId,
      });

      // Optionally set HTTP-only cookie for refresh token
      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      ResponseHelper.ok(res, result, 'Sign in successful');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Rotates refresh token with strict token-family replay detection
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.body?.refreshToken || req.cookies?.refreshToken;

      if (!rawRefreshToken) {
        throw new AppError('Refresh token is required', 400, ErrorCode.BAD_REQUEST);
      }

      const clientIp = req.ip || req.socket.remoteAddress;
      const tokens = await authService.refreshAccessToken(rawRefreshToken, clientIp);

      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      ResponseHelper.ok(res, tokens, 'Token refreshed successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logs out current device session
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.sessionId && req.user?.id) {
        await authService.logout(req.user.sessionId, req.user.id, req.organizationId || (req.headers['x-organization-id'] as string));
      }

      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      ResponseHelper.ok(res, null, 'Signed out successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Returns current authenticated user profile
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Not authenticated', 401, ErrorCode.UNAUTHENTICATED);
      }

      const user = await usersRepository.findById(req.user.id);
      if (!user) {
        throw new AppError('User record not found', 404, ErrorCode.NOT_FOUND);
      }

      const userDto = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        avatarUrl: user.avatarUrl,
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt,
      };

      ResponseHelper.ok(res, userDto, 'Profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lists active device sessions.
   * If organization context is attached, returns organization-wide active sessions;
   * otherwise returns the caller's active sessions.
   */
  async getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Not authenticated', 401, ErrorCode.UNAUTHENTICATED);
      }

      const orgId = req.organizationId || (req.headers['x-organization-id'] as string);

      if (orgId && (req.user.userType === 'PLATFORM' || orgId !== 'platform-control')) {
        const sessions = await authService.getOrganizationSessions({
          organizationId: orgId,
          currentSessionId: req.user.sessionId,
          search: req.query.search as string,
          userId: req.query.userId as string,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
          offset: req.query.offset ? Number(req.query.offset) : undefined,
        });
        ResponseHelper.ok(res, sessions, 'Active sessions retrieved successfully');
        return;
      }

      const sessions = await authService.getUserSessions(req.user.id, req.user.sessionId);
      ResponseHelper.ok(res, sessions, 'Active sessions retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Explicit organization session discovery endpoint for tenant administrators.
   */
  async getOrganizationSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Not authenticated', 401, ErrorCode.UNAUTHENTICATED);
      }

      const orgId = req.organizationId || (req.headers['x-organization-id'] as string);
      if (!orgId) {
        throw new AppError('Organization context required', 400, ErrorCode.TENANT_CONTEXT_MISSING);
      }

      const sessions = await authService.getOrganizationSessions({
        organizationId: orgId,
        currentSessionId: req.user.sessionId,
        search: req.query.search as string,
        userId: req.query.userId as string,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });

      ResponseHelper.ok(res, sessions, 'Active organization sessions retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revokes a specific device session (self-revocation or administrative revocation).
   */
  async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Not authenticated', 401, ErrorCode.UNAUTHENTICATED);
      }

      const { sessionId } = req.params;
      if (!sessionId) {
        throw new AppError('Session ID is required', 400, ErrorCode.BAD_REQUEST);
      }

      const orgId = req.organizationId || (req.headers['x-organization-id'] as string);

      if (orgId) {
        await authService.adminRevokeSession({
          sessionId,
          organizationId: orgId,
          actorUserId: req.user.id,
          isPlatformOperator: req.user.userType === 'PLATFORM',
        });
      } else {
        await authService.revokeSession(sessionId, req.user.id);
      }

      ResponseHelper.ok(res, null, 'Session revoked successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin-initiated revocation of all sessions for a specific user.
   */
  async adminRevokeUserSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Not authenticated', 401, ErrorCode.UNAUTHENTICATED);
      }

      const { userId } = req.params;
      if (!userId) {
        throw new AppError('User ID is required', 400, ErrorCode.BAD_REQUEST);
      }

      const orgId = req.organizationId || (req.headers['x-organization-id'] as string);
      if (!orgId) {
        throw new AppError('Organization context required', 400, ErrorCode.TENANT_CONTEXT_MISSING);
      }

      const result = await authService.adminRevokeUserSessions({
        targetUserId: userId,
        organizationId: orgId,
        actorUserId: req.user.id,
        isPlatformOperator: req.user.userType === 'PLATFORM',
      });

      ResponseHelper.ok(res, result, 'User sessions revoked successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves security policies for the active organization.
   */
  async getSecurityPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.organizationId || (req.headers['x-organization-id'] as string) || 'default';
      const policies = await authService.getSecurityPolicies(orgId);
      ResponseHelper.ok(res, policies, 'Security policies retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Updates security policies for the active organization.
   */
  async updateSecurityPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Not authenticated', 401, ErrorCode.UNAUTHENTICATED);
      }

      const orgId = req.organizationId || (req.headers['x-organization-id'] as string) || 'default';
      const updated = await authService.updateSecurityPolicies(orgId, req.body, req.user.id);
      ResponseHelper.ok(res, updated, 'Security policies updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves forensic authentication activity for the organization.
   */
  async getAuthenticationActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.organizationId || (req.headers['x-organization-id'] as string) || 'default';
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const search = req.query.search as string;
      const action = req.query.action as string;

      const activity = await authService.getAuthenticationActivity({
        organizationId: orgId,
        search,
        action,
        page,
        limit,
      });

      ResponseHelper.ok(res, activity, 'Authentication activity retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revokes all other active sessions except the current one
   */
  async revokeOtherSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Not authenticated', 401, ErrorCode.UNAUTHENTICATED);
      }

      const count = await authService.revokeOtherSessions(req.user.id, req.user.sessionId);
      ResponseHelper.ok(res, { revokedCount: count }, 'Other sessions revoked successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Requests single-use password reset token (generic response)
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress;
      const message = await authService.forgotPassword(email, clientIp);
      ResponseHelper.ok(res, null, message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Consumes reset token and resets password atomically
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress;
      await authService.resetPassword(token, newPassword, clientIp);
      ResponseHelper.ok(res, null, 'Password has been reset successfully. Please sign in with your new password.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticated password change
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Not authenticated', 401, ErrorCode.UNAUTHENTICATED);
      }

      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(
        req.user.id,
        currentPassword,
        newPassword,
        req.user.sessionId,
        req.organizationId || (req.headers['x-organization-id'] as string)
      );

      ResponseHelper.ok(res, null, 'Password updated successfully. Other device sessions have been terminated.');
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();

