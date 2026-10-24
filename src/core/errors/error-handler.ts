import { Request, Response, NextFunction } from 'express';
import { AppError } from './app-error';
import { ErrorCode } from './error-codes';
import { ResponseHelper } from '../http/response';
import { logger } from '../logger/app-logger';
import { env } from '../../config/env';

/**
 * 404 Route Not Found Middleware
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(
    new AppError(
      `Cannot ${req.method} ${req.originalUrl} - Route not found`,
      404,
      ErrorCode.NOT_FOUND
    )
  );
}

/**
 * Centralized Global Error Handler Middleware
 */
export function globalErrorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.id || req.context?.requestId || 'unknown';

  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error(
        { err, requestId, url: req.originalUrl },
        `Non-operational AppError: ${err.message}`
      );
    } else {
      logger.warn(
        { errCode: err.errorCode, message: err.message, requestId },
        `Operational Error: ${err.message}`
      );
    }

    ResponseHelper.error(res, err.statusCode, err.errorCode, err.message, err.details);
    return;
  }

  // Handle SyntaxError from invalid JSON payload
  if ('type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    ResponseHelper.error(
      res,
      400,
      ErrorCode.BAD_REQUEST,
      'Malformed JSON payload provided in request'
    );
    return;
  }

  // Unhandled / Internal Errors
  logger.error(
    {
      err,
      requestId,
      method: req.method,
      url: req.originalUrl,
      stack: err.stack,
    },
    `Unhandled Exception: ${err.message}`
  );

  const message =
    env.NODE_ENV === 'production' ? 'An unexpected internal server error occurred.' : err.message;

  ResponseHelper.error(
    res,
    500,
    ErrorCode.INTERNAL_SERVER_ERROR,
    message,
    env.NODE_ENV === 'development' ? { stack: err.stack } : undefined
  );
}
