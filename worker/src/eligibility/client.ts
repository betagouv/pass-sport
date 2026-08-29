import type { PivotIdentity, ResourceResult } from "./types";

export interface ApiParticulierClient {
  quotientFamilial(identity: PivotIdentity): Promise<ResourceResult>;
  aah(identity: PivotIdentity): Promise<ResourceResult>;
  cnous(identity: PivotIdentity): Promise<ResourceResult>;
  cnousByIne(ine: string): Promise<ResourceResult>;
  aeeh(child: PivotIdentity, childIndex: number): Promise<ResourceResult>;
}

export const RESOURCE_META = {
  qf: { resource: "dss.quotient_familial_identite", label: "Quotient familial CAF/MSA" },
  aah: { resource: "dss.allocation_adulte_handicape_identite", label: "Allocation adulte handicapé (AAH)" },
  cnous: { resource: "cnous.etudiant_boursier_identite", label: "Statut étudiant boursier" },
  cnousIne: { resource: "cnous.etudiant_boursier_ine", label: "Statut étudiant boursier (INE)" },
  aeeh: { resource: "dss.allocation_enfant_handicape_identite", label: "Allocation d'éducation de l'enfant handicapé (AEEH)" },
} as const;

const mapGender = (gender?: string): string | undefined =>
  gender === "male" ? "M" : gender === "female" ? "F" : undefined;

const splitBirthdate = (birthdate?: string) => {
  const [year, month, day] = (birthdate ?? "").split("-");
  return {
    annee_date_naissance: year || undefined,
    mois_date_naissance: month || undefined,
    jour_date_naissance: day || undefined,
  };
};

const splitPrenoms = (givenName?: string): string[] | undefined =>
  givenName ? givenName.split(" ").filter(Boolean) : undefined;

// DSS "_identite" params (QF, AAH, AEEH): the SDK takes snake_case options and maps them to
// the camelCase query params itself — camelCase keys here are silently dropped on the wire.
// Queried on the état civil alone — nom_usage narrows the match and costs answers.
export const toDssParams = (identity: PivotIdentity) => {
  return {
    nom_naissance: identity.family_name,
    prenoms: splitPrenoms(identity.given_name),
    sexe_etat_civil: mapGender(identity.gender),
    code_cog_insee_commune_naissance: identity.birthplace || undefined,
    code_cog_insee_pays_naissance: identity.birthcountry || undefined,
    ...splitBirthdate(identity.birthdate)
  };
};

// CNOUS v5 is not in the SDK (caps at v4) — generic client.get() with camelCase
// keys (no snake_case mapping). v5 adds the INE to the response (EtudiantBoursierData.ine).
export const CNOUS_IDENTITE_PATH = "/v5/cnous/etudiant_boursier/identite";

export const toCnousParams = (identity: PivotIdentity) => {
  return {
    nom_naissance: identity.family_name,
    prenoms: splitPrenoms(identity.given_name),
    sexe_etat_civil: mapGender(identity.gender),
    code_cog_insee_commune_naissance: identity.birthplace || undefined,
    ...splitBirthdate(identity.birthdate)
  };
};

export async function getClient(): Promise<ApiParticulierClient> {
  const { RealClient } = await import("./real-client");
  return new RealClient();
}
