import type { BeneficiaryResult } from '@/app/services/applications';

// Client-safe: BeneficiaryRecap also renders inside the client ResultPanel.

// The usager's Démarche Numérique dossier, as /api/france-connect/dossier hands it out.
export type DnDossier = {
  number: number;
  // DN's vocabulary: 'prefilled' while unclaimed, then brouillon, en_construction,
  // en_instruction, accepte, refuse, sans_suite.
  state: string;
  url: string;
  submittedAt: string | null;
};

export const DN_SUBMITTED_STATES = ['en_construction', 'en_instruction'];
export const DN_CLOSED_STATES = ['accepte', 'refuse', 'sans_suite'];

export const hasRefusal = (beneficiaries: BeneficiaryResult[]): boolean =>
  beneficiaries.some(({ verdict }) => verdict === 'not_eligible');
