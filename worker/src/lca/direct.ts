import { CAISSE, SITUATION, type ApiParticulierJobPayload, type Situation } from "../eligibility/types";
import { LCA_SITUATION, type ConfirmPayload, type OrganismType, type SearchItem, type SearchPayload, type SituationType } from "./types";

export const SITUATION_BY_AIDE: Record<Situation, SituationType> = {
  [SITUATION.QF]: LCA_SITUATION.JEUNE,
  [SITUATION.AEEH]: LCA_SITUATION.JEUNE,
  [SITUATION.AAH]: LCA_SITUATION.AAH,
  [SITUATION.CROUS]: LCA_SITUATION.BOURSIER,
  [SITUATION.FSS]: LCA_SITUATION.BOURSIER,
};

export const isBoursierAide = (aide: Situation): boolean =>
  SITUATION_BY_AIDE[aide] === LCA_SITUATION.BOURSIER;

const FRANCE_ISO_CODE = "FR";

// LCA's allocataireBirthDate is the one date it wants in the French order.
const toFrenchDate = (iso?: string): string | undefined => {
  const [year, month, day] = (iso ?? "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : undefined;
};

export const buildDirectSearchPayload = (data: ApiParticulierJobPayload): SearchPayload => ({
  beneficiaryLastname: data.beneficiary.lastname,
  beneficiaryFirstname: data.beneficiary.firstname,
  beneficiaryBirthDate: data.beneficiary.birthdate,
  recipientResidencePlace: data.residenceInsee,
  isFromCrous: isBoursierAide(data.aide),
});

export const declarationMatches = (data: ApiParticulierJobPayload, item: SearchItem): boolean => {
  const expected = SITUATION_BY_AIDE[data.aide];
  if (item.situation.toLowerCase() !== expected.toLowerCase()) return false;
  return isBoursierAide(data.aide) || item.organisme === data.caisse;
};

type BranchFields = Pick<
  ConfirmPayload,
  | "recipientLastname"
  | "recipientFirstname"
  | "recipientCafNumber"
  | "recipientIneNumber"
  | "recipientBirthDate"
> & { withBirthCountry: boolean };

const branchFields = (
  data: ApiParticulierJobPayload,
  situation: SituationType,
  hasMatricule: boolean,
): BranchFields => {
  const { allocataire, caisse } = data;

  if (situation === LCA_SITUATION.BOURSIER) {
    return hasMatricule
      ? { recipientIneNumber: data.ine || undefined, withBirthCountry: false }
      : { withBirthCountry: true };
  }

  if (situation === LCA_SITUATION.JEUNE) {
    const names = {
      recipientLastname: allocataire.family_name,
      recipientFirstname: allocataire.given_name,
    };
    return caisse === CAISSE.CAF
      ? { ...names, recipientCafNumber: data.cafNumber || undefined, withBirthCountry: false }
      : {
          ...names,
          recipientBirthDate: toFrenchDate(allocataire.birthdate),
          withBirthCountry: true,
        };
  }

  return caisse === CAISSE.CAF
    ? { recipientCafNumber: data.cafNumber || undefined, withBirthCountry: false }
    : { withBirthCountry: true };
};

export const buildDirectConfirmPayload = (
  data: ApiParticulierJobPayload,
  item: SearchItem,
): ConfirmPayload => {
  const situation = SITUATION_BY_AIDE[data.aide];
  const { withBirthCountry, ...fields } = branchFields(data, situation, !!item.hasMatricule);

  // Born in France, LCA wants the commune and refuses the country; born elsewhere, the opposite.
  const bornInFrance = data.birthCountryIso === FRANCE_ISO_CODE;
  const birthPlace = withBirthCountry && bornInFrance ? data.allocataire.birthplace : undefined;
  const birthCountry = withBirthCountry && !bornInFrance ? data.birthCountryIso : undefined;

  return {
    id: String(item.id),
    situation: item.situation,
    organisme: item.organisme as OrganismType,
    ...fields,
    recipientBirthPlace: birthPlace || undefined,
    recipientBirthCountry: birthCountry || undefined,
  };
};
