import { z } from 'zod';

export const communesSearchQuerySchema = z.object({
  name: z.string(),
  postalCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  includeDistricts: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type CommunesSearchQuery = z.infer<typeof communesSearchQuerySchema>;
