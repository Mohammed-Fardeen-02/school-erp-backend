import { Session, RefreshToken } from '@prisma/client';
import { prisma } from '../../core/database/prisma-client';
import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';

export interface CreateSessionParams {
  userId: string;
  familyId: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
  initialTokenHash: string;
  expiresAt: Date;
  absoluteExpiresAt?: Date;
}

export type RefreshTokenWithSession = RefreshToken & {
  session: Session;
};

export class SessionsRepository {
  /**
   * Atomically creates a Session and its initial RefreshToken record.
   */
  async createSession(params: CreateSessionParams): Promise<{ session: Session; refreshToken: RefreshToken }> {
    return prisma.$transaction(async tx => {
      const now = new Date();
      const absoluteExpiresAt =
        params.absoluteExpiresAt || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7-day ceiling

      const session = await tx.session.create({
        data: {
          userId: params.userId,
          familyId: params.familyId,
          deviceInfo: params.deviceInfo,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          expiresAt: params.expiresAt,
          lastActivityAt: now,
          absoluteExpiresAt,
          isRevoked: false,
        },
      });

      const refreshToken = await tx.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: params.initialTokenHash,
          expiresAt: params.expiresAt,
        },
      });

      return { session, refreshToken };
    });
  }

  /**
   * Look up a refresh token and its parent session by the token's SHA-256 hash.
   */
  async findRefreshTokenWithSession(tokenHash: string): Promise<RefreshTokenWithSession | null> {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        session: true,
      },
    });
  }

  /**
   * Extends the inactivity expiration of a session if meaningful activity occurs.
   * Concurrency-safe and atomic:
   * - Does NOT extend revoked sessions.
   * - Does NOT extend expired sessions.
   * - Strictly caps sliding expiration at absoluteExpiresAt.
   */
  async touchSessionActivity(
    sessionId: string,
    timeoutMinutes: number = 30
  ): Promise<{ valid: boolean; session?: Session; reason?: 'REVOKED' | 'EXPIRED' | 'NOT_FOUND' }> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return { valid: false, reason: 'NOT_FOUND' };
    }

    if (session.isRevoked) {
      return { valid: false, reason: 'REVOKED' };
    }

    const now = new Date();
    if (session.expiresAt < now) {
      return { valid: false, reason: 'EXPIRED' };
    }

    if (session.absoluteExpiresAt && session.absoluteExpiresAt < now) {
      return { valid: false, reason: 'EXPIRED' };
    }

    const desiredExpiry = new Date(now.getTime() + timeoutMinutes * 60 * 1000);
    const effectiveExpiry =
      session.absoluteExpiresAt && desiredExpiry > session.absoluteExpiresAt
        ? session.absoluteExpiresAt
        : desiredExpiry;

    // Atomic conditional update ensures concurrent revocation takes precedence
    const updated = await prisma.session.updateMany({
      where: {
        id: sessionId,
        isRevoked: false,
        expiresAt: { gt: now },
        ...(session.absoluteExpiresAt ? { absoluteExpiresAt: { gt: now } } : {}),
      },
      data: {
        lastActivityAt: now,
        expiresAt: effectiveExpiry,
      },
    });

    if (updated.count === 0) {
      return { valid: false, reason: 'REVOKED' };
    }

    return {
      valid: true,
      session: {
        ...session,
        lastActivityAt: now,
        expiresAt: effectiveExpiry,
      },
    };
  }

  /**
   * Atomically rotates a refresh token:
   * 1. Verifies parent session is still active, unrevoked, and unexpired.
   * 2. Marks the old token as consumed (consumedAt = now, replacedByTokenId = newId).
   * 3. Inserts the new RefreshToken record.
   * 4. Extends/touches the Session expiresAt, capped at absoluteExpiresAt.
   */
  async rotateRefreshToken(
    sessionId: string,
    oldTokenId: string,
    newTokenHash: string,
    newExpiresAt: Date
  ): Promise<RefreshToken> {
    return prisma.$transaction(async tx => {
      const now = new Date();

      // 1. Verify parent session is still active, unrevoked, and unexpired inside the transaction
      const parentSession = await tx.session.findUnique({
        where: { id: sessionId },
        select: { id: true, isRevoked: true, expiresAt: true, absoluteExpiresAt: true },
      });

      if (!parentSession) {
        throw new AppError('Parent session does not exist', 401, ErrorCode.UNAUTHENTICATED);
      }

      if (parentSession.isRevoked) {
        throw new AppError('Cannot rotate refresh token for a revoked session', 401, ErrorCode.UNAUTHENTICATED);
      }

      if (parentSession.expiresAt < now) {
        throw new AppError('Cannot rotate refresh token for an expired session', 401, ErrorCode.TOKEN_EXPIRED);
      }

      if (parentSession.absoluteExpiresAt && parentSession.absoluteExpiresAt < now) {
        throw new AppError(
          'Cannot rotate refresh token: session has reached its absolute security limit',
          401,
          ErrorCode.TOKEN_EXPIRED
        );
      }

      // Ensure new expiration respects the absolute session limit
      const effectiveExpiresAt =
        parentSession.absoluteExpiresAt && newExpiresAt > parentSession.absoluteExpiresAt
          ? parentSession.absoluteExpiresAt
          : newExpiresAt;

      // 2. Create the new token
      const newToken = await tx.refreshToken.create({
        data: {
          sessionId,
          tokenHash: newTokenHash,
          expiresAt: effectiveExpiresAt,
        },
      });

      // 3. Mark the old token as consumed
      await tx.refreshToken.update({
        where: { id: oldTokenId },
        data: {
          consumedAt: now,
          replacedByTokenId: newToken.id,
        },
      });

      // 4. Update parent session expiration atomically with check
      const updateResult = await tx.session.updateMany({
        where: {
          id: sessionId,
          isRevoked: false,
          expiresAt: { gt: now },
        },
        data: {
          lastActivityAt: now,
          expiresAt: effectiveExpiresAt,
        },
      });

      if (updateResult.count === 0) {
        throw new AppError('Cannot extend a revoked or expired session', 401, ErrorCode.TOKEN_EXPIRED);
      }

      return newToken;
    });
  }

  /**
   * CRITICAL SECURITY DEFENSE:
   * Revokes an entire token family when a reuse/theft attempt is detected.
   */
  async revokeFamily(familyId: string, reason: string = 'TOKEN_REUSE_DETECTED'): Promise<number> {
    const now = new Date();
    return prisma.$transaction(async tx => {
      // Revoke all sessions sharing this familyId
      const sessions = await tx.session.updateMany({
        where: { familyId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: now,
          revokedReason: reason,
        },
      });

      // Mark all refresh tokens belonging to this family's sessions as revoked
      await tx.refreshToken.updateMany({
        where: {
          session: { familyId },
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      return sessions.count;
    });
  }

  /**
   * Revokes a specific single session (e.g. user clicks "Sign out on this device").
   */
  async revokeSession(sessionId: string, reason: string = 'USER_LOGOUT'): Promise<Session> {
    const now = new Date();
    return prisma.$transaction(async tx => {
      await tx.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      });

      return tx.session.update({
        where: { id: sessionId },
        data: {
          isRevoked: true,
          revokedAt: now,
          revokedReason: reason,
        },
      });
    });
  }

  /**
   * Revokes all active sessions for a user (e.g. on password reset or "Sign out all devices").
   */
  async revokeAllUserSessions(
    userId: string,
    exceptSessionId?: string,
    reason: string = 'PASSWORD_CHANGED'
  ): Promise<number> {
    const now = new Date();
    return prisma.$transaction(async tx => {
      const whereSession = exceptSessionId
        ? { userId, id: { not: exceptSessionId }, isRevoked: false }
        : { userId, isRevoked: false };

      const whereTokens = exceptSessionId
        ? { session: { userId, id: { not: exceptSessionId } }, revokedAt: null }
        : { session: { userId }, revokedAt: null };

      await tx.refreshToken.updateMany({
        where: whereTokens,
        data: { revokedAt: now },
      });

      const result = await tx.session.updateMany({
        where: whereSession,
        data: {
          isRevoked: true,
          revokedAt: now,
          revokedReason: reason,
        },
      });

      return result.count;
    });
  }

  /**
   * Lists active, non-revoked sessions for a user.
   */
  async findActiveSessionsByUserId(userId: string): Promise<Session[]> {
    return prisma.session.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find a specific session by ID
   */
  async findSessionById(sessionId: string): Promise<Session | null> {
    return prisma.session.findUnique({
      where: { id: sessionId },
    });
  }

  /**
   * Find a specific session by ID including user and organization memberships
   */
  async findSessionWithUserById(sessionId: string) {
    return prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          include: {
            memberships: true,
          },
        },
      },
    });
  }

  /**
   * Lists active, non-revoked sessions for users belonging to a specific organization.
   */
  async findOrganizationActiveSessions(
    organizationId: string,
    options?: {
      search?: string;
      userId?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const whereClause: any = {
      isRevoked: false,
      expiresAt: { gt: new Date() },
    };

    if (organizationId !== 'platform-control') {
      whereClause.user = {
        memberships: {
          some: {
            organizationId,
            status: 'ACTIVE',
          },
        },
      };
    }

    if (options?.userId) {
      whereClause.userId = options.userId;
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim();
      whereClause.AND = [
        {
          OR: [
            { deviceInfo: { contains: q, mode: 'insensitive' } },
            { ipAddress: { contains: q, mode: 'insensitive' } },
            { userAgent: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
            { user: { firstName: { contains: q, mode: 'insensitive' } } },
            { user: { lastName: { contains: q, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    return prisma.session.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
  }

  /**
   * Counts active sessions for an organization.
   */
  async countOrganizationActiveSessions(
    organizationId: string,
    options?: {
      search?: string;
      userId?: string;
    }
  ): Promise<number> {
    const whereClause: any = {
      isRevoked: false,
      expiresAt: { gt: new Date() },
    };

    if (organizationId !== 'platform-control') {
      whereClause.user = {
        memberships: {
          some: {
            organizationId,
            status: 'ACTIVE',
          },
        },
      };
    }

    if (options?.userId) {
      whereClause.userId = options.userId;
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim();
      whereClause.AND = [
        {
          OR: [
            { deviceInfo: { contains: q, mode: 'insensitive' } },
            { ipAddress: { contains: q, mode: 'insensitive' } },
            { userAgent: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
            { user: { firstName: { contains: q, mode: 'insensitive' } } },
            { user: { lastName: { contains: q, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    return prisma.session.count({
      where: whereClause,
    });
  }
}

export const sessionsRepository = new SessionsRepository();

