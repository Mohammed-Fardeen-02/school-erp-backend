import { z } from 'zod';

export const createLocationSchema = z.object({
  code: z
    .string()
    .min(2, 'Campus code must be at least 2 characters')
    .max(50, 'Campus code must not exceed 50 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Code must contain only uppercase alphanumeric characters, dashes, and underscores'),
  name: z.string().min(2, 'Campus name is required').max(150),
  locationType: z
    .enum([
      'MAIN_CAMPUS',
      'BRANCH_CAMPUS',
      'ADMINISTRATIVE_HQ',
      'TRAINING_CENTER',
      'HOSTEL_FACILITY',
      'SPORTS_COMPLEX',
    ])
    .default('BRANCH_CAMPUS'),
  email: z.string().email('Invalid email address').max(120).optional().or(z.literal('')),
  phone: z.string().min(5).max(30).optional().or(z.literal('')),
  principalName: z.string().max(100).optional(),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).default('IN'),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const updateLocationSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  locationType: z
    .enum([
      'MAIN_CAMPUS',
      'BRANCH_CAMPUS',
      'ADMINISTRATIVE_HQ',
      'TRAINING_CENTER',
      'HOSTEL_FACILITY',
      'SPORTS_COMPLEX',
    ])
    .optional(),
  email: z.string().email('Invalid email address').max(120).optional().or(z.literal('')),
  phone: z.string().min(5).max(30).optional().or(z.literal('')),
  principalName: z.string().max(100).optional(),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const locationStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().max(255).optional(),
});

export const locationQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  locationType: z
    .enum([
      'MAIN_CAMPUS',
      'BRANCH_CAMPUS',
      'ADMINISTRATIVE_HQ',
      'TRAINING_CENTER',
      'HOSTEL_FACILITY',
      'SPORTS_COMPLEX',
    ])
    .optional(),
  search: z.string().optional(),
});

