// The pure half of the eligible_pending_lca_checks job, kept apart from lca-checks.ts so the
// mapping and the decisions are unit-testable without containers.

import type { AllocataireIdentite } from "../db/schema";
import { buildConfirmPayload, type AllocataireConfirmIdentity } from "../lca/candidates";
import { pendingCheckInseeCode } from "../lca/insee";
import { isLcaError } from "../lca/history";
import type {
  ConfirmItem,
  ConfirmPayload,
  LcaError,
  SearchItem,
  SearchPayload,
} from "../lca/types";

export type PendingLcaRow = {
  id: string;
  source: string;
  allocataireIdentite: AllocataireIdentite | null;
  enfantIdentite: Partial<AllocataireConfirmIdentity> | null;
  passSportCode: string | null;
  allocataireFcSub: string | null;
  lcaCheckAttempts: number;
};

// Same split as the `nom` column clean_fc_lib.build_psp_columns injected into LCA, which is why
// the search key matches by construction.
const beneficiaryIdentity = (row: PendingLcaRow): AllocataireConfirmIdentity | null =>
  row.source === "enfant" ? (row.enfantIdentite ?? null) : (row.allocataireIdentite ?? null);

export const rowSubject = (row: PendingLcaRow): "self" | "enfant" =>
  row.source === "enfant" ? "enfant" : "self";

// null rather than a partial payload: LCA takes nom/prenom/dateNaissance as ONE key, so a missing
// part is not a broader query, it is a different one.
export const rowToSearchPayload = (row: PendingLcaRow): SearchPayload | null => {
  const beneficiary = beneficiaryIdentity(row);

  if (!beneficiary?.family_name || !beneficiary.given_name || !beneficiary.birthdate) return null;

  return {
    beneficiaryLastname: beneficiary.family_name,
    beneficiaryFirstname: beneficiary.given_name,
    beneficiaryBirthDate: beneficiary.birthdate,
    recipientResidencePlace: pendingCheckInseeCode(),
  };
};

// The confirm names the ALLOCATAIRE, on 'enfant' rows as much as on 'self' ones.
export const rowToConfirmPayload = (row: PendingLcaRow, searchItem: SearchItem): ConfirmPayload =>
  buildConfirmPayload(searchItem, row.allocataireIdentite ?? {});

// 'confirmed' is the only outcome that moves a verdict.
export type RowOutcome =
  | { kind: "confirmed"; passSportCode: string; candidateIndex: number }
  | { kind: "still_pending"; stage: "search" | "confirm" }
  | { kind: "code_mismatch"; lcaCodes: string[] }
  | { kind: "error"; stage: "search" | "confirm"; message: string }
  | { kind: "unprocessable"; reason: "missing_identity" };

export const decideSearchOutcome = (
  outcome: SearchItem[] | LcaError,
): { kind: "candidates"; items: SearchItem[] } | RowOutcome => {
  if (isLcaError(outcome)) return { kind: "error", stage: "search", message: outcome.message };
  if (outcome.length === 0) return { kind: "still_pending", stage: "search" };

  return { kind: "candidates", items: outcome };
};

export const decideConfirmOutcome = (
  storedCode: string,
  outcome: ConfirmItem[] | LcaError,
): { kind: "match" } | { kind: "other_code"; code: string } | RowOutcome => {
  if (isLcaError(outcome)) return { kind: "error", stage: "confirm", message: outcome.message };

  const item = outcome[0];

  // An item without an id_psp is the same answer as no item at all.
  if (!item?.id_psp) return { kind: "still_pending", stage: "confirm" };
  if (item.id_psp === storedCode) return { kind: "match" };

  // Never resolved in favour of LCA: the search key is (nom, prénom, date de naissance) plus a
  // CONSTANT commune, so this is a homonym as plausibly as a duplicate record — and serving the
  // answered code would then serve someone else's.
  return { kind: "other_code", code: item.id_psp };
};
