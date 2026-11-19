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
import { securityPolicyRepository, SecurityPolicyConfig } from './security-policy.repository';
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
    organizationId?: string;
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

    // Resolve validated tenant context if provided, otherwise resolve default active membership
    let validatedOrgId: string | null = null;
    if (params.organizationId) {
      const explicitMembership = await prisma.organizationMembership.findFirst({
        where: { userId: user.id, organizationId: params.organizationId, status: 'ACTIVE' },
        select: { organizationId: true },
      });
      if (explicitMembership) {
        validatedOrgId = explicitMembership.organizationId;
      }
    }

    const membership = validatedOrgId
      ? { organizationId: validatedOrgId }
      : await prisma.organizationMembership.findFirst({
          where: { userId: user.id, status: 'ACTIVE' },
          select: { organizationId: true },
        });
    const orgId = membership?.organizationId || 'default';
    const policy = await securityPolicyRepository.findByOrganizationId(orgId);

    // 3. Password Verification
    const isPasswordValid = await verifyPassword(user.passwordHash, params.password);

    if (!isPasswordValid) {
      const lockoutResult = await usersRepository.atomicIncrementFailedLogins(
        user.id,
        policy.maxFailedLoginsBeforeLockout,
        policy.lockoutDurationMinutes
      );

      await prisma.auditLog.create({
        data: {
          organizationId: validatedOrgId,
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
          `Account is temporarily locked due to ${policy.maxFailedLoginsBeforeLockout} consecutive failed login attempts. Please try again in ${policy.lockoutDurationMinutes} minute(s).`,
          403,
          ErrorCode.ACCOUNT_LOCKED
        );
      }

      throw new AppError('Invalid email or password', 401, ErrorCode.UNAUTHENTICATED);
    }

    // 4. Successful Authentication: Reset lockout counters
    await usersRepository.atomicResetFailedLogins(user.id, params.ipAddress);

    // Check Password Expiry Policy (based exclusively on actual password change)
    let mustChangePassword = user.mustChangePassword;
    if (policy.passwordExpiryDays > 0) {
      const lastPasswordChange = user.passwordChangedAt || user.createdAt;
      const passwordAgeMs = Date.now() - new Date(lastPasswordChange).getTime();
      const maxAgeMs = policy.passwordExpiryDays * 24 * 60 * 60 * 1000;
      if (passwordAgeMs > maxAgeMs) {
        mustChangePassword = true;
        await prisma.user.update({
          where: { id: user.id },
          data: { mustChangePassword: true },
        });
      }
    }

    // 5. Generate Refresh Token and Session Family with Sliding Inactivity Timeout and Absolute Limit
    const rawRefreshToken = generateSecureRandomToken(32);
    const initialTokenHash = hashToken(rawRefreshToken);
    const familyId = crypto.randomUUID();
    const sessionTimeoutMs = (policy.sessionTimeoutMinutes || 30) * 60 * 1000;
    const now = new Date();
    const refreshExpiresAt = new Date(now.getTime() + sessionTimeoutMs);
    const absoluteExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7-day security limit

    const { session } = await sessionsRepository.createSession({
      userId: user.id,
      familyId,
      deviceInfo: params.deviceInfo,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      initialTokenHash,
      expiresAt: refreshExpiresAt,
      absoluteExpiresAt,
    });

    // 6. Generate Short-Lived Access Token (carrying tokenVersion and roles)
    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      userType: user.userType,
      roles: user.userType === 'PLATFORM' ? ['SUPER_ADMIN'] : [],
      tokenVersion: user.tokenVersion,
      sessionId: session.id,
    };

    const accessToken = jsonwebtoken.sign(accessPayload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRATION as jsonwebtoken.SignOptions['expiresIn'],
    });

    // 7. Audit Log (Sanitized)
    await prisma.auditLog.create({
      data: {
        organizationId: validatedOrgId,
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
      mustChangePassword,
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

    // Check expiration and absolute security lifetime limits
    const now = new Date();
    if (tokenRecord.expiresAt < now || tokenRecord.session.expiresAt < now) {
      throw new AppError('Refresh token has expired', 401, ErrorCode.TOKEN_EXPIRED);
    }
    if (tokenRecord.session.absoluteExpiresAt && tokenRecord.session.absoluteExpiresAt < now) {
      throw new AppError('Session has reached its absolute security limit', 401, ErrorCode.TOKEN_EXPIRED);
    }

    // Verify user status
    const user = await usersRepository.findById(tokenRecord.session.userId);
    if (!user || !user.isActive) {
      throw new AppError('Account is inactive or not found', 401, ErrorCode.UNAUTHENTICATED);
    }

    // Resolve tenant policy for session inactivity timeout
    const membership = await prisma.organizationMembership.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      select: { organizationId: true },
    });
    const orgId = membership?.organizationId || 'default';
    const policy = await securityPolicyRepository.findByOrganizationId(orgId);
    const sessionTimeoutMs = (policy.sessionTimeoutMinutes || 30) * 60 * 1000;
    const newExpiresAt = new Date(Date.now() + sessionTimeoutMs);

    // Rotate refresh token
    const newRawRefreshToken = generateSecureRandomToken(32);
    const newTokenHash = hashToken(newRawRefreshToken);

    await sessionsRepository.rotateRefreshToken(
      tokenRecord.session.id,
      tokenRecord.id,
      newTokenHash,
      newExpiresAt
    );

    // Issue new access token carrying current tokenVersion and roles
    const accessPayload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      userType: user.userType,
      roles: user.userType === 'PLATFORM' ? ['SUPER_ADMIN'] : [],
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
  async logout(sessionId: string, userId: string, organizationId?: string): Promise<void> {
    await sessionsRepository.revokeSession(sessionId, 'USER_LOGOUT');
    await prisma.auditLog.create({
      data: {
        organizationId: organizationId || null,
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

    const membership = await prisma.organizationMembership.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      select: { organizationId: true },
    });
    const orgId = membership?.organizationId || 'default';
    const policy = await securityPolicyRepository.findByOrganizationId(orgId);
    const validation = securityPolicyRepository.validatePassword(newPassword, policy);
    if (!validation.valid) {
      throw new AppError(
        `Password does not meet organization policy requirements: ${validation.errors.join('; ')}`,
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
    currentSessionId?: string,
    organizationId?: string
  ): Promise<void> {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, ErrorCode.NOT_FOUND);
    }

    const isValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isValid) {
      throw new AppError('Current password is incorrect', 400, ErrorCode.BAD_REQUEST);
    }

    const membership = await prisma.organizationMembership.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { organizationId: true },
    });
    const orgId = organizationId || membership?.organizationId || 'default';
    const policy = await securityPolicyRepository.findByOrganizationId(orgId);
    const validation = securityPolicyRepository.validatePassword(newPassword, policy);
    if (!validation.valid) {
      throw new AppError(
        `Password does not meet organization policy requirements: ${validation.errors.join('; ')}`,
        400,
        ErrorCode.BAD_REQUEST
      );
    }

    const newPasswordHash = await hashPassword(newPassword);

    await usersRepository.updatePasswordAndIncrementVersion(user.id, newPasswordHash);

    // Revoke all other sessions
    await sessionsRepository.revokeAllUserSessions(user.id, currentSessionId, 'PASSWORD_CHANGED');

    await prisma.auditLog.create({
      data: {
        organizationId: organizationId || null,
        userId: user.id,
        action: 'PASSWORD_CHANGED',
        entity: 'User',
        entityId: user.id,
      },
    });
  }

  // ==========================================
  // STAGE 4: ORGANIZATION SESSIONS & SECURITY
  // ==========================================

  /**
   * Retrieves active sessions for members of an organization with full user profile and device details.
   */
  async getOrganizationSessions(params: {
    organizationId: string;
    currentSessionId?: string;
    search?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }) {
    const rawSessions = await sessionsRepository.findOrganizationActiveSessions(
      params.organizationId,
      {
        search: params.search,
        userId: params.userId,
        limit: params.limit,
        offset: params.offset,
      }
    );

    return rawSessions.map(s => {
      const isMobile = (s.deviceInfo || s.userAgent || '').toLowerCase().match(/iphone|ipad|android|mobile/);
      const fallbackDevice = isMobile ? 'Mobile Browser / Device' : 'Desktop Browser / Workstation';

      return {
        id: s.id,
        userId: s.userId,
        userName: `${s.user.firstName} ${s.user.lastName}`.trim(),
        userEmail: s.user.email,
        deviceInfo: s.deviceInfo || fallbackDevice,
        ipAddress: s.ipAddress || 'unknown',
        userAgent: s.userAgent || 'unknown',
        isCurrentSession: s.id === params.currentSessionId,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      };
    });
  }

  /**
   * Admin-initiated single session revocation with tenant isolation.
   */
  async adminRevokeSession(params: {
    sessionId: string;
    organizationId: string;
    actorUserId: string;
    isPlatformOperator: boolean;
  }): Promise<void> {
    const session = await sessionsRepository.findSessionWithUserById(params.sessionId);
    if (!session) {
      throw new AppError('Session not found', 404, ErrorCode.NOT_FOUND);
    }

    // 1. Disallow tenant admins from revoking platform operator sessions
    if (session.user.userType === 'PLATFORM' && !params.isPlatformOperator) {
      throw new AppError(
        'Tenant administrators are not permitted to terminate platform operator sessions.',
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }

    // 2. Tenant boundary check: Ensure target user belongs to the active organization
    if (!params.isPlatformOperator && params.organizationId !== 'platform-control') {
      const isMember = session.user.memberships.some(
        m => m.organizationId === params.organizationId && m.status === 'ACTIVE'
      );
      if (!isMember && session.userId !== params.actorUserId) {
        throw new AppError(
          'Target session does not belong to an active member of your organization.',
          403,
          ErrorCode.TENANT_ACCESS_DENIED
        );
      }
    }

    // 3. Atomically revoke session and tokens
    await sessionsRepository.revokeSession(params.sessionId, 'ADMIN_TERMINATED_SESSION');

    // 4. Record security audit log
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId === 'platform-control' ? null : params.organizationId,
        userId: params.actorUserId,
        action: 'ADMIN_REVOKED_SESSION',
        entity: 'Session',
        entityId: params.sessionId,
        newState: {
          targetUserId: session.userId,
          targetEmail: session.user.email,
          revokedAt: new Date(),
          reason: 'ADMIN_TERMINATED_SESSION',
        },
      },
    });
  }

  /**
   * Admin-initiated termination of ALL sessions for an organization member.
   * Increments tokenVersion on User and marks all sessions/refresh-tokens as revoked.
   */
  async adminRevokeUserSessions(params: {
    targetUserId: string;
    organizationId: string;
    actorUserId: string;
    isPlatformOperator: boolean;
  }): Promise<{ revokedCount: number }> {
    const targetUser = await usersRepository.findById(params.targetUserId);
    if (!targetUser) {
      throw new AppError('User not found', 404, ErrorCode.NOT_FOUND);
    }

    if (targetUser.userType === 'PLATFORM' && !params.isPlatformOperator) {
      throw new AppError(
        'Tenant administrators cannot revoke sessions for platform operators.',
        403,
        ErrorCode.INSUFFICIENT_PERMISSIONS
      );
    }

    if (!params.isPlatformOperator && params.organizationId !== 'platform-control') {
      const isMember = await prisma.organizationMembership.findFirst({
        where: {
          userId: params.targetUserId,
          organizationId: params.organizationId,
          status: 'ACTIVE',
        },
      });

      if (!isMember && params.targetUserId !== params.actorUserId) {
        throw new AppError(
          'Target user is not an active member of your organization.',
          403,
          ErrorCode.TENANT_ACCESS_DENIED
        );
      }
    }

    // Increment tokenVersion to immediately invalidate all outstanding JWT access tokens
    await usersRepository.incrementTokenVersion(params.targetUserId);

    // Revoke all sessions and refresh tokens
    const count = await sessionsRepository.revokeAllUserSessions(
      params.targetUserId,
      undefined,
      'ADMIN_TERMINATED_ALL_SESSIONS'
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId === 'platform-control' ? null : params.organizationId,
        userId: params.actorUserId,
        action: 'ADMIN_REVOKED_ALL_USER_SESSIONS',
        entity: 'User',
        entityId: params.targetUserId,
        newState: {
          targetUserId: params.targetUserId,
          targetEmail: targetUser.email,
          revokedSessionsCount: count,
          revokedAt: new Date(),
        },
      },
    });

    return { revokedCount: count };
  }

  /**
   * Retrieves security policies for an organization.
   */
  async getSecurityPolicies(organizationId: string): Promise<SecurityPolicyConfig> {
    return securityPolicyRepository.findByOrganizationId(organizationId);
  }

  /**
   * Updates security policies for an organization with audit trail.
   */
  async updateSecurityPolicies(
    organizationId: string,
    updates: Partial<SecurityPolicyConfig>,
    actorUserId: string
  ): Promise<SecurityPolicyConfig> {
    const previous = await securityPolicyRepository.findByOrganizationId(organizationId);
    const updated = await securityPolicyRepository.update(organizationId, updates);

    await prisma.auditLog.create({
      data: {
        organizationId: organizationId === 'platform-control' ? null : organizationId,
        userId: actorUserId,
        action: 'SECURITY_POLICIES_UPDATED',
        entity: 'OrganizationSecurityPolicy',
        entityId: organizationId,
        previousState: previous as any,
        newState: updated as any,
      },
    });

    return updated;
  }

  /**
   * Queries authentication activity and security forensics from the immutable audit logs.
   */
  async getAuthenticationActivity(params: {
    organizationId: string;
    search?: string;
    action?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

    const AUTH_ACTIONS = [
      'LOGIN_SUCCESS',
      'LOGIN_FAILED',
      'LOGOUT',
      'PASSWORD_CHANGED',
      'PASSWORD_RESET_REQUESTED',
      'PASSWORD_RESET_COMPLETED',
      'TOKEN_REPLAY_ATTACK_DETECTED',
      'ADMIN_REVOKED_SESSION',
      'ADMIN_REVOKED_ALL_USER_SESSIONS',
      'SECURITY_POLICIES_UPDATED',
      'USER_TERMINATED_SESSION',
      'USER_TERMINATED_OTHER_SESSIONS',
    ];

    const whereClause: any = {};

    if (params.action && params.action !== 'ALL') {
      whereClause.action = params.action;
    } else {
      whereClause.action = { in: AUTH_ACTIONS };
    }

    if (params.organizationId !== 'platform-control') {
      whereClause.OR = [
        { organizationId: params.organizationId },
        {
          user: {
            memberships: {
              some: {
                organizationId: params.organizationId,
                status: 'ACTIVE',
              },
            },
          },
          organizationId: null, // Safe backward-compatibility fallback for legacy logs without tenant context
        },
      ];
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      whereClause.AND = [
        {
          OR: [
            { action: { contains: q, mode: 'insensitive' } },
            { ipAddress: { contains: q, mode: 'insensitive' } },
            { userAgent: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
            { user: { firstName: { contains: q, mode: 'insensitive' } } },
            { user: { lastName: { contains: q, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    const [total, rawLogs] = await Promise.all([
      prisma.auditLog.count({ where: whereClause }),
      prisma.auditLog.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
    ]);

    const logs = rawLogs.map(log => ({
      id: log.id,
      organizationId: log.organizationId,
      userId: log.userId,
      actorName: log.user ? `${log.user.firstName} ${log.user.lastName}`.trim() : 'System Security',
      actorEmail: log.user?.email || 'security@erp.internal',
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      previousState: log.previousState as Record<string, unknown> | null,
      newState: log.newState as Record<string, unknown> | null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt.toISOString(),
    }));

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}

export const authService = new AuthService();

