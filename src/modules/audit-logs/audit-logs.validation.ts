import { z } from 'zod';

export const auditLogQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
  entity: z.string().trim().max(100).optional(),
  userId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  startDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const auditLogExportQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
  entity: z.string().trim().max(100).optional(),
  userId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  startDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  format: z.enum(['csv', 'json']).default('csv'),
});

export const auditLogParamsSchema = z.object({
  id: z.string().uuid(),
});
