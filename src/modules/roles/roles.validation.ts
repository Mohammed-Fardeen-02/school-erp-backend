import { z } from 'zod';
import { RoleType } from '@prisma/client';

export const permissionGrantItemSchema = z
  .object({
    nodeId: z.string().uuid('Invalid node ID format').optional(),
    nodeCode: z.string().min(1, 'nodeCode cannot be empty').optional(),
    isGranted: z.boolean({ required_error: 'isGranted must be a boolean' }),
  })
  .refine(
    (item) => item.nodeId !== undefined || item.nodeCode !== undefined,
    'Either nodeId or nodeCode must be provided'
  );

export const createRoleSchema = z.object({
  roleCode: z
    .string()
    .min(2, 'Role code must be at least 2 characters')
    .max(50, 'Role code cannot exceed 50 characters')
    .regex(
      /^[A-Z0-9_]+$/,
      'Role code must contain only uppercase alphanumeric characters and underscores'
    ),
  roleName: z
    .string()
    .min(2, 'Role name must be at least 2 characters')
    .max(100, 'Role name cannot exceed 100 characters')
    .trim(),
  description: z.string().max(500, 'Description cannot exceed 500 characters').optional(),
  permissions: z.array(permissionGrantItemSchema).optional(),
});

export const updateRoleSchema = z
  .object({
    roleName: z
      .string()
      .min(2, 'Role name must be at least 2 characters')
      .max(100, 'Role name cannot exceed 100 characters')
      .trim()
      .optional(),
    description: z
      .string()
      .max(500, 'Description cannot exceed 500 characters')
      .optional()
      .nullable(),
  })
  .refine(
    (data) => data.roleName !== undefined || data.description !== undefined,
    'At least one field (roleName or description) must be provided for update'
  );

export const roleStatusSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive must be a boolean' }),
});

export const cloneTemplateSchema = z.object({
  roleCode: z
    .string()
    .min(2, 'Role code must be at least 2 characters')
    .max(50, 'Role code cannot exceed 50 characters')
    .regex(
      /^[A-Z0-9_]+$/,
      'Role code must contain only uppercase alphanumeric characters and underscores'
    ),
  roleName: z
    .string()
    .min(2, 'Role name must be at least 2 characters')
    .max(100, 'Role name cannot exceed 100 characters')
    .trim(),
  description: z.string().max(500, 'Description cannot exceed 500 characters').optional(),
});

export const updateRolePermissionsSchema = z.object({
  permissions: z
    .array(permissionGrantItemSchema)
    .min(1, 'At least one permission entry must be provided'),
});

export const roleQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z
    .string()
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
  roleType: z.nativeEnum(RoleType).optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 50)),
});

