import { z } from 'zod';

export const selectWorkspaceContextSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  locationId: z.string().optional(),
});

export const setPrimaryOrganizationSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
});

export const memberQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .max(100, 'Search query cannot exceed 100 characters')
    .optional(),
  page: z
    .string()
    .optional()
    .refine((val) => val === undefined || /^[1-9]\d*$/.test(val), {
      message: 'Page must be a positive integer',
    })
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .refine((val) => val === undefined || /^[1-9]\d*$/.test(val), {
      message: 'Limit must be a positive integer',
    })
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .refine((val) => val <= 100, {
      message: 'Limit cannot exceed 100',
    }),
});


