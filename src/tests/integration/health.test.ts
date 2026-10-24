import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app';

describe('Health and System Endpoints', () => {
  it('GET /health should return 200/503 with standard health status payload and x-request-id', async () => {
    const response = await request(app).get('/health');

    // Should return either 200 (if local postgres running) or 503 (if db disconnected in offline test env)
    expect([200, 503]).toContain(response.status);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('version');
    expect(response.body.data).toHaveProperty('services');
    expect(response.body.data.services).toHaveProperty('database');
  });

  it('GET /api/v1/health should respond under API prefix route', async () => {
    const response = await request(app).get('/api/v1/health');

    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('version');
  });

  it('GET /non-existent-endpoint should return standard 404 AppError JSON contract', async () => {
    const response = await request(app).get('/non-existent-endpoint');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot GET /non-existent-endpoint - Route not found',
      },
      timestamp: expect.any(String),
    });
  });
});
