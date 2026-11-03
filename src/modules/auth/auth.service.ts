import jsonwebtoken from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateSecureRandomToken,
} from '../../core/security/password';
import { usersRepository } from '../users/users.repository';
import { sessionsRepository } from './sessions.repository';
import { prisma } from '../../core/database/prisma-client';
import {
  AuthTokens,
  AuthUserDto,
  JwtAccessPayload,
  LoginResponse,
  SessionDto,
} from './auth.types';
import { eventBus } from '../../events/event-bus';
import { DomainEvent } from '../../events/event-types';

export class AuthService {
  /**
   * Authenticates user via email and password, enforcing atomic brute-force lockout,
   * creating a device session, and issuing access + refresh token family.
   */
  async login(params: {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: string;
  }): Promise<LoginResponse> {
    const user = await usersRepository.findByEmail(params.email);

    if (!user) {
      // Execute dummy password verification to mitigate timing attacks
      await verifyPassword(
        '$argon2id$v=19$m=65536,t=3,p=4$dummyhashdummyhashdummyhash$dummyhashdummyhashdummyhashdummyhashdummyhash',
        params.password
      );
      throw new AppError('Invalid email or password', 401, ErrorCode.UNAUTHENTICATED);
    }

    // 1. Account Lockout Check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / (60 * 1000));
      throw new AppError(
        `Account is temporarily locked due to repeated failed attempts. Please try again in ${remainingMinutes} minute(s).`,
        403,
        ErrorCode.ACCOUNT_LOCKED
      );
    }

    // 2. Active Account Check
    if (!user.isActive) {
      throw new AppError(
        'Account has been deactivated. Please contact your system administrator.',
        403,
        ErrorCode.UNAUTHENTICATED
      );
    }

    // 3. Password Verification
    const isPasswordValid = await verifyPassword(user.passwordHash, params.password);

    if (!isPasswordValid) {
      const lockoutResult = await usersRepository.atomicIncrementFailedLogins(user.id);

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          entity: 'User',
          entityId: user.id,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          newState: {
            failedLogins: lockoutResult.failedLogins,
            isLocked: lockoutResult.isLocked,
          },
        },
      });

      if (lockoutResult.isLocked) {
        throw new AppError(
          'Account is temporarily locked due to 5 consecutive failed login attempts. Please try again in 15 minutes.',
          403,
          ErrorCode.ACCOUNT_LOCKED
        );
      }

      throw new AppError('Invalid email or password', 401, ErrorCode.UNAUTHENTICATED);
    }

    // 4. Successful Authentication: Reset lockout counters
    await usersRepository.atomicResetFailedLogins(user.id, params.ipAddress);

    // 5. Generate Refresh Token and Session Family
    const rawRefreshToken = generateSecureRandomToken(32);
    const initialTokenHash = hashToken(rawRefreshToken);
    const familyId = crypto.randomUUID();
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const { session } = await sessionsRepository.createSession({
      userId: user.id,
      familyId,
      deviceInfo: params.deviceInfo,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      initialTokenHash,
      expiresAt: refreshExpiresAt,
    });

    // 6. Generate Short-Lived Access Token (carrying tokenVersion)
    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      userType: user.userType,
      tokenVersion: user.tokenVersion,
      sessionId: session.id,
    };

    const accessToken = jsonwebtoken.sign(accessPayload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRATION as jsonwebtoken.SignOptions['expiresIn'],
    });

    // 7. Audit Log (Sanitized)
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        entity: 'User',
        entityId: user.id,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        newState: {
          sessionId: session.id,
          userType: user.userType,
        },
      },
    });

    eventBus.publish(DomainEvent.USER_LOGGED_IN, {
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      userId: user.id,
      email: user.email,
    });

    const userDto: AuthUserDto = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      avatarUrl: user.avatarUrl,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
    };

    return {
      user: userDto,
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: 900, // 15 minutes in seconds
      },
    };
  }

  /**
   * Refreshes access token and rotates refresh token.
   * Detects and terminates token families upon replay attack.
   */
  async refreshAccessToken(rawRefreshToken: string, ipAddress?: string): Promise<AuthTokens> {
    const tokenHash = hashToken(rawRefreshToken);
    const tokenRecord = await sessionsRepository.findRefreshTokenWithSession(tokenHash);

    if (!tokenRecord) {
      throw new AppError('Invalid or expired refresh token', 401, ErrorCode.INVALID_TOKEN);
    }

    // CRITICAL SECURITY DEFENSE: Refresh Token Reuse Detection
    if (tokenRecord.consumedAt !== null || tokenRecord.revokedAt !== null || tokenRecord.session.isRevoked) {
      // Invalidate the entire token family immediately
      await sessionsRepository.revokeFamily(tokenRecord.session.familyId, 'TOKEN_REUSE_DETECTED');

      await prisma.auditLog.create({
        data: {
          userId: tokenRecord.session.userId,
          action: 'TOKEN_REPLAY_ATTACK_DETECTED',
          entity: 'Session',
          entityId: tokenRecord.session.id,
          ipAddress,
          newState: {
            familyId: tokenRecord.session.familyId,
            revokedAt: new Date().toISOString(),
          },
        },
      });

      throw new AppError(
        'Security violation: Token reuse detected. Your session family has been terminated.',
        401,
        ErrorCode.TOKEN_REUSE_DETECTED
      );
    }

    // Check expiration
    if (tokenRecord.expiresAt < new Date() || tokenRecord.session.expiresAt < new Date()) {
      throw new AppError('Refresh token has expired', 401, ErrorCode.TOKEN_EXPIRED);
    }

    // Verify user status
    const user = await usersRepository.findById(tokenRecord.session.userId);
    if (!user || !user.isActive) {
      throw new AppError('Account is inactive or not found', 401, ErrorCode.UNAUTHENTICATED);
    }

    // Rotate refresh token
    const newRawRefreshToken = generateSecureRandomToken(32);
    const newTokenHash = hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await sessionsRepository.rotateRefreshToken(
      tokenRecord.session.id,
      tokenRecord.id,
      newTokenHash,
      newExpiresAt
    );

    // Issue new access token carrying current tokenVersion
    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      userType: user.userType,
      tokenVersion: user.tokenVersion,
      sessionId: tokenRecord.session.id,
    };

    const accessToken = jsonwebtoken.sign(accessPayload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRATION as jsonwebtoken.SignOptions['expiresIn'],
    });

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: 900,
    };
  }

  /**
   * Log out current session
   */
  async logout(sessionId: string, userId: string): Promise<void> {
    await sessionsRepository.revokeSession(sessionId, 'USER_LOGOUT');
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'LOGOUT',
        entity: 'Session',
        entityId: sessionId,
      },
    });
  }

  /**
   * Fetch active device sessions for authenticated user
   */
  async getUserSessions(userId: string, currentSessionId?: string): Promise<SessionDto[]> {
    const sessions = await sessionsRepository.findActiveSessionsByUserId(userId);
    return sessions.map(s => ({
      id: s.id,
      deviceInfo: s.deviceInfo,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      isCurrent: s.id === currentSessionId,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }

  /**
   * Revoke a specific device session
   */
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = await sessionsRepository.findSessionById(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError('Session not found or unauthorized', 404, ErrorCode.NOT_FOUND);
    }
    await sessionsRepository.revokeSession(sessionId, 'USER_TERMINATED_SESSION');
  }

  /**
   * Revoke all other sessions except current
   */
  async revokeOtherSessions(userId: string, currentSessionId?: string): Promise<number> {
    return sessionsRepository.revokeAllUserSessions(
      userId,
      currentSessionId,
      'USER_TERMINATED_OTHER_SESSIONS'
    );
  }

  /**
   * Initiates password reset with generic response and single-use token
   */
  async forgotPassword(email: string, ipAddress?: string): Promise<string> {
    const genericMessage =
      'If an account with this email exists, password reset instructions have been dispatched.';

    const user = await usersRepository.findByEmail(email);
    if (!user || !user.isActive) {
      return genericMessage;
    }

    const rawToken = generateSecureRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await usersRepository.setPasswordResetHash(user.id, tokenHash, expiresAt);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entity: 'User',
        entityId: user.id,
        ipAddress,
      },
    });

    eventBus.publish(DomainEvent.PASSWORD_RESET_REQUESTED, {
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      userId: user.id,
      email: user.email,
    });

    return genericMessage;
  }

  /**
   * Consumes single-use reset token atomically, updates password, increments tokenVersion,
   * and revokes all active sessions.
   */
  async resetPassword(token: string, newPassword: string, ipAddress?: string): Promise<void> {
    const tokenHash = hashToken(token);
    const user = await usersRepository.findByValidResetHash(tokenHash);

    if (!user) {
      throw new AppError(
        'Password reset link is invalid or has expired. Please request a new one.',
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    const newPasswordHash = await hashPassword(newPassword);

    // Atomically update password, clear reset hash, and increment tokenVersion
    await usersRepository.updatePasswordAndIncrementVersion(user.id, newPasswordHash);

    // Terminate all existing sessions for this user
    await sessionsRepository.revokeAllUserSessions(user.id, undefined, 'PASSWORD_RESET_COMPLETED');

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_COMPLETED',
        entity: 'User',
        entityId: user.id,
        ipAddress,
      },
    });
  }

  /**
   * Authenticated password change
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId?: string
  ): Promise<void> {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, ErrorCode.NOT_FOUND);
    }

    const isValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isValid) {
      throw new AppError('Current password is incorrect', 400, ErrorCode.BAD_REQUEST);
    }

    const newPasswordHash = await hashPassword(newPassword);

    await usersRepository.updatePasswordAndIncrementVersion(user.id, newPasswordHash);

    // Revoke all other sessions
    await sessionsRepository.revokeAllUserSessions(user.id, currentSessionId, 'PASSWORD_CHANGED');

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_CHANGED',
        entity: 'User',
        entityId: user.id,
      },
    });
  }
}

export const authService = new AuthService();

