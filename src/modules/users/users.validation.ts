import { z } from 'zod';
import { OrganizationAccessLevel, MembershipType } from '@prisma/client';

export const inviteUserSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Valid institutional email is required')
    .max(150, 'Email cannot exceed 150 characters'),
  firstName: z
    .string({ required_error: 'First name is required' })
    .trim()
    .min(2, 'First name must be at least 2 characters')
    .max(100, 'First name cannot exceed 100 characters'),
  lastName: z
    .string({ required_error: 'Last name is required' })
    .trim()
    .min(2, 'Last name must be at least 2 characters')
    .max(100, 'Last name cannot exceed 100 characters'),
  phone: z.string().max(30).optional().nullable(),
  roleId: z.string({ required_error: 'Assigned role is required' }).uuid('Invalid role ID format'),
  locationId: z.string().uuid('Invalid campus location ID format').optional().nullable(),
  accessLevel: z.nativeEnum(OrganizationAccessLevel).default(OrganizationAccessLevel.MEMBER),
  membershipType: z.nativeEnum(MembershipType).default(MembershipType.STAFF),
  sendEmailNotification: z.boolean().default(true),
});

export const acceptInvitationSchema = z.object({
  token: z
    .string({ required_error: 'Invitation token is required' })
    .min(10, 'Invitation token must be at least 10 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .optional(),
  firstName: z.string().trim().min(2, 'First name must be at least 2 characters').max(100).optional(),
  lastName: z.string().trim().min(2, 'Last name must be at least 2 characters').max(100).optional(),
  phone: z.string().max(30).optional().nullable(),
});

export const updateUserProfileSchema = z
  .object({
    firstName: z.string().trim().min(2, 'First name must be at least 2 characters').max(100).optional(),
    lastName: z.string().trim().min(2, 'Last name must be at least 2 characters').max(100).optional(),
    phone: z.string().max(30).optional().nullable(),
  })
  .refine(
    (data) => data.firstName !== undefined || data.lastName !== undefined || data.phone !== undefined,
    'At least one field (firstName, lastName, or phone) must be provided for update'
  );

export const toggleUserStatusSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive status is required' }),
  reason: z.string().max(255).optional(),
});

export const userQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE', 'INVITED', 'SUSPENDED']).optional(),
  roleId: z.string().optional(),
  locationId: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20)),
});
