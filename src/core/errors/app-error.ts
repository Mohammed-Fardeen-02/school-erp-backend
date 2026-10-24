import { ErrorCode } from './error-codes';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    isOperational: boolean = true,
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(
    message: string,
    errorCode: ErrorCode = ErrorCode.BAD_REQUEST,
    details?: unknown
  ) {
    return new AppError(message, 400, errorCode, true, details);
  }

  static unauthorized(
    message: string = 'Authentication required',
    errorCode: ErrorCode = ErrorCode.UNAUTHENTICATED
  ) {
    return new AppError(message, 401, errorCode, true);
  }

  static forbidden(
    message: string = 'Access denied',
    errorCode: ErrorCode = ErrorCode.UNAUTHORIZED
  ) {
    return new AppError(message, 403, errorCode, true);
  }

  static notFound(
    message: string = 'Resource not found',
    errorCode: ErrorCode = ErrorCode.NOT_FOUND
  ) {
    return new AppError(message, 404, errorCode, true);
  }

  static conflict(message: string, errorCode: ErrorCode = ErrorCode.CONFLICT) {
    return new AppError(message, 409, errorCode, true);
  }

  static validation(message: string = 'Validation error', details?: unknown) {
    return new AppError(message, 422, ErrorCode.VALIDATION_ERROR, true, details);
  }

  static rateLimit(message: string = 'Too many requests') {
    return new AppError(message, 429, ErrorCode.RATE_LIMIT_EXCEEDED, true);
  }

  static internal(message: string = 'Internal server error', details?: unknown) {
    return new AppError(message, 500, ErrorCode.INTERNAL_SERVER_ERROR, false, details);
  }
}
