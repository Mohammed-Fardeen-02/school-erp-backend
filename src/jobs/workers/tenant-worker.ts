import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES, TenantProvisioningJobData } from '../queues/queue.types';
import { getBullMqConnection } from '../queues/redis-connection';
import { logger } from '../../core/logger/app-logger';

export function createTenantProvisioningWorker(): Worker<TenantProvisioningJobData> {
  const worker = new Worker<TenantProvisioningJobData>(
    QUEUE_NAMES.TENANT_PROVISIONING,
    async (job: Job<TenantProvisioningJobData>) => {
      logger.info(
        { jobId: job.id, organizationId: job.data.organizationId, code: job.data.organizationCode },
        '[TenantWorker] Processing tenant post-provisioning asynchronous setup'
      );

      // Async post-provisioning actions:
      // In future phases: dispatch welcome email, generate default academic term templates, etc.
      return { status: 'COMPLETED', provisionedAt: new Date().toISOString() };
    },
    {
      connection: getBullMqConnection(),
      concurrency: 5,
    }
  );

  worker.on('completed', (job: Job) => {
    logger.info({ jobId: job.id }, '[TenantWorker] Tenant job completed successfully');
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error({ jobId: job?.id, message: err.message }, '[TenantWorker] Tenant job failed');
  });

  worker.on('error', (err: Error) => {
    logger.warn({ message: err.message }, '[TenantWorker] Worker encountered error (Redis may be offline)');
  });

  return worker;
}
