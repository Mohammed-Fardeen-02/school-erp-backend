import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { AuthenticatedUser } from '../types/common.types';

interface JwtPayloadWithUser {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  schoolId?: string;
  branchId?: string;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(
      new AppError('Authentication token missing or invalid format', 401, ErrorCode.UNAUTHENTICATED)
    );
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return next(new AppError('Authentication token missing', 401, ErrorCode.UNAUTHENTICATED));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayloadWithUser;

    const authUser: AuthenticatedUser = {
      id: decoded.userId,
      email: decoded.email,
      roles: decoded.roles || [],
      permissions: decoded.permissions || [],
      schoolId: decoded.schoolId,
      branchId: decoded.branchId,
    };

    req.user = authUser;
    if (req.context) {
      req.context.user = authUser;
      if (decoded.schoolId && !req.context.schoolId) {
        req.context.schoolId = decoded.schoolId;
        req.schoolId = decoded.schoolId;
      }
    }

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Authentication token has expired', 401, ErrorCode.TOKEN_EXPIRED));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid authentication token', 401, ErrorCode.INVALID_TOKEN));
    }
    return next(new AppError('Authentication failed', 401, ErrorCode.UNAUTHENTICATED));
  }
}
