import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../app';
import { env } from '../../config/env';
import { prisma } from '../../core/database/prisma-client';

vi.mock('../../core/database/prisma-client', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe('Settings Module - Tenant Configuration API', () => {
  let token: string;

  beforeEach(() => {
    vi.clearAllMocks();

    token = jwt.sign(
      {
        sub: 'super-admin-user-id',
        email: 'admin@erp.com',
        userType: 'PLATFORM',
        roles: ['SUPER_ADMIN'],
        tokenVersion: 1,
      },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    vi.mocked((prisma as any).user.findUnique).mockResolvedValue({
      id: 'super-admin-user-id',
      email: 'admin@erp.com',
      userType: 'PLATFORM',
      isActive: true,
      tokenVersion: 1,
    });

    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      id: 'org-test-uuid-1',
      displayName: 'Greenwood High Academy',
      email: 'admin@greenwood.edu',
      logoUrl: 'https://school.edu/logo.png',
      brandColor: '#2563eb',
    } as any);
  });

  describe('GET /api/v1/settings/tenant-config', () => {
    it('returns 200 with default tenant configuration and sanitized credentials', async () => {
      const response = await request(app)
        .get('/api/v1/settings/tenant-config')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-test-uuid-1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.organizationId).toBe('org-test-uuid-1');
      expect(response.body.data.smtp).toBeDefined();
      expect(response.body.data.storage).toBeDefined();
      expect(response.body.data.razorpay).toBeDefined();
      expect(response.body.data.theme).toBeDefined();
    });
  });

  describe('PUT /api/v1/settings/tenant-config/:organizationId', () => {
    it('updates tenant configuration and returns sanitized response', async () => {
      const payload = {
        smtp: {
          host: 'smtp.mailgun.org',
          port: 587,
          security: 'STARTTLS',
          username: 'postmaster@greenwood.edu',
          password: 'SecretPassword123!',
          fromAddress: 'notifications@greenwood.edu',
          fromName: 'Greenwood Academy',
        },
        theme: {
          institutionName: 'Greenwood International School',
          primaryColor: '#1e40af',
          accentColor: '#d97706',
          defaultTheme: 'LIGHT',
        },
      };

      const response = await request(app)
        .put('/api/v1/settings/tenant-config/org-test-uuid-1')
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.smtp.host).toBe('smtp.mailgun.org');
      expect(response.body.data.smtp.isPasswordSet).toBe(true);
      expect(response.body.data.smtp.password).toBe('********'); // Sanitized!
      expect(response.body.data.theme.institutionName).toBe('Greenwood International School');
      expect(response.body.data.theme.primaryColor).toBe('#1e40af');
    });
  });

  describe('POST /api/v1/settings/test-email', () => {
    it('dispatches a diagnostic test email successfully', async () => {
      const response = await request(app)
        .post('/api/v1/settings/test-email')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-test-uuid-1')
        .send({
          toEmail: 'director@greenwood.edu',
          templateType: 'diagnostic',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('director@greenwood.edu');
    });

    it('rejects invalid recipient email address with 422', async () => {
      const response = await request(app)
        .post('/api/v1/settings/test-email')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-test-uuid-1')
        .send({
          toEmail: 'not-an-email',
        });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/settings/test-storage', () => {
    it('verifies cloud document storage connection', async () => {
      const response = await request(app)
        .post('/api/v1/settings/test-storage')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-test-uuid-1')
        .send({
          provider: 'AWS_S3',
          bucket: 'greenwood-docs-2026',
          region: 'ap-south-1',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('greenwood-docs-2026');
    });
  });

  describe('POST /api/v1/settings/test-razorpay', () => {
    it('verifies valid Razorpay key format', async () => {
      const response = await request(app)
        .post('/api/v1/settings/test-razorpay')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-test-uuid-1')
        .send({
          mode: 'TEST',
          keyId: 'rzp_test_AbCdEf123456',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('rejects invalid Razorpay key format with 400', async () => {
      const response = await request(app)
        .post('/api/v1/settings/test-razorpay')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-test-uuid-1')
        .send({
          mode: 'TEST',
          keyId: 'invalid_key_id',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
