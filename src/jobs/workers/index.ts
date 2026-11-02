import { Worker } from 'bullmq';
import { createTenantProvisioningWorker } from './tenant-worker';
import { isRedisReachable } from '../queues/redis-connection';
import { logger } from '../../core/logger/app-logger';
import {
  startOutboxPolling,
  stopOutboxPolling,
} from '../../core/authorization/invalidation-outbox.worker';

let activeWorkers: Worker[] = [];

export async function startWorkers(): Promise<Worker[]> {
  try {
    const reachable = await isRedisReachable(500);
    if (!reachable) {
      logger.info(
        '[Redis] Redis is not running locally. Background queue workers will remain in standby/degraded mode.'
      );
      return [];
    }

    const tenantWorker = createTenantProvisioningWorker();
    activeWorkers = [tenantWorker];
    logger.info('[Workers] Background BullMQ workers registered and listening');

    // Start RBAC Invalidation Outbox Polling Worker
    startOutboxPolling(3000);
  } catch (error) {
    logger.warn({ error }, '[Workers] Unable to start background workers (Redis offline)');
  }
  return activeWorkers;
}

export async function stopWorkers(): Promise<void> {
  stopOutboxPolling();
  if (activeWorkers.length === 0) return;
  logger.info('[Workers] Gracefully stopping BullMQ workers...');
  await Promise.all(activeWorkers.map((w) => w.close()));
  activeWorkers = [];
  logger.info('[Workers] All BullMQ workers closed');
}

export * from './tenant-worker';
