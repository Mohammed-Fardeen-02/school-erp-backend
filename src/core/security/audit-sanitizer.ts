const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'tokenhash',
  'token_hash',
  'passwordresethash',
  'password_reset_hash',
  'passwordresettoken',
  'password_reset_token',
  'authorization',
  'secret',
  'jwt_access_secret',
  'jwt_refresh_secret',
]);

/**
 * Recursively redacts sensitive fields (passwords, hashes, tokens) from audit objects.
 */
export function sanitizeAuditData<T>(data: T): T {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeAuditData(item)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();

    if (SENSITIVE_KEYS.has(normalizedKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeAuditData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

export const sanitizeAuditPayload = sanitizeAuditData;

