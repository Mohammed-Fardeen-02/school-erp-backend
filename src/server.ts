import http from 'http';
import app from './app';
import { env } from './config/env';
import { logger } from './core/logger/app-logger';
import { prisma } from './core/database/prisma-client';
import { initializeEventHandlers } from './events/handlers';
import { startWorkers, stopWorkers } from './jobs/workers';

const server = http.createServer(app);

const startServer = async () => {
  try {
    // 1. Initialize domain event listeners
    initializeEventHandlers();

    // 2. Start background BullMQ workers if Redis is configured
    if (env.REDIS_HOST) {
      await startWorkers();
    }

    // 3. Listen on port
    server.listen(env.PORT, () => {
      logger.info(`🚀 [${env.APP_NAME}] running in ${env.NODE_ENV} mode on port ${env.PORT}`);
      logger.info(`📖 API Documentation available at http://localhost:${env.PORT}/docs`);
      logger.info(`🩺 Health check accessible at http://localhost:${env.PORT}/health`);
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize server');
    process.exit(1);
  }
};

const handleGracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed.');

    try {
      await stopWorkers();
      await prisma.$disconnect();
      logger.info('Database and queue resources cleanly disconnected.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful disconnect');
      process.exit(1);
    }
  });

  // Force exit if shutdown hangs beyond 10 seconds
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcefully terminating process.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught Exception detected! Shutting down process.');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled Promise Rejection detected! Shutting down process.');
  process.exit(1);
});

startServer();
