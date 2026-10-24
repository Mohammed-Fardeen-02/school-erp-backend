import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { corsOptions } from './config/cors';
import { requestContextMiddleware } from './core/middleware/request-context';
import { rateLimiter } from './core/middleware/rate-limiter';
import { notFoundHandler, globalErrorHandler } from './core/errors/error-handler';
import apiRouter from './routes';
import { healthRoutes } from './routes/health.routes';

export function createApp(): Application {
  const app: Application = express();

  // Security headers
  app.use(helmet());

  // Cross-Origin Resource Sharing
  app.use(cors(corsOptions));

  // Request Body Parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request Context & Structured Logging
  app.use(requestContextMiddleware);

  // Global API Rate Limiter
  app.use(rateLimiter());

  // Root-level health check endpoint for container orchestrators (AWS ALB / K8s / Docker)
  app.use('/health', healthRoutes);

  // OpenAPI / Swagger Documentation
  const swaggerDocument = {
    openapi: '3.0.0',
    info: {
      title: 'School ERP API Documentation',
      version: '0.1.0',
      description: 'Enterprise Modular Monolith API specification for School ERP',
    },
    servers: [
      {
        url: env.API_PREFIX,
        description: 'Current Environment API Server',
      },
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Health Status Check',
          description: 'Returns operational status of API and database',
          responses: {
            '200': {
              description: 'Service operational',
            },
            '503': {
              description: 'Service degraded or database unreachable',
            },
          },
        },
      },
    },
  };
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  // Central API Router
  app.use(env.API_PREFIX, apiRouter);

  // 404 Route Not Found Handler
  app.use(notFoundHandler);

  // Global Error Handler
  app.use(globalErrorHandler);

  return app;
}

export const app = createApp();
export default app;
