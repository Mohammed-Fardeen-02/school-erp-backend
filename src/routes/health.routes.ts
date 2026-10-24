import { Router, Request, Response } from 'express';
import { prisma } from '../core/database/prisma-client';
import { env } from '../config/env';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the operational status of the backend API and database connectivity
 *     responses:
 *       200:
 *         description: Service is healthy
 *       503:
 *         description: Service or dependent database is unhealthy
 */
router.get('/', async (_req: Request, res: Response) => {
  let dbStatus = 'connected';
  let dbLatencyMs = 0;

  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - start;
  } catch {
    dbStatus = 'disconnected';
  }

  const healthData = {
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    version: '0.1.0',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
    },
  };

  const httpStatus = healthData.status === 'ok' ? 200 : 503;
  return res.status(httpStatus).json({
    success: healthData.status === 'ok',
    data: healthData,
    timestamp: healthData.timestamp,
  });
});

export const healthRoutes = router;
