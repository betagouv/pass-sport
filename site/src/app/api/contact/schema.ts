import { z } from 'zod';

export const contactFormSchema = z
  .object({
    email: z.email(),
    firstname: z.string(),
    lastname: z.string(),
    message: z.string(),
    reason: z.string(),
    isProRequest: z.boolean(),
    siret: z.string().optional(),
    rna: z.string().optional(),
  })
  .refine((schema) => !schema.isProRequest || schema.siret, {
    message: 'siret is mandatory for a pro request',
  });

export type ContactRequestBody = z.infer<typeof contactFormSchema>;
