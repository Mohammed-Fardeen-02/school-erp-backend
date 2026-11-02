import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateSecureRandomToken,
} from '../../core/security/password';
import { sanitizeAuditData } from '../../core/security/audit-sanitizer';
import { loginSchema, resetPasswordSchema } from './auth.validation';

describe('Auth Module Security Suite (Phase 1)', () => {
  describe('Password Hashing & Verification (Argon2id / Fallback)', () => {
    it('should hash a password and verify it correctly', async () => {
      const password = 'SuperSecretPassword123!';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);

      const isValid = await verifyPassword(hash, password);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword(hash, 'WrongPassword!');
      expect(isInvalid).toBe(false);
    });

    it('should generate distinct hashes for the same password due to salting', async () => {
      const password = 'ConsistentPassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
      expect(await verifyPassword(hash1, password)).toBe(true);
      expect(await verifyPassword(hash2, password)).toBe(true);
    });
  });

  describe('Cryptographic Token Utilities', () => {
    it('should generate a 32-byte (64 hex characters) secure random token', () => {
      const token = generateSecureRandomToken(32);
      expect(token).toHaveLength(64);
      expect(typeof token).toBe('string');
    });

    it('should generate a deterministic SHA-256 hash of a token', () => {
      const token = 'my-test-token-value';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 is 64 hex characters
    });
  });

  describe('Audit Log Sanitization (Zero-Leak Security)', () => {
    it('should redact sensitive keys from audit log objects', () => {
      const rawAuditData = {
        email: 'user@school.org',
        password: 'PlainTextPassword123',
        password_hash: '$argon2id$v=19$m=65536...',
        token: 'raw-jwt-or-refresh-token',
        tokenHash: 'sha256-hash-value',
        passwordResetHash: 'sha256-reset-hash',
        nested: {
          refreshToken: 'secret-refresh-token',
          safeField: 'SafeMetadataValue',
        },
      };

      const sanitized = sanitizeAuditData(rawAuditData);

      expect(sanitized.email).toBe('user@school.org');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.password_hash).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.tokenHash).toBe('[REDACTED]');
      expect(sanitized.passwordResetHash).toBe('[REDACTED]');
      expect(sanitized.nested.refreshToken).toBe('[REDACTED]');
      expect(sanitized.nested.safeField).toBe('SafeMetadataValue');
    });
  });

  describe('Input Validation Schemas', () => {
    it('should validate valid login credentials and reject invalid emails', () => {
      const valid = loginSchema.safeParse({
        email: 'admin@platform.com',
        password: 'Password123!',
      });
      expect(valid.success).toBe(true);

      const invalidEmail = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'Password123!',
      });
      expect(invalidEmail.success).toBe(false);

      const emptyPassword = loginSchema.safeParse({
        email: 'admin@platform.com',
        password: '',
      });
      expect(emptyPassword.success).toBe(false);
    });

    it('should enforce minimum 8 characters for password reset', () => {
      const short = resetPasswordSchema.safeParse({
        token: 'some-valid-token-string',
        newPassword: 'short',
      });
      expect(short.success).toBe(false);

      const valid = resetPasswordSchema.safeParse({
        token: 'some-valid-token-string',
        newPassword: 'ValidPassword123!',
      });
      expect(valid.success).toBe(true);
    });
  });
});

