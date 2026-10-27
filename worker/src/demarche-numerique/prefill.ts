import { RESOURCE_META } from "../eligibility/client";
import { enfantToIdentity } from "../eligibility/sequence";
import {
  AEEH_BIRTHDATE_MIN,
  QF_BIRTHDATE_MAX,
  householdQfCovers,
  isWithinBirthdateWindow,
  pivotIsHouseholdChild,
  type PersonneQuotientFamilial,
  type PivotIdentity,
  type QuotientFamilialData,
  type ResourceResult,
} from "../eligibility/types";
import {
  AEEH_RESOURCE,
  childAeehVerdict,
  findChildResource,
  hasAahRight,
  hasBourse,
  readBoursier,
  readCaisse,
  readQuotientFamilial,
} from "../eligibility/verdicts";
import type { DnChamp, DnChamps, DnChoiceChamp, DnEnfantChamps, DnGender, DnYesNo } from "./champs";

export type DnIdentity = Pick<
  PivotIdentity,
  "sub" | "family_name" | "given_name" | "birthdate" | "gender"
>;

// A beneficiary row of the household's last run, as jobs/fc-relance.ts reads them.
export type LastRunRow = {
  source: string;
  familyName: string | null;
  givenName: string | null;
  birthdate: string | null;
  verdict: string;
};

export type PrefillRow = Record<string, string>;
export type PrefillBody = Record<string, string | PrefillRow[]>;

export type PrefillInput = {
  identity: DnIdentity;
  results: ResourceResult[];
  lastRun: LastRunRow[];
};

const ELIGIBLE_VERDICTS = new Set(["eligible_pending", "eligible_confirmed"]);

// DN's identity block takes only these two.
const DN_CIVILITE: Record<DnGender, string> = { male: "M.", female: "Mme" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const keyOf = (champ: DnChamp): string => `champ_${champ.id}`;

const choice = <K extends string>(
  champ: DnChoiceChamp<K> | undefined,
  answer: K | null | undefined,
): string | undefined => (answer ? champ?.values[answer] : undefined);

const yesNo = (answer: boolean | null): DnYesNo | null =>
  answer === null ? null : answer ? "yes" : "no";

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

type ContestedChild = {
  identity: PivotIdentity;
  aeeh: boolean | null;
};

// Matched like fc-relance.ts matchesCandidate: the rows are named after the QF answer itself.
const isAlreadyEligible = (
  enfant: PersonneQuotientFamilial,
  birthdate: string | undefined,
  lastRun: LastRunRow[],
): boolean =>
  lastRun.some(
    (row) =>
      row.source === "enfant" &&
      ELIGIBLE_VERDICTS.has(row.verdict) &&
      row.familyName === enfant.nom_naissance &&
      row.givenName === enfant.prenoms &&
      row.birthdate === birthdate,
  );

const enfantRow = ({ identity, aeeh }: ContestedChild, champs: DnEnfantChamps): PrefillRow => {
  const row: PrefillRow = {};
  const put = (champ: DnChamp | undefined, value: string | undefined) => {
    if (champ && value) row[keyOf(champ)] = value;
  };

  put(champs.nom, identity.family_name);
  put(champs.prenom, identity.given_name);
  put(champs.dateNaissance, identity.birthdate);
  put(champs.genre, choice(champs.genre, identity.gender));
  put(champs.aeeh, choice(champs.aeeh, yesNo(aeeh)));

  return row;
};

// The dossier the usager contests their refusal with. Every value comes from FranceConnect or
// an API Particulier answer, and a "no" is only sent when an answer says so: the DN
// pipeline grants on these answers (AEEH child, then a foyer under the quotient threshold).
export const buildPrefill = (
  { identity, results, lastRun }: PrefillInput,
  champs: DnChamps,
): { body: PrefillBody; filled: string[] } => {
  const body: PrefillBody = {};
  const filled: string[] = [];

  const set = (name: string, champ: DnChamp | undefined, value: string | PrefillRow[] | undefined) => {
    if (!champ || !value || value.length === 0) return;
    body[keyOf(champ)] = value;
    filled.push(name);
  };

  if (identity.family_name) body.identite_nom = identity.family_name;
  if (identity.given_name) body.identite_prenom = identity.given_name;
  if (identity.gender) body.identite_genre = DN_CIVILITE[identity.gender];

  set("allocataireGenre", champs.allocataireGenre, choice(champs.allocataireGenre, identity.gender));
  set(
    "dateNaissance",
    champs.dateNaissance,
    identity.birthdate && ISO_DATE.test(identity.birthdate) ? identity.birthdate : undefined,
  );

  // The applicant's own aid only belongs in the dossier when their own row was refused.
  const selfEligible = lastRun.some(
    (row) => row.source === "self" && ELIGIBLE_VERDICTS.has(row.verdict),
  );

  if (!selfEligible) {
    const aide = hasAahRight(results) ? "aah" : hasBourse(results) ? "bourse" : null;
    set("beneficiaireDe", champs.beneficiaireDe, choice(champs.beneficiaireDe, aide));
    set("ine", champs.ine, text(readBoursier(results)?.ine));
  }

  const qf = readQuotientFamilial(results);

  // Named as a child of the foyer, the user applies for no one in it: sequence.ts never asked
  // about those children either. No API answer carries an address: the usager types it.
  if (!qf || pivotIsHouseholdChild(qf, identity.birthdate)) return { body, filled };

  // The user is an allocataire of this foyer: its caisse is theirs and their children's.
  const caisse = readCaisse(results);
  set("caisse", champs.caisse, choice(champs.caisse, caisse));
  set("caisseEnfants", champs.caisseEnfants, choice(champs.caisseEnfants, caisse));

  const enfants = Array.isArray(qf.enfants) ? qf.enfants : [];
  const aeehVerdicts = enfants.map((_, childIndex) =>
    childAeehVerdict(findChildResource(results, AEEH_RESOURCE, childIndex)),
  );

  // Those a campaign window could carry and the last run did not.
  const contested: ContestedChild[] = enfants.flatMap((enfant, childIndex) => {
    const child = enfantToIdentity(enfant);
    if (!child || !isWithinBirthdateWindow(child.birthdate, AEEH_BIRTHDATE_MIN, QF_BIRTHDATE_MAX)) {
      return [];
    }
    if (isAlreadyEligible(enfant, child.birthdate, lastRun)) return [];

    return [{ identity: child, aeeh: aeehVerdicts[childIndex] }];
  });

  const rows = champs.enfants
    ? contested
        .map((child) => enfantRow(child, champs.enfants!.champs))
        .filter((row) => Object.keys(row).length > 0)
    : [];

  set("enfants", champs.enfants, rows);
  set(
    "aDesEnfants",
    champs.aDesEnfants,
    choice(champs.aDesEnfants, rows.length > 0 ? "yes" : enfants.length === 0 ? "no" : null),
  );

  // Asked about the whole foyer: "yes" on any campaign month under the threshold, "no" when
  // every month answered above it.
  const anyMonthCovers = results.some(
    (r) =>
      r.resource === RESOURCE_META.qf.resource &&
      r.success &&
      householdQfCovers(r.data as QuotientFamilialData | null),
  );
  set("foyerQf", champs.foyerQf, choice(champs.foyerQf, anyMonthCovers ? "yes" : "no"));

  // "no" only when every contested child's AEEH answer says so.
  const anyAeeh = aeehVerdicts.some((verdict) => verdict === true);
  const noAeeh = !anyAeeh && contested.every((child) => child.aeeh === false);
  set(
    "enfantsAeeh",
    champs.enfantsAeeh,
    choice(champs.enfantsAeeh, anyAeeh ? "yes" : noAeeh ? "no" : null),
  );

  return { body, filled };
};
