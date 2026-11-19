export interface SecurityPolicyConfig {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  passwordExpiryDays: number;
  sessionTimeoutMinutes: number;
  maxFailedLoginsBeforeLockout: number;
  lockoutDurationMinutes: number;
  twoFactorPolicy: 'OPTIONAL' | 'ADMIN_ONLY' | 'MANDATORY';
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicyConfig = {
  minPasswordLength: 10,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  passwordExpiryDays: 90,
  sessionTimeoutMinutes: 30,
  maxFailedLoginsBeforeLockout: 5,
  lockoutDurationMinutes: 15,
  twoFactorPolicy: 'OPTIONAL',
};

// In-memory tenant-scoped policy cache keyed by organizationId
const policyStore = new Map<string, SecurityPolicyConfig>();

export class SecurityPolicyRepository {
  /**
   * Retrieves security policies for a given organization ID.
   * If not explicitly customized, returns the hardened default policy.
   */
  async findByOrganizationId(organizationId: string): Promise<SecurityPolicyConfig> {
    const policy = policyStore.get(organizationId);
    if (!policy) {
      // Store a clone of the default policy for isolation
      const initial = { ...DEFAULT_SECURITY_POLICY };
      policyStore.set(organizationId, initial);
      return initial;
    }
    return { ...policy };
  }

  /**
   * Updates and persists security policies for an organization.
   */
  async update(organizationId: string, updates: Partial<SecurityPolicyConfig>): Promise<SecurityPolicyConfig> {
    const current = await this.findByOrganizationId(organizationId);
    const updated: SecurityPolicyConfig = {
      ...current,
      ...updates,
      // Ensure minPasswordLength cannot be less than 8
      minPasswordLength: updates.minPasswordLength !== undefined
        ? Math.max(8, updates.minPasswordLength)
        : current.minPasswordLength,
    };
    policyStore.set(organizationId, updated);
    return { ...updated };
  }

  /**
   * Validates a password against an organization's active security policy.
   */
  validatePassword(password: string, policy: SecurityPolicyConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!password || password.length < policy.minPasswordLength) {
      errors.push(`Password must be at least ${policy.minPasswordLength} characters long`);
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter (A-Z)');
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter (a-z)');
    }

    if (policy.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one numeric digit (0-9)');
    }

    if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      errors.push('Password must contain at least one special character (!@#$%^&*...)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const securityPolicyRepository = new SecurityPolicyRepository();
