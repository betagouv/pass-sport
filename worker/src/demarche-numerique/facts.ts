import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { eligibilityHistory } from "../db/schema";
import { RESOURCE_META, toDssParams } from "../eligibility/client";
import { enfantToIdentity } from "../eligibility/sequence";
import { CAMPAIGN_START, type ResourceResult } from "../eligibility/types";
import { readQuotientFamilial } from "../eligibility/verdicts";

// One answered API Particulier call of eligibility_history.
export type HistoryApiRow = {
  action: string;
  status: string;
  httpStatus: number | null;
  bodyPayload: Record<string, unknown> | null;
  data: unknown;
};

const QF = RESOURCE_META.qf.resource;
const AAH = RESOURCE_META.aah.resource;
const CNOUS = RESOURCE_META.cnous.resource;
const AEEH = RESOURCE_META.aeeh.resource;

// Chronological. Checkpoint replays ('skipped') and calls that got no answer are left out.
export const loadApiRows = async (db: Database, sub: string): Promise<HistoryApiRow[]> =>
  db
    .select({
      action: eligibilityHistory.action,
      status: eligibilityHistory.status,
      httpStatus: eligibilityHistory.httpStatus,
      bodyPayload: eligibilityHistory.bodyPayload,
      data: sql<unknown>`${eligibilityHistory.responsePayload} -> 'data'`,
    })
    .from(eligibilityHistory)
    .where(
      and(
        eq(eligibilityHistory.allocataireFcSub, sub),
        eq(eligibilityHistory.actor, "api_particulier"),
        inArray(eligibilityHistory.status, ["success", "not_found"]),
        inArray(eligibilityHistory.action, [QF, AAH, CNOUS, AEEH]),
        gte(eligibilityHistory.createdAt, CAMPAIGN_START),
      ),
    )
    .orderBy(asc(eligibilityHistory.createdAt), asc(eligibilityHistory.id));

const toResult = (row: HistoryApiRow, childIndex?: number): ResourceResult => ({
  resource: row.action,
  label: row.action,
  httpStatus: row.httpStatus,
  success: row.status === "success",
  // Null too when HISTORY_PAYLOAD=0 dropped it or HISTORY_MAX_PAYLOAD_BYTES truncated it.
  data:
    typeof row.data === "object" && row.data !== null && !Array.isArray(row.data)
      ? (row.data as ResourceResult["data"])
      : null,
  ...(childIndex === undefined ? {} : { childIndex }),
});

// The identity params an AEEH call went out with, as sequence.ts built them. The pays de
// naissance is left out: the retry on the parent's country changes it for the same child.
const AEEH_IDENTITY_PARAMS = [
  "nom_naissance",
  "prenoms",
  "sexe_etat_civil",
  "annee_date_naissance",
  "mois_date_naissance",
  "jour_date_naissance",
] as const;

const isCallAbout = (row: HistoryApiRow, expected: Record<string, unknown>): boolean =>
  row.bodyPayload != null &&
  AEEH_IDENTITY_PARAMS.every(
    (key) => JSON.stringify(row.bodyPayload?.[key]) === JSON.stringify(expected[key]),
  );

// What a chain run would hold, rebuilt from the journal so eligibility/verdicts.ts reads it
// unchanged: every quotient month of the campaign, the latest AAH and CNOUS answers, and the
// latest AEEH answer about each child of the latest quotient. The AEEH rows carry no child
// index: a child is told apart by the params their call went out with.
export const toResourceResults = (rows: HistoryApiRow[]): ResourceResult[] => {
  const results = rows
    .filter((row) => row.action === QF && row.status === "success")
    .map((row) => toResult(row));

  for (const action of [AAH, CNOUS]) {
    const latest = rows.filter((row) => row.action === action).at(-1);
    if (latest) results.push(toResult(latest));
  }

  const enfants = readQuotientFamilial(results)?.enfants;
  const aeehRows = rows.filter((row) => row.action === AEEH);

  (Array.isArray(enfants) ? enfants : []).forEach((enfant, childIndex) => {
    const identity = enfantToIdentity(enfant);
    if (!identity) return;

    const expected = toDssParams(identity);
    const latest = aeehRows.filter((row) => isCallAbout(row, expected)).at(-1);
    if (latest) results.push(toResult(latest, childIndex));
  });

  return results;
};
