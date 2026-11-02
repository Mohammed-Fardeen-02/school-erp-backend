import { Queue, QueueOptions } from 'bullmq';
import { getBullMqConnection } from './redis-connection';
import { QUEUE_NAMES, EmailJobData, TenantProvisioningJobData } from './queue.types';
import { logger } from '../../core/logger/app-logger';

export * from './redis-connection';
export * from './queue.types';

const defaultQueueOptions: QueueOptions = {
  connection: getBullMqConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 500,
    },
    removeOnFail: {
      count: 1000,
    },
  },
};

let emailQueue: Queue<EmailJobData> | null = null;
let tenantProvisioningQueue: Queue<TenantProvisioningJobData> | null = null;

export function getEmailQueue(): Queue<EmailJobData> {
  if (!emailQueue) {
    try {
      emailQueue = new Queue<EmailJobData>(
        QUEUE_NAMES.EMAIL_NOTIFICATION,
        defaultQueueOptions
      );
      emailQueue.on('error', (err) => {
        logger.warn({ err }, `[Queue:${QUEUE_NAMES.EMAIL_NOTIFICATION}] Queue connection warning`);
      });
    } catch (error) {
      logger.warn({ error }, `[Queue:${QUEUE_NAMES.EMAIL_NOTIFICATION}] Failed to initialize queue`);
      throw error;
    }
  }
  return emailQueue;
}

export function getTenantProvisioningQueue(): Queue<TenantProvisioningJobData> {
  if (!tenantProvisioningQueue) {
    try {
      tenantProvisioningQueue = new Queue<TenantProvisioningJobData>(
        QUEUE_NAMES.TENANT_PROVISIONING,
        defaultQueueOptions
      );
      tenantProvisioningQueue.on('error', (err) => {
        logger.warn(
          { err },
          `[Queue:${QUEUE_NAMES.TENANT_PROVISIONING}] Queue connection warning`
        );
      });
    } catch (error) {
      logger.warn(
        { error },
        `[Queue:${QUEUE_NAMES.TENANT_PROVISIONING}] Failed to initialize queue`
      );
      throw error;
    }
  }
  return tenantProvisioningQueue;
}

