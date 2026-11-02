import { z } from 'zod';
import { ModuleId } from '../../shared/constants/modules';

export const createOrganizationSchema = z.object({
  code: z
    .string()
    .min(3, 'Organization code must be at least 3 characters')
    .max(50, 'Organization code must not exceed 50 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Code must contain only uppercase alphanumeric characters, dashes, and underscores'),
  legalName: z.string().min(2, 'Legal name is required').max(200),
  displayName: z.string().min(2, 'Display name is required').max(150),
  organizationType: z
    .enum([
      'K12_SCHOOL_CHAIN',
      'INDEPENDENT_SCHOOL',
      'COLLEGE_UNIVERSITY',
      'POLYTECHNIC_INSTITUTE',
      'VOCATIONAL_CENTER',
    ])
    .optional(),
  email: z.string().email('Valid institutional email is required').max(120),
  phone: z.string().min(5, 'Phone number must be at least 5 characters').max(30),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  taxId: z.string().max(50).optional(),
  registrationNo: z.string().max(100).optional(),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).default('IN'),
  postalCode: z.string().max(20).optional(),
  timezone: z.string().max(50).default('Asia/Kolkata'),
  currency: z.string().max(10).default('INR'),
  subscriptionPlan: z.enum(['STANDARD', 'PROFESSIONAL', 'ENTERPRISE']).default('STANDARD'),
  maxLocations: z.number().int().min(1).max(100).default(5),
  maxUsers: z.number().int().min(1).default(500),
  maxStudents: z.number().int().min(0).default(2000),
  trialDays: z.number().int().min(1).max(90).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  brandColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be a valid hex color').optional(),
  initialMainCampusName: z.string().max(150).optional(),
  initialMainCampusCode: z.string().max(50).optional(),
  ownerEmail: z.string().email().optional(),
  ownerFirstName: z.string().max(100).optional(),
  ownerLastName: z.string().max(100).optional(),
});

export const updateOrganizationSchema = z.object({
  displayName: z.string().min(2).max(150).optional(),
  legalName: z.string().min(2).max(200).optional(),
  email: z.string().email().max(120).optional(),
  phone: z.string().min(5).max(30).optional(),
  website: z.string().url().optional().or(z.literal('')),
  taxId: z.string().max(50).optional(),
  registrationNo: z.string().max(100).optional(),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  timezone: z.string().max(50).optional(),
  currency: z.string().max(10).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  brandColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be a valid hex color').optional(),
});

export const updateTenantStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']),
  reason: z.string().max(255).optional(),
});

export const updateModulesSchema = z.object({
  modules: z.array(z.nativeEnum(ModuleId)).min(1, 'At least one module must be selected'),
});

export const organizationQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'TRIAL', 'ARCHIVED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

