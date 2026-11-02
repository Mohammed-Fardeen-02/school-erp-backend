import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { AuthenticatedUser } from '../types/common.types';
import { prisma } from '../database/prisma-client';

interface JwtPayloadWithUser {
  sub?: string;
  userId?: string;
  email: string;
  userType?: 'PLATFORM' | 'TENANT';
  tokenVersion?: number;
  sessionId?: string;
  roles?: string[];
  permissions?: string[];
  schoolId?: string;
  branchId?: string;
  organizationId?: string;
  locationId?: string;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;

    // 1. Check Bearer Authorization Header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // 2. Fallback to HttpOnly Cookie
    if (!token && req.cookies) {
      token = req.cookies.access_token || req.cookies.accessToken;
    }

    if (!token) {
      return next(
        new AppError('Authentication token missing or invalid format', 401, ErrorCode.UNAUTHENTICATED)
      );
    }

    // 3. Cryptographically verify signature
    let decoded: JwtPayloadWithUser;
    try {
      decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayloadWithUser;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return next(new AppError('Authentication token has expired', 401, ErrorCode.TOKEN_EXPIRED));
      }
      if (error instanceof jwt.JsonWebTokenError) {
        return next(new AppError('Invalid authentication token', 401, ErrorCode.INVALID_TOKEN));
      }
      return next(new AppError('Authentication failed', 401, ErrorCode.UNAUTHENTICATED));
    }

    const userId = decoded.sub || decoded.userId;
    if (!userId) {
      return next(new AppError('Malformed authentication token payload', 401, ErrorCode.INVALID_TOKEN));
    }

    // 4. Real-Time Token Version & Identity Check against Database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        userType: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (!user || !user.isActive) {
      return next(
        new AppError('User account not found or has been deactivated', 401, ErrorCode.UNAUTHENTICATED)
      );
    }

    // Invalidate access token if password was reset or changed (tokenVersion bumped)
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion < user.tokenVersion) {
      return next(
        new AppError(
          'Authentication token has been invalidated due to a security update. Please sign in again.',
          401,
          ErrorCode.TOKEN_EXPIRED
        )
      );
    }

    // 5. Verify Session Status if sessionId is present
    if (decoded.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: decoded.sessionId },
        select: { isRevoked: true, expiresAt: true },
      });

      if (!session || session.isRevoked || session.expiresAt < new Date()) {
        return next(
          new AppError('Session has expired or been terminated', 401, ErrorCode.UNAUTHENTICATED)
        );
      }
    }

    // 6. Attach authenticated identity to request & context
    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      userType: user.userType,
      tokenVersion: user.tokenVersion,
      sessionId: decoded.sessionId,
      roles: decoded.roles || [],
      permissions: decoded.permissions || [],
      organizationId: decoded.organizationId || decoded.schoolId,
      locationId: decoded.locationId || decoded.branchId,
      schoolId: decoded.schoolId || decoded.organizationId,
      branchId: decoded.branchId || decoded.locationId,
    };

    req.user = authUser;
    if (req.context) {
      req.context.user = authUser;
      if (authUser.organizationId && !req.context.organizationId) {
        req.context.organizationId = authUser.organizationId;
        req.organizationId = authUser.organizationId;
      }
      if (authUser.schoolId && !req.context.schoolId) {
        req.context.schoolId = authUser.schoolId;
        req.schoolId = authUser.schoolId;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}
