// Client-safe: DnDossierButton imports it.

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

export const DN_DOSSIER_DELAY_MS = 60 * 60 * 1000;

// Shared by the page and the POST route: a dossier already held is always handed back; a new one
// waits an hour after the last verdict, and is never offered under existingOnly.
export const canOfferDnDossier = ({
  hasDossier,
  lastVerdict,
  existingOnly,
  now = new Date(),
}: {
  hasDossier: boolean;
  lastVerdict: Date | null;
  existingOnly: boolean;
  now?: Date;
}): boolean =>
  hasDossier ||
  (!existingOnly &&
    lastVerdict !== null &&
    now.getTime() - lastVerdict.getTime() >= DN_DOSSIER_DELAY_MS);

// A submitted or closed dossier lives at DN's own /dossiers/<n> page: a stable, token-free link
// the page can show at once. A prefilled one (its URL is the key to it, and dead once claimed)
// or a draft (DN purges abandoned ones) is looked up anew.
export const stableDossierLink = (dossier: DnDossier | null): DnDossierLink | null =>
  dossier && [...DN_SUBMITTED_STATES, ...DN_CLOSED_STATES].includes(dossier.state)
    ? { number: dossier.number, url: dossier.url }
    : null;
