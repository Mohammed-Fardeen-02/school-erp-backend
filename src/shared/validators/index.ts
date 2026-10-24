import { z } from 'zod';
import { REGEX_PATTERNS } from '../constants';
import { SortOrder } from '../enums';

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const paginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val, 10) : 1))
    .refine(val => val > 0, { message: 'Page must be greater than 0' }),
  limit: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val, 10) : 20))
    .refine(val => val > 0 && val <= 100, {
      message: 'Limit must be between 1 and 100',
    }),
  sortBy: z.string().optional(),
  sortOrder: z.nativeEnum(SortOrder).optional().default(SortOrder.DESC),
});

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD');

export const phoneNumberSchema = z
  .string()
  .regex(REGEX_PATTERNS.PHONE_NUMBER, 'Invalid phone number format');
