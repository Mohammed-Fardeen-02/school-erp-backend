import { z } from 'zod';

export const selectWorkspaceContextSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  locationId: z.string().optional(),
});

export const setPrimaryOrganizationSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
});

