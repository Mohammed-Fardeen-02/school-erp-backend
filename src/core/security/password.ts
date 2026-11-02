import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Dynamically attempt to load argon2 (native module) with fallback to bcryptjs
// to ensure zero build/runtime disruption across diverse local and containerized environments.
let argon2: typeof import('argon2') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  argon2 = require('argon2');
} catch {
  // Fallback to bcryptjs work factor 12 if argon2 native binary is compiling or not yet linked
}

export const ARGON2_CONFIG = {
  type: 2, // argon2id
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

/**
 * Hashes a plaintext password using Argon2id (with bcrypt work factor 12 fallback)
 */
export async function hashPassword(password: string): Promise<string> {
  if (argon2) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: ARGON2_CONFIG.memoryCost,
      timeCost: ARGON2_CONFIG.timeCost,
      parallelism: ARGON2_CONFIG.parallelism,
    });
  }
  return bcrypt.hash(password, 12);
}

/**
 * Verifies a plaintext password against a stored hash (supports Argon2id and bcrypt)
 */
export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  try {
    if (argon2 && hash.startsWith('$argon2')) {
      return await argon2.verify(hash, plainText);
    }
    return await bcrypt.compare(plainText, hash);
  } catch {
    return false;
  }
}

/**
 * Computes a SHA-256 cryptographic hash of a token (e.g. refresh token or password reset token)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a cryptographically secure random hex token
 */
export function generateSecureRandomToken(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Generates a secure random password for initial bootstrap
 */
export function generateBootstrapPassword(length: number = 24): string {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

