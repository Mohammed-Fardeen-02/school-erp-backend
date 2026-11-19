import { describe, it, expect } from 'vitest';
import { sanitizeAuditPayload, isSensitiveKey } from './audit-sanitizer';

describe('Audit Payload Sanitizer Suite (Stage 5.2)', () => {
  it('correctly identifies sensitive keys across various naming styles', () => {
    // Passwords
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('userPassword')).toBe(true);
    expect(isSensitiveKey('password_hash')).toBe(true);
    expect(isSensitiveKey('passwordHash')).toBe(true);
    expect(isSensitiveKey('smtp_password')).toBe(true);
    expect(isSensitiveKey('smtpPassword')).toBe(true);
    expect(isSensitiveKey('old-password')).toBe(true);

    // API Keys & Secrets
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('api_key')).toBe(true);
    expect(isSensitiveKey('secret')).toBe(true);
    expect(isSensitiveKey('clientSecret')).toBe(true);
    expect(isSensitiveKey('client_secret')).toBe(true);
    expect(isSensitiveKey('razorpaySecret')).toBe(true);
    expect(isSensitiveKey('privateKey')).toBe(true);
    expect(isSensitiveKey('private_key')).toBe(true);
    expect(isSensitiveKey('encryptionKey')).toBe(true);

    // Tokens
    expect(isSensitiveKey('token')).toBe(true);
    expect(isSensitiveKey('accessToken')).toBe(true);
    expect(isSensitiveKey('access_token')).toBe(true);
    expect(isSensitiveKey('refreshToken')).toBe(true);
    expect(isSensitiveKey('refresh_token')).toBe(true);
    expect(isSensitiveKey('invitationToken')).toBe(true);
    expect(isSensitiveKey('resetToken')).toBe(true);
    expect(isSensitiveKey('tokenHash')).toBe(true);

    // Headers & Credentials
    expect(isSensitiveKey('authorization')).toBe(true);
    expect(isSensitiveKey('cookie')).toBe(true);
    expect(isSensitiveKey('credentials')).toBe(true);
  });

  it('avoids false positives for benign fields containing token or key substrings', () => {
    expect(isSensitiveKey('keyboard')).toBe(false);
    expect(isSensitiveKey('monetary')).toBe(false);
    expect(isSensitiveKey('keynote')).toBe(false);
    expect(isSensitiveKey('tokenCount')).toBe(false);
    expect(isSensitiveKey('total_tokens')).toBe(false);
    expect(isSensitiveKey('username')).toBe(false);
    expect(isSensitiveKey('email')).toBe(false);
    expect(isSensitiveKey('id')).toBe(false);
  });

  it('redacts sensitive fields in deeply nested structures without mutating original', () => {
    const rawPayload = {
      user: {
        id: 'usr_123',
        email: 'admin@school.edu',
        password: 'super-secret-password-123',
        nestedSecurity: {
          apiKey: 'pk_live_12345678',
          tokens: {
            accessToken: 'jwt.token.here',
            refreshToken: 'refresh.token.here',
          },
        },
      },
      smtpConfig: {
        host: 'smtp.sendgrid.net',
        port: 587,
        smtpPassword: 'sendgrid-password-xyz',
      },
      metadata: {
        keyboard: 'US-Layout',
        tokenCount: 1500,
      },
    };

    const sanitized = sanitizeAuditPayload(rawPayload);

    // Verify redactions
    expect((sanitized as any).user.password).toBe('[REDACTED]');
    expect((sanitized as any).user.nestedSecurity.apiKey).toBe('[REDACTED]');
    expect((sanitized as any).user.nestedSecurity.tokens.accessToken).toBe('[REDACTED]');
    expect((sanitized as any).user.nestedSecurity.tokens.refreshToken).toBe('[REDACTED]');
    expect((sanitized as any).smtpConfig.smtpPassword).toBe('[REDACTED]');

    // Verify non-sensitive fields preserved
    expect((sanitized as any).user.id).toBe('usr_123');
    expect((sanitized as any).user.email).toBe('admin@school.edu');
    expect((sanitized as any).smtpConfig.host).toBe('smtp.sendgrid.net');
    expect((sanitized as any).metadata.keyboard).toBe('US-Layout');
    expect((sanitized as any).metadata.tokenCount).toBe(1500);

    // Verify original object was NOT mutated
    expect(rawPayload.user.password).toBe('super-secret-password-123');
    expect(rawPayload.smtpConfig.smtpPassword).toBe('sendgrid-password-xyz');
  });

  it('handles arrays, dates, nulls, and primitives gracefully', () => {
    const now = new Date();
    const payload = {
      items: [
        { id: 1, secret: 'top-secret' },
        { id: 2, secret: 'classified' },
      ],
      createdAt: now,
      nullField: null,
      undefinedField: undefined,
      primitiveNum: 42,
      primitiveBool: true,
      primitiveStr: 'hello',
    };

    const sanitized = sanitizeAuditPayload(payload);

    expect(sanitized.items[0].secret).toBe('[REDACTED]');
    expect(sanitized.items[1].secret).toBe('[REDACTED]');
    expect(sanitized.items[0].id).toBe(1);
    expect(sanitized.createdAt).toBeInstanceOf(Date);
    expect(sanitized.createdAt.getTime()).toBe(now.getTime());
    expect(sanitized.nullField).toBeNull();
    expect(sanitized.undefinedField).toBeUndefined();
    expect(sanitized.primitiveNum).toBe(42);
    expect(sanitized.primitiveBool).toBe(true);
    expect(sanitized.primitiveStr).toBe('hello');
  });
});
