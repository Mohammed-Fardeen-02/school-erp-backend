import { AppError } from '../../core/errors/app-error';
import { ErrorCode } from '../../core/errors/error-codes';

/**
 * Executes a transactional database operation with exponential backoff and randomized jitter
 * to gracefully handle concurrent write collisions, PostgreSQL deadlocks (40P01), and lock timeouts (55P03).
 */
export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 50
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      // Prisma P2034 is transaction write conflict / serialization failure
      // PostgreSQL 40P01 is deadlock detected, 55P03 is lock not available
      const isLockCollision =
        error?.code === 'P2034' ||
        error?.code === '40P01' ||
        error?.code === '55P03' ||
        error?.message?.toLowerCase().includes('deadlock') ||
        error?.message?.toLowerCase().includes('could not serialize access');

      if (isLockCollision && attempt < maxRetries) {
        const jitter = Math.random() * 50;
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw new AppError(
    'Concurrent operation collision. Please retry your request.',
    409,
    ErrorCode.CONFLICT
  );
}

