// The pure half of the code-mail sweep that rides in lca-checks.ts, kept apart for the same
// reason as lca-checks-rows.ts: the mapping and the decisions are unit-testable without
// containers.

import type { AllocataireIdentite } from "../db/schema";
import {
  type CodeEmailKind,
  codeEmailKindForAide,
  codeEmailVariables,
  type EmailVariables,
} from "../email/notify";
import type { PivotIdentity, ResultSituation } from "../eligibility/types";

export type FcCodeEmailRow = {
  id: string;
  source: string;
  situation: ResultSituation | null;
  allocataireIdentite: AllocataireIdentite | null;
  enfantIdentite: Partial<PivotIdentity> | null;
  passSportCode: string | null;
  email: string | null;
  emailAttempts: number;
  allocataireFcSub: string | null;
};

export type EmailDecision =
  | { kind: CodeEmailKind }
  | { skip: "no_recipient" | "no_code" | "unknown_situation" | "missing_identity" };

export const rowSubject = (row: FcCodeEmailRow): "self" | "enfant" =>
  row.source === "enfant" ? "enfant" : "self";

// Same split as lca-checks-rows.beneficiaryIdentity: the beneficiary is the child on 'enfant'
// rows, the connected allocataire on every other one.
const beneficiaryIdentity = (row: FcCodeEmailRow): Partial<PivotIdentity> | null =>
  row.source === "enfant" ? row.enfantIdentite : row.allocataireIdentite;

/**
 * Which of the three code templates this row gets, or why it gets none.
 *
 * `situation` is null on every row written before the column existed. `source` settles those on
 * its own whenever it says 'enfant': QF and AEEH are the only two routes that produce one, and
 * both mail code_indirect. A 'self' row without a situation is the residual case — AAH and the
 * boursier routes are indistinguishable there, and guessing would mail the wrong text.
 */
export const decideEmailKind = (row: FcCodeEmailRow): EmailDecision => {
  if (!row.email) return { skip: "no_recipient" };
  if (!row.passSportCode) return { skip: "no_code" };

  const beneficiary = beneficiaryIdentity(row);

  // The template renders the beneficiary's name and birthdate; without them it would go out with
  // its merge tokens showing.
  if (!beneficiary?.family_name || !beneficiary.given_name || !beneficiary.birthdate) {
    return { skip: "missing_identity" };
  }

  if (row.situation) return { kind: codeEmailKindForAide(row.situation) };
  if (row.source === "enfant") return { kind: "code_indirect" };

  return { skip: "unknown_situation" };
};

/**
 * The merge fields, built by the same function the parcours hors FranceConnect uses so the two
 * paths render one person the same way.
 *
 * Only callable on a row decideEmailKind has cleared, which is what guarantees the non-null
 * assertions below hold.
 */
export const rowToEmailVariables = (row: FcCodeEmailRow, kind: CodeEmailKind): EmailVariables => {
  const beneficiary = beneficiaryIdentity(row);

  return codeEmailVariables(
    kind,
    {
      firstname: beneficiary?.given_name ?? "",
      lastname: beneficiary?.family_name ?? "",
      birthdate: beneficiary?.birthdate ?? "",
    },
    row.allocataireIdentite ?? {},
    row.passSportCode ?? "",
  );
};
