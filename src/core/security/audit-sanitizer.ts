const REDACTION_MARKER = '[REDACTED]';

/**
 * Regex patterns identifying sensitive key names across camelCase, snake_case, and kebab-case.
 */
const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  // Passwords (password, userPassword, old_password, smtpPassword, passwd, pwd, etc.)
  /(?:^|[_-])(?:password|passwd|pwd)(?:[_-]|$)/i,
  /[a-z0-9]Password(?:$|[A-Z0-9])/i,

  // Secrets & Private Keys (secret, clientSecret, apiSecret, privateKey, encryptionKey, etc.)
  /(?:^|[_-])(?:secret|client_secret|client-secret|private_key|private-key|encryption_key|encryption-key)(?:[_-]|$)/i,
  /[a-z0-9](?:Secret|PrivateKey|EncryptionKey)(?:$|[A-Z0-9])/,

  // API Keys (apiKey, api_key, api-key, etc.)
  /(?:^|[_-])(?:api_key|api-key|apikey)(?:[_-]|$)/i,
  /[a-z0-9]ApiKey(?:$|[A-Z0-9])/,

  // Authentication & Session Tokens (accessToken, refreshToken, invitationToken, resetToken, tokenHash)
  /(?:^|[_-])(?:access_token|access-token|refresh_token|refresh-token|invitation_token|invitation-token|reset_token|reset-token|token_hash|token-hash|auth_token|auth-token|session_token|session-token)(?:[_-]|$)/i,
  /[a-z0-9](?:AccessToken|RefreshToken|InvitationToken|ResetToken|TokenHash|AuthToken|SessionToken)(?:$|[A-Z0-9])/,

  // Generic exact token or hash fields
  /^(?:token|tokenhash|token_hash|token-hash)$/i,

  // Headers & credentials
  /^(?:authorization|auth_header|auth-header|cookie|cookies|credentials|credential)$/i,
];

/**
 * Normalized key lookup set for O(1) matching of standard credential keys.
 */
const EXACT_SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'passwd',
  'pwd',
  'apikey',
  'api_key',
  'secret',
  'clientsecret',
  'client_secret',
  'smtppassword',
  'smtp_password',
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
  'invitationtoken',
  'invitation_token',
  'resettoken',
  'reset_token',
  'privatekey',
  'private_key',
  'encryptionkey',
  'encryption_key',
  'authorization',
  'cookie',
  'cookies',
  'credentials',
  'jwt_access_secret',
  'jwt_refresh_secret',
]);

/**
 * Non-sensitive keys that contain tokens or keys but should NOT be redacted.
 */
const SAFE_EXEMPTION_KEYS = new Set([
  'tokencount',
  'token_count',
  'totaltokens',
  'total_tokens',
  'keyboard',
  'monetary',
  'keynote',
]);

/**
 * Checks if a given property key is sensitive and requires redaction.
 */
export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  const normalized = key.toLowerCase().replace(/[-_.]/g, '');
  if (SAFE_EXEMPTION_KEYS.has(normalized)) {
    return false;
  }

  if (EXACT_SENSITIVE_KEYS.has(normalized)) {
    return true;
  }

  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Recursively redacts sensitive fields (passwords, hashes, tokens, credentials)
 * from audit objects without mutating the input object.
 */
export function sanitizeAuditData<T>(data: T): T {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data;
  }

  // Preserve non-plain object primitives (Dates, RegExps)
  if (data instanceof Date) {
    return new Date(data.getTime()) as unknown as T;
  }
  if (data instanceof RegExp) {
    return data;
  }

  // Handle arrays recursively
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item)) as unknown as T;
  }

  // Handle plain objects
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = REDACTION_MARKER;
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeAuditData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

export const sanitizeAuditPayload = sanitizeAuditData;
