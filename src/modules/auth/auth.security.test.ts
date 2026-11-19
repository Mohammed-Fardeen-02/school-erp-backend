import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  securityPolicyRepository,
  DEFAULT_SECURITY_POLICY,
} from './security-policy.repository';
import {
  updateSecurityPolicySchema,
  authActivityQuerySchema,
  sessionQuerySchema,
} from './auth.validation';
import { authService } from './auth.service';
import { prisma } from '../../core/database/prisma-client';
import { sessionsRepository } from './sessions.repository';
import { usersRepository } from '../users/users.repository';

describe('Stage 4: Authentication, Device Security & Session Revocation', () => {
  const orgId = 'org-test-security-123';
  const userId = 'usr-teacher-001';
  const platformAdminId = 'usr-platform-admin-001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Security Policies Repository & Validation', () => {
    it('should return the hardened default policy for an unconfigured organization', async () => {
      const policy = await securityPolicyRepository.findByOrganizationId('org-new-001');
      expect(policy).toBeDefined();
      expect(policy.minPasswordLength).toBe(10);
      expect(policy.requireUppercase).toBe(true);
      expect(policy.requireNumbers).toBe(true);
      expect(policy.requireSpecialChars).toBe(true);
      expect(policy.sessionTimeoutMinutes).toBe(30);
      expect(policy.twoFactorPolicy).toBe('OPTIONAL');
    });

    it('should update organization security policies and enforce minimum 8 characters', async () => {
      const updated = await securityPolicyRepository.update(orgId, {
        minPasswordLength: 6, // Should be clamped to at least 8
        requireNumbers: true,
        sessionTimeoutMinutes: 15,
        twoFactorPolicy: 'OPTIONAL',
      });

      expect(updated.minPasswordLength).toBe(8);
      expect(updated.sessionTimeoutMinutes).toBe(15);
      expect(updated.twoFactorPolicy).toBe('OPTIONAL');

      // Verify retrieval returns the updated policy
      const retrieved = await securityPolicyRepository.findByOrganizationId(orgId);
      expect(retrieved.sessionTimeoutMinutes).toBe(15);
      expect(retrieved.twoFactorPolicy).toBe('OPTIONAL');
    });

    it('should reject unsupported MFA policies (ADMIN_ONLY, MANDATORY) until TOTP engine is implemented', async () => {
      await expect(
        securityPolicyRepository.update(orgId, { twoFactorPolicy: 'ADMIN_ONLY' as any })
      ).rejects.toThrow(/unsupported because TOTP enrollment is pending/);

      await expect(
        securityPolicyRepository.update(orgId, { twoFactorPolicy: 'MANDATORY' as any })
      ).rejects.toThrow(/unsupported because TOTP enrollment is pending/);

      // Schema validation should also reject
      expect(() =>
        updateSecurityPolicySchema.parse({ twoFactorPolicy: 'ADMIN_ONLY' })
      ).toThrow();
      expect(() =>
        updateSecurityPolicySchema.parse({ twoFactorPolicy: 'MANDATORY' })
      ).toThrow();
      expect(
        updateSecurityPolicySchema.parse({ twoFactorPolicy: 'OPTIONAL' }).twoFactorPolicy
      ).toBe('OPTIONAL');
    });

    it('should validate passwords according to the active policy', () => {
      const policy = {
        ...DEFAULT_SECURITY_POLICY,
        minPasswordLength: 10,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
      };

      // Fails length
      const shortRes = securityPolicyRepository.validatePassword('Aa1!', policy);
      expect(shortRes.valid).toBe(false);
      expect(shortRes.errors.some(e => e.includes('at least 10 characters'))).toBe(true);

      // Fails special chars
      const noSpecial = securityPolicyRepository.validatePassword('Password12345', policy);
      expect(noSpecial.valid).toBe(false);
      expect(noSpecial.errors.some(e => e.includes('special character'))).toBe(true);

      // Fails uppercase
      const noUpper = securityPolicyRepository.validatePassword('password12345!', policy);
      expect(noUpper.valid).toBe(false);
      expect(noUpper.errors.some(e => e.includes('uppercase letter'))).toBe(true);

      // Compliant password
      const validRes = securityPolicyRepository.validatePassword('SchoolAdmin#2026', policy);
      expect(validRes.valid).toBe(true);
      expect(validRes.errors).toHaveLength(0);
    });

    it('should validate policy update payload via updateSecurityPolicySchema', () => {
      const valid = updateSecurityPolicySchema.safeParse({
        minPasswordLength: 12,
        requireUppercase: true,
        sessionTimeoutMinutes: 60,
        twoFactorPolicy: 'OPTIONAL',
      });
      expect(valid.success).toBe(true);

      const invalidLength = updateSecurityPolicySchema.safeParse({
        minPasswordLength: 4, // Below min 8
      });
      expect(invalidLength.success).toBe(false);

      const invalidMfa = updateSecurityPolicySchema.safeParse({
        twoFactorPolicy: 'INVALID_ENUM',
      });
      expect(invalidMfa.success).toBe(false);
    });
  });

  describe('Organization Active Sessions & Discovery', () => {
    it('should list active sessions with device telemetry and currentSession detection', async () => {
      const mockSessions: any[] = [
        {
          id: 'sess-001',
          userId: 'usr-1',
          familyId: 'fam-1',
          deviceInfo: 'Chrome 131 on Windows 11',
          ipAddress: '192.168.1.10',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          isRevoked: false,
          createdAt: new Date('2026-11-19T08:00:00Z'),
          expiresAt: new Date('2026-11-26T08:00:00Z'),
          user: {
            id: 'usr-1',
            firstName: 'Sarah',
            lastName: 'Connor',
            email: 'sarah@school.edu',
            userType: 'TENANT',
          },
        },
        {
          id: 'sess-002',
          userId: 'usr-2',
          familyId: 'fam-2',
          deviceInfo: null,
          ipAddress: '10.0.0.5',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
          isRevoked: false,
          createdAt: new Date('2026-11-19T09:00:00Z'),
          expiresAt: new Date('2026-11-26T09:00:00Z'),
          user: {
            id: 'usr-2',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@school.edu',
            userType: 'TENANT',
          },
        },
      ];

      vi.spyOn(sessionsRepository, 'findOrganizationActiveSessions').mockResolvedValue(mockSessions);

      const sessions = await authService.getOrganizationSessions({
        organizationId: orgId,
        currentSessionId: 'sess-001',
      });

      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('sess-001');
      expect(sessions[0].isCurrentSession).toBe(true);
      expect(sessions[0].userName).toBe('Sarah Connor');
      expect(sessions[0].userEmail).toBe('sarah@school.edu');
      expect(sessions[0].deviceInfo).toBe('Chrome 131 on Windows 11');

      expect(sessions[1].id).toBe('sess-002');
      expect(sessions[1].isCurrentSession).toBe(false);
      expect(sessions[1].userName).toBe('John Doe');
      expect(sessions[1].deviceInfo).toBe('Mobile Browser / Device');
    });
  });

  describe('Administrative Revocation & Security Boundaries', () => {
    it('should reject tenant administrator attempting to revoke platform operator session', async () => {
      const platformSession: any = {
        id: 'sess-platform-001',
        userId: platformAdminId,
        user: {
          id: platformAdminId,
          email: 'operator@platform.internal',
          userType: 'PLATFORM',
          memberships: [],
        },
      };

      vi.spyOn(sessionsRepository, 'findSessionWithUserById').mockResolvedValue(platformSession);

      await expect(
        authService.adminRevokeSession({
          sessionId: 'sess-platform-001',
          organizationId: orgId,
          actorUserId: userId,
          isPlatformOperator: false, // Tenant admin
        })
      ).rejects.toThrow('Tenant administrators are not permitted to terminate platform operator sessions.');
    });

    it('should reject revoking a session that belongs to a user outside the active organization', async () => {
      const foreignSession: any = {
        id: 'sess-foreign-001',
        userId: 'usr-other-org',
        user: {
          id: 'usr-other-org',
          email: 'foreign@other.edu',
          userType: 'TENANT',
          memberships: [
            { organizationId: 'other-org-id', status: 'ACTIVE' },
          ],
        },
      };

      vi.spyOn(sessionsRepository, 'findSessionWithUserById').mockResolvedValue(foreignSession);

      await expect(
        authService.adminRevokeSession({
          sessionId: 'sess-foreign-001',
          organizationId: orgId,
          actorUserId: userId,
          isPlatformOperator: false,
        })
      ).rejects.toThrow('Target session does not belong to an active member of your organization.');
    });

    it('should successfully revoke session and write audit log for a valid member', async () => {
      const validSession: any = {
        id: 'sess-valid-001',
        userId: 'usr-member-001',
        user: {
          id: 'usr-member-001',
          email: 'member@school.edu',
          userType: 'TENANT',
          memberships: [
            { organizationId: orgId, status: 'ACTIVE' },
          ],
        },
      };

      vi.spyOn(sessionsRepository, 'findSessionWithUserById').mockResolvedValue(validSession);
      const revokeSpy = vi.spyOn(sessionsRepository, 'revokeSession').mockResolvedValue({} as any);
      const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      await authService.adminRevokeSession({
        sessionId: 'sess-valid-001',
        organizationId: orgId,
        actorUserId: userId,
        isPlatformOperator: false,
      });

      expect(revokeSpy).toHaveBeenCalledWith('sess-valid-001', 'ADMIN_TERMINATED_SESSION');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ADMIN_REVOKED_SESSION',
            entity: 'Session',
            entityId: 'sess-valid-001',
          }),
        })
      );
    });

    it('should revoke all user sessions and atomically bump tokenVersion', async () => {
      const targetUser: any = {
        id: 'usr-target-001',
        email: 'target@school.edu',
        userType: 'TENANT',
      };

      vi.spyOn(usersRepository, 'findById').mockResolvedValue(targetUser);
      vi.spyOn(prisma.organizationMembership, 'findFirst').mockResolvedValue({
        id: 'mem-1',
        userId: targetUser.id,
        organizationId: orgId,
        status: 'ACTIVE',
      } as any);

      const tokenVersionSpy = vi.spyOn(usersRepository, 'incrementTokenVersion').mockResolvedValue({} as any);
      const revokeAllSpy = vi.spyOn(sessionsRepository, 'revokeAllUserSessions').mockResolvedValue(3);
      const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      const result = await authService.adminRevokeUserSessions({
        targetUserId: targetUser.id,
        organizationId: orgId,
        actorUserId: userId,
        isPlatformOperator: false,
      });

      expect(result.revokedCount).toBe(3);
      expect(tokenVersionSpy).toHaveBeenCalledWith(targetUser.id);
      expect(revokeAllSpy).toHaveBeenCalledWith(targetUser.id, undefined, 'ADMIN_TERMINATED_ALL_SESSIONS');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ADMIN_REVOKED_ALL_USER_SESSIONS',
            entity: 'User',
            entityId: targetUser.id,
          }),
        })
      );
    });
  });

  describe('Authentication Activity Forensics', () => {
    it('should query audit logs scoped to the active organization', async () => {
      const mockAuditLogs: any[] = [
        {
          id: 'aud-001',
          organizationId: orgId,
          userId: 'usr-1',
          action: 'LOGIN_SUCCESS',
          entity: 'User',
          entityId: 'usr-1',
          previousState: null,
          newState: { sessionId: 'sess-001' },
          ipAddress: '192.168.1.10',
          userAgent: 'Chrome 131',
          createdAt: new Date('2026-11-19T08:00:00Z'),
          user: {
            id: 'usr-1',
            firstName: 'Sarah',
            lastName: 'Connor',
            email: 'sarah@school.edu',
          },
        },
        {
          id: 'aud-002',
          organizationId: orgId,
          userId: 'usr-1',
          action: 'ADMIN_REVOKED_SESSION',
          entity: 'Session',
          entityId: 'sess-999',
          previousState: null,
          newState: { reason: 'ADMIN_TERMINATED_SESSION' },
          ipAddress: '192.168.1.10',
          userAgent: 'Chrome 131',
          createdAt: new Date('2026-11-19T08:30:00Z'),
          user: null,
        },
      ];

      vi.spyOn(prisma.auditLog, 'count').mockResolvedValue(2);
      vi.spyOn(prisma.auditLog, 'findMany').mockResolvedValue(mockAuditLogs);

      const result = await authService.getAuthenticationActivity({
        organizationId: orgId,
        action: 'ALL',
        page: 1,
        limit: 10,
      });

      expect(result.total).toBe(2);
      expect(result.logs).toHaveLength(2);
      expect(result.logs[0].action).toBe('LOGIN_SUCCESS');
      expect(result.logs[0].actorName).toBe('Sarah Connor');
      expect(result.logs[0].actorEmail).toBe('sarah@school.edu');
      expect(result.logs[1].action).toBe('ADMIN_REVOKED_SESSION');
      expect(result.logs[1].actorName).toBe('System Security');
    });
  });

  describe('Dynamic Policy Enforcement & RBAC Guards (Stage 4.1)', () => {
    it('should enforce dynamic failed login thresholds and lockout duration from active org policy', async () => {
      await securityPolicyRepository.update(orgId, {
        maxFailedLoginsBeforeLockout: 3,
        lockoutDurationMinutes: 45,
      });

      const mockUser: any = {
        id: 'usr-dynamic-lockout',
        email: 'lockout@school.edu',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$dummyhash',
        isActive: true,
        userType: 'TENANT',
        tokenVersion: 1,
      };

      vi.spyOn(usersRepository, 'findByEmail').mockResolvedValue(mockUser);
      vi.spyOn(prisma.organizationMembership, 'findFirst').mockResolvedValue({
        organizationId: orgId,
        status: 'ACTIVE',
      } as any);

      const lockoutSpy = vi.spyOn(usersRepository, 'atomicIncrementFailedLogins').mockResolvedValue({
        failedLogins: 3,
        isLocked: true,
        lockedUntil: new Date(Date.now() + 45 * 60 * 1000),
      });

      vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);

      await expect(
        authService.login({
          email: 'lockout@school.edu',
          password: 'WrongPassword123!',
          ipAddress: '127.0.0.1',
          userAgent: 'TestAgent',
        })
      ).rejects.toThrow(/temporarily locked due to 3 consecutive failed login attempts.*45 minute/i);

      expect(lockoutSpy).toHaveBeenCalledWith('usr-dynamic-lockout', 3, 45);
    });

    it('should set session expiration dynamically based on org policy sessionTimeoutMinutes', async () => {
      await securityPolicyRepository.update(orgId, {
        sessionTimeoutMinutes: 45,
      });

      const mockUser: any = {
        id: 'usr-timeout-test',
        email: 'timeout@school.edu',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$dummyhash',
        isActive: true,
        userType: 'TENANT',
        tokenVersion: 1,
        mustChangePassword: false,
        updatedAt: new Date(),
      };

      vi.spyOn(usersRepository, 'findByEmail').mockResolvedValue(mockUser);
      vi.spyOn(prisma.organizationMembership, 'findFirst').mockResolvedValue({
        organizationId: orgId,
        status: 'ACTIVE',
      } as any);
      vi.spyOn(usersRepository, 'atomicResetFailedLogins').mockResolvedValue();

      let createdExpiresAt: Date | undefined;
      vi.spyOn(sessionsRepository, 'createSession').mockImplementation(async (params) => {
        createdExpiresAt = params.expiresAt;
        return {
          session: {
            id: 'sess-timeout-1',
            userId: mockUser.id,
            familyId: params.familyId,
            expiresAt: params.expiresAt,
          } as any,
          refreshToken: {} as any,
        };
      });

      const pwdModule = await import('../../core/security/password');
      vi.spyOn(pwdModule, 'verifyPassword').mockResolvedValue(true);

      const loginRes = await authService.login({
        email: 'timeout@school.edu',
        password: 'ValidPassword123!',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent',
      });

      expect(loginRes).toBeDefined();
      expect(createdExpiresAt).toBeDefined();
      const diffMinutes = Math.round((createdExpiresAt!.getTime() - Date.now()) / (60 * 1000));
      expect(diffMinutes).toBe(45);
    });

    it('should set mustChangePassword to true when user password has expired under policy', async () => {
      await securityPolicyRepository.update(orgId, {
        passwordExpiryDays: 30,
      });

      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
      const mockUser: any = {
        id: 'usr-pwd-expired',
        email: 'expired@school.edu',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash$dummyhash',
        isActive: true,
        userType: 'TENANT',
        tokenVersion: 1,
        mustChangePassword: false,
        updatedAt: oldDate,
      };

      vi.spyOn(usersRepository, 'findByEmail').mockResolvedValue(mockUser);
      vi.spyOn(prisma.organizationMembership, 'findFirst').mockResolvedValue({
        organizationId: orgId,
        status: 'ACTIVE',
      } as any);
      vi.spyOn(usersRepository, 'atomicResetFailedLogins').mockResolvedValue();
      const userUpdateSpy = vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any);

      vi.spyOn(sessionsRepository, 'createSession').mockResolvedValue({
        session: { id: 'sess-exp', userId: mockUser.id, expiresAt: new Date() } as any,
        refreshToken: {} as any,
      });

      const pwdModule = await import('../../core/security/password');
      vi.spyOn(pwdModule, 'verifyPassword').mockResolvedValue(true);

      const loginRes = await authService.login({
        email: 'expired@school.edu',
        password: 'ValidPassword123!',
      });

      expect(loginRes.user.mustChangePassword).toBe(true);
      expect(userUpdateSpy).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { mustChangePassword: true },
      });
    });

    it('should protect administrative Stage 4 endpoints with requirePermission middleware', async () => {
      const { authRoutes } = await import('./auth.routes');

      const adminRoutes = [
        { path: '/organization-sessions', method: 'get' },
        { path: '/organization-sessions/:sessionId', method: 'delete' },
        { path: '/organization-users/:userId/sessions', method: 'delete' },
        { path: '/policies', method: 'get' },
        { path: '/policies', method: 'put' },
        { path: '/activity', method: 'get' },
      ];

      for (const expected of adminRoutes) {
        const route = authRoutes.stack.find(
          (layer: any) =>
            layer.route &&
            layer.route.path === expected.path &&
            layer.route.methods[expected.method]
        );
        expect(route, `Route ${expected.method.toUpperCase()} ${expected.path} should exist`).toBeDefined();
        expect(route.route.stack.length).toBeGreaterThanOrEqual(4);
      }
    });
  });
});

