import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address format'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters long')
    .max(128, 'Password must not exceed 128 characters'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters long')
    .max(128, 'Password must not exceed 128 characters'),
});

export const updateSecurityPolicySchema = z.object({
  minPasswordLength: z.number().int().min(8).max(64).optional(),
  requireUppercase: z.boolean().optional(),
  requireLowercase: z.boolean().optional(),
  requireNumbers: z.boolean().optional(),
  requireSpecialChars: z.boolean().optional(),
  passwordExpiryDays: z.number().int().min(0).max(365).optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  maxFailedLoginsBeforeLockout: z.number().int().min(3).max(20).optional(),
  lockoutDurationMinutes: z.number().int().min(1).max(1440).optional(),
  twoFactorPolicy: z
    .enum(['OPTIONAL', 'ADMIN_ONLY', 'MANDATORY'])
    .refine((val) => val === 'OPTIONAL', {
      message:
        "Two-factor policies 'ADMIN_ONLY' and 'MANDATORY' are currently unsupported because TOTP enrollment is pending. Only 'OPTIONAL' is permitted.",
    })
    .optional(),
});

export const authActivityQuerySchema = z.object({
  search: z.string().optional(),
  action: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
});

export const sessionQuerySchema = z.object({
  search: z.string().optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  page: z.coerce.number().int().positive().optional().default(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateSecurityPolicyInput = z.infer<typeof updateSecurityPolicySchema>;
export type AuthActivityQueryInput = z.infer<typeof authActivityQuerySchema>;
export type SessionQueryInput = z.infer<typeof sessionQuerySchema>;

