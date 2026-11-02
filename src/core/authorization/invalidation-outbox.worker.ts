import { PrismaClient, Prisma, RbacInvalidationOutbox } from '@prisma/client';
import { Redis } from 'ioredis';
import { prisma as defaultPrisma } from '../database/prisma-client';
import { getRedisClient, isRedisReachable } from '../../jobs/queues/redis-connection';
import { logger } from '../logger/app-logger';

export interface InvalidationEventInput {
  eventType: string; // e.g., 'ROLE_CREATED', 'ROLE_UPDATED', 'ROLE_DELETED', 'PERMISSIONS_UPDATED', 'USER_ROLE_ASSIGNED', 'USER_ROLE_REVOKED'
  organizationId: string;
  userId?: string | null;
}

/**
 * Transactionally records an RBAC invalidation event into platform.rbac_invalidation_outbox.
 * MUST be called inside the same Prisma transaction as the role/assignment mutation.
 */
export async function recordInvalidationEvent(
  tx: Prisma.TransactionClient | PrismaClient,
  event: InvalidationEventInput
): Promise<RbacInvalidationOutbox> {
  return (tx as any).rbacInvalidationOutbox.create({
    data: {
      eventType: event.eventType,
      organizationId: event.organizationId,
      userId: event.userId || null,
      processed: false,
    },
  });
}

/**
 * Worker state for polling
 */
let pollingTimer: NodeJS.Timeout | null = null;
let isProcessing = false;

/**
 * Processes a batch of pending invalidation events from platform.rbac_invalidation_outbox.
 * Updates Redis version counters and marks events as processed.
 */
export async function processPendingInvalidations(
  prismaClient: PrismaClient = defaultPrisma,
  redisClient?: Redis,
  batchSize = 50,
  checkRedis?: () => Promise<boolean>
): Promise<number> {
  if (isProcessing) {
    return 0;
  }

  isProcessing = true;
  try {
    const pendingEvents: RbacInvalidationOutbox[] = await (prismaClient as any).rbacInvalidationOutbox.findMany({
      where: { processed: false },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });

    if (!pendingEvents || pendingEvents.length === 0) {
      return 0;
    }

    const client = redisClient || getRedisClient();
    const redisAvailable = checkRedis ? await checkRedis() : (redisClient ? true : await isRedisReachable(400));

    if (redisAvailable) {
      const pipeline = client.pipeline();
      const orgIdsToBump = new Set<string>();
      const userOrgPairsToBump = new Set<string>();

      for (const ev of pendingEvents) {
        if (ev.userId) {
          userOrgPairsToBump.add(`${ev.userId}:${ev.organizationId}`);
        }
        // Role modifications or events without specific user bump the whole organization
        if (!ev.userId || ev.eventType.startsWith('ROLE_')) {
          orgIdsToBump.add(ev.organizationId);
        }
      }

      for (const orgId of orgIdsToBump) {
        pipeline.incr(`rbac:v:org:${orgId}`);
      }

      for (const pair of userOrgPairsToBump) {
        pipeline.incr(`rbac:v:user:${pair}`);
      }

      await pipeline.exec();
    } else {
      logger.debug(
        '[RBAC Outbox] Redis unavailable. Version counters will be refreshed upon cache miss/direct DB evaluation.'
      );
    }

    // Mark processed
    const processedIds = pendingEvents.map((e) => e.id);
    await (prismaClient as any).rbacInvalidationOutbox.updateMany({
      where: { id: { in: processedIds } },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });

    return processedIds.length;
  } catch (error) {
    logger.error({ err: error }, '[RBAC Outbox] Error processing pending invalidation events');
    return 0;
  } finally {
    isProcessing = false;
  }
}

/**
 * Starts periodic polling for pending outbox events.
 */
export function startOutboxPolling(intervalMs = 3000): void {
  if (pollingTimer) return;

  pollingTimer = setInterval(async () => {
    try {
      await processPendingInvalidations();
    } catch (err) {
      logger.error({ err }, '[RBAC Outbox] Polling tick error');
    }
  }, intervalMs);

  // Unref timer so it does not block Node process termination in tests or graceful shutdown
  pollingTimer.unref();
  logger.info(`[RBAC Outbox] Background polling started (interval: ${intervalMs}ms)`);
}

/**
 * Stops periodic polling for pending outbox events.
 */
export function stopOutboxPolling(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    logger.info('[RBAC Outbox] Background polling stopped');
  }
}
