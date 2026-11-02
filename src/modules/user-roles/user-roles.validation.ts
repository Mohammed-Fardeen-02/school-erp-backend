import { z } from 'zod';

export const assignRoleSchema = z.object({
  userId: z
    .string({ required_error: 'Target user ID is required' })
    .uuid('Target user ID must be a valid UUID'),
  roleId: z
    .string({ required_error: 'Role ID is required' })
    .uuid('Role ID must be a valid UUID'),
  locationId: z
    .string()
    .uuid('Location ID must be a valid UUID')
    .nullable()
    .optional(),
});

export const revokeRoleSchema = z.object({
  reason: z
    .string({ required_error: 'Revocation reason is required' })
    .trim()
    .min(5, 'Revocation reason must be at least 5 characters')
    .max(255, 'Revocation reason cannot exceed 255 characters'),
});

export const assignmentParamsSchema = z.object({
  assignmentId: z
    .string({ required_error: 'Assignment ID is required' })
    .uuid('Assignment ID must be a valid UUID'),
});

export const userParamsSchema = z.object({
  userId: z
    .string({ required_error: 'User ID is required' })
    .uuid('User ID must be a valid UUID'),
});

export const userRoleQuerySchema = z.object({
  isActive: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined || val === '') return undefined;
      return val.toLowerCase() === 'true';
    }),
  locationId: z
    .string()
    .uuid('Location ID must be a valid UUID')
    .optional(),
});

