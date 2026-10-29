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

export type DnDossierLink = Pick<DnDossier, 'number' | 'url'>;

// A submitted or closed dossier lives at DN's own /dossiers/<n> page: a stable, token-free link
// the page can show at once. A prefilled one (its URL is the key to it, and dead once claimed)
// or a draft (DN purges abandoned ones) is looked up anew.
export const stableDossierLink = (dossier: DnDossier | null): DnDossierLink | null =>
  dossier && [...DN_SUBMITTED_STATES, ...DN_CLOSED_STATES].includes(dossier.state)
    ? { number: dossier.number, url: dossier.url }
    : null;

export const hasRefusal = (beneficiaries: BeneficiaryResult[]): boolean =>
  beneficiaries.some(({ verdict }) => verdict === 'not_eligible');
