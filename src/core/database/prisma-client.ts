import { PrismaClient } from '@prisma/client';
import { env } from '../../config/env';

declare global {
  var __prisma: PrismaClient | undefined;
}

// In development, preserve the client across hot-reloads to avoid exhausting database connections.
export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export default prisma;
