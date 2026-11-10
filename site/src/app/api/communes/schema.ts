import { z } from 'zod';

const booleanParam = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const communesSearchQuerySchema = z.object({
  name: z.string().trim().min(1).max(100),
  postalCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  includeDistricts: booleanParam,
  includeFormer: booleanParam,
  excludeDistrictParents: booleanParam,
});

export type CommunesSearchQuery = z.infer<typeof communesSearchQuerySchema>;
