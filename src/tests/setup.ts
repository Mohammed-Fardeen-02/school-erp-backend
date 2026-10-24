import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

beforeAll(async () => {
  // Test environment initializations
  process.env.NODE_ENV = 'test';
});

afterAll(async () => {
  // Global test teardown
});
