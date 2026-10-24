import { Response } from 'express';

export interface ApiResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiResponse<T = unknown> {
  success: true;
  message?: string;
  data: T;
  meta?: ApiResponseMeta;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export class ResponseHelper {
  static ok<T>(res: Response, data: T, message?: string, meta?: ApiResponseMeta): Response {
    const responsePayload: ApiResponse<T> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      ...(message && { message }),
      ...(meta && { meta }),
    };
    return res.status(200).json(responsePayload);
  }

  static created<T>(
    res: Response,
    data: T,
    message: string = 'Resource created successfully'
  ): Response {
    const responsePayload: ApiResponse<T> = {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
    return res.status(201).json(responsePayload);
  }

  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  static error(
    res: Response,
    statusCode: number,
    code: string,
    message: string,
    details?: unknown
  ): Response {
    const responsePayload: ApiErrorResponse = {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      timestamp: new Date().toISOString(),
    };
    return res.status(statusCode).json(responsePayload);
  }
}
