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

      const result = await authService.login({
        email,
        password,
        ipAddress: clientIp,
        userAgent,
        deviceInfo,
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
        await authService.logout(req.user.sessionId, req.user.id);
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
   * Lists active device sessions for current user
   */
  async getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Not authenticated', 401, ErrorCode.UNAUTHENTICATED);
      }

      const sessions = await authService.getUserSessions(req.user.id, req.user.sessionId);
      ResponseHelper.ok(res, sessions, 'Active sessions retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revokes a specific device session
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

      await authService.revokeSession(sessionId, req.user.id);
      ResponseHelper.ok(res, null, 'Session revoked successfully');
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
        req.user.sessionId
      );

      ResponseHelper.ok(res, null, 'Password updated successfully. Other device sessions have been terminated.');
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();

