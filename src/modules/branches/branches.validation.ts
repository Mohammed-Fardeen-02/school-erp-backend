import { z } from 'zod';

export const branchTypeEnum = z.enum([
  'MAIN_CAMPUS',
  'BRANCH_CAMPUS',
  'ADMINISTRATIVE_HQ',
  'TRAINING_CENTER',
  'HOSTEL_FACILITY',
  'SPORTS_COMPLEX',
]);

export const createBranchSchema = z.object({
  organizationId: z.string().uuid('Invalid organization ID').optional(),
  code: z
    .string()
    .min(2, 'Branch code must be at least 2 characters')
    .max(50, 'Branch code must not exceed 50 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Branch code must be uppercase alphanumeric, dashes, or underscores')
    .optional()
    .or(z.literal('')),
  name: z.string().min(2, 'Branch name is required').max(150),
  locationType: branchTypeEnum.default('BRANCH_CAMPUS'),
  isMainCampus: z.boolean().default(false),
  email: z.string().email('Invalid email address').max(120).optional().or(z.literal('')),
  phone: z.string().min(5).max(30).optional().or(z.literal('')),
  principalName: z.string().max(100).optional().or(z.literal('')),
  addressLine1: z.string().max(255).optional().or(z.literal('')),
  addressLine2: z.string().max(255).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(100).optional().or(z.literal('')),
  country: z.string().max(100).default('IN').optional().or(z.literal('')),
  postalCode: z.string().max(20).optional().or(z.literal('')),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const updateBranchSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  locationType: branchTypeEnum.optional(),
  email: z.string().email('Invalid email address').max(120).optional().or(z.literal('')),
  phone: z.string().min(5).max(30).optional().or(z.literal('')),
  principalName: z.string().max(100).optional().or(z.literal('')),
  addressLine1: z.string().max(255).optional().or(z.literal('')),
  addressLine2: z.string().max(255).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(100).optional().or(z.literal('')),
  country: z.string().max(100).optional().or(z.literal('')),
  postalCode: z.string().max(20).optional().or(z.literal('')),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const branchQuerySchema = z.object({
  organizationId: z.string().optional(),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  locationType: branchTypeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const branchStatusSchema = z.object({
  isActive: z.boolean(),
});
