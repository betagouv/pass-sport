import { z } from 'zod';

export const CONTACT_REASONS = [
  'benef-aije-droit',
  'benef-quand',
  'benef-pas-recu',
  'benef-paiement-phase1',
  'benef-non-eligible',
  'benef-boursier',
  'benef-other',
  'club-aije-droit',
  'club-eligible',
  'club-paiement-phase1',
  'club-lca',
  'club-other',
] as const;

export const contactFormSchema = z
  .object({
    email: z.email().max(254),
    firstname: z.string().min(1).max(100),
    lastname: z.string().min(1).max(100),
    message: z.string().min(1).max(10_000),
    reason: z.enum(CONTACT_REASONS),
    isProRequest: z.boolean(),
    siret: z
      .string()
      .regex(/^\d{14}$/)
      .optional(),
    rna: z
      .string()
      .regex(/^W\d{9}$/)
      .optional(),
  })
  .refine((schema) => !schema.isProRequest || schema.siret, {
    message: 'siret is mandatory for a pro request',
  });

export type ContactRequestBody = z.infer<typeof contactFormSchema>;
