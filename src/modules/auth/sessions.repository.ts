import { Session, RefreshToken } from '@prisma/client';
import { prisma } from '../../core/database/prisma-client';

export interface CreateSessionParams {
  userId: string;
  familyId: string;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
  initialTokenHash: string;
  expiresAt: Date;
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
      const session = await tx.session.create({
        data: {
          userId: params.userId,
          familyId: params.familyId,
          deviceInfo: params.deviceInfo,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          expiresAt: params.expiresAt,
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
   * Atomically rotates a refresh token:
   * 1. Marks the old token as consumed (consumedAt = now, replacedByTokenId = newId).
   * 2. Inserts the new RefreshToken record.
   * 3. Extends/touches the Session expiresAt.
   */
  async rotateRefreshToken(
    sessionId: string,
    oldTokenId: string,
    newTokenHash: string,
    newExpiresAt: Date
  ): Promise<RefreshToken> {
    return prisma.$transaction(async tx => {
      // 1. Create the new token
      const newToken = await tx.refreshToken.create({
        data: {
          sessionId,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
        },
      });

      // 2. Mark the old token as consumed
      await tx.refreshToken.update({
        where: { id: oldTokenId },
        data: {
          consumedAt: new Date(),
          replacedByTokenId: newToken.id,
        },
      });

      // 3. Update parent session expiration
      await tx.session.update({
        where: { id: sessionId },
        data: {
          expiresAt: newExpiresAt,
        },
      });

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
}

export const sessionsRepository = new SessionsRepository();

