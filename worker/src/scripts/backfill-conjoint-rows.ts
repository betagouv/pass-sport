// Ce qu'une sortie qf-batch de rattrapage apprend sur les conjoints, sans toucher ni au
// disque ni à la base — la partie testable de backfill-conjoint.ts.
//
// La règle d'identification n'est pas réécrite ici : c'est readConjointIdentite, celle que le
// worker applique pendant le parcours, appliquée au tableau `allocataires` du CSV.

import { readConjointIdentite } from "../eligibility/candidates";
import type { AllocataireConjointIdentite, PersonneQuotientFamilial } from "../eligibility/types";

export type BatchRow = Record<string, string>;

export type ConjointUpdate = {
  sub: string;
  conjoint: AllocataireConjointIdentite;
};

const parseAllocataires = (cell: string | undefined): PersonneQuotientFamilial[] => {
  if (!cell) return [];

  try {
    const parsed: unknown = JSON.parse(cell);
    return Array.isArray(parsed) ? (parsed as PersonneQuotientFamilial[]) : [];
  } catch {
    return [];
  }
};

// Un foyer par sub : la sortie est en ordre d'entrée, et l'entrée est déjà dédupliquée par
// foyer (clean_fc_lib.build_conjoint_recall_rows). Les lignes sans conjoint identifiable —
// pas de réponse, allocataire seul, couple ambigu — ne produisent rien plutôt qu'une
// devinette.
export const conjointUpdatesFromRows = (rows: BatchRow[]): ConjointUpdate[] => {
  const bySub = new Map<string, ConjointUpdate>();

  for (const row of rows) {
    const sub = row.allocataire_fc_sub?.trim();

    if (!sub || bySub.has(sub)) continue;

    const conjoint = readConjointIdentite(
      { allocataires: parseAllocataires(row.qf_allocataires) },
      row["allocataire-date_naissance"]?.trim() || undefined,
    );

    if (conjoint) bySub.set(sub, { sub, conjoint });
  }

  return [...bySub.values()];
};
