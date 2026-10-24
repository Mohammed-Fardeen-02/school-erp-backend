import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { APP_CONSTANTS } from '../../config/constants';
import { logger } from '../logger/app-logger';

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = req.header(APP_CONSTANTS.REQUEST_HEADERS.REQUEST_ID);
  const requestId =
    incomingRequestId && incomingRequestId.trim().length > 0 ? incomingRequestId : randomUUID();
  const schoolId = req.header(APP_CONSTANTS.REQUEST_HEADERS.SCHOOL_ID);

  req.id = requestId;
  if (schoolId) {
    req.schoolId = schoolId;
  }

  req.context = {
    requestId,
    schoolId,
    startTime: Date.now(),
  };

  res.setHeader(APP_CONSTANTS.REQUEST_HEADERS.REQUEST_ID, requestId);

  res.on('finish', () => {
    const duration = Date.now() - (req.context?.startTime ?? Date.now());
    logger.info(
      {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration,
        schoolId: req.schoolId,
      },
      'HTTP Request completed'
    );
  });

  next();
}
