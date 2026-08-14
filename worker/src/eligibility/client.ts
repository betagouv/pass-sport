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

// DSS "_identite" params (AAH, AEEH, QF): snake_case (SDK maps to camelCase).
export const toDssParams = (identity: PivotIdentity) => ({
  nom_naissance: identity.family_name,
  // nom_usage: identity.preferred_username || undefined,
  nom_usage: 'DUBOIS',
  prenoms: splitPrenoms(identity.given_name),
  ...splitBirthdate(identity.birthdate),
  sexe_etat_civil: mapGender(identity.gender),
  code_cog_insee_commune_naissance: identity.birthplace || undefined,
  code_cog_insee_pays_naissance: identity.birthcountry || undefined,
});

// CNOUS v5 is not in the SDK (caps at v4) — generic client.get() with camelCase
// keys (no snake_case mapping). v5 adds the INE to the response (EtudiantBoursierData.ine).
export const CNOUS_IDENTITE_PATH = "/v5/cnous/etudiant_boursier/identite";

export const toCnousParams = (identity: PivotIdentity) => {
  const { annee_date_naissance, mois_date_naissance, jour_date_naissance } = splitBirthdate(
    identity.birthdate,
  );
  return {
    nomNaissance: identity.family_name,
    prenoms: splitPrenoms(identity.given_name),
    anneeDateNaissance: annee_date_naissance,
    moisDateNaissance: mois_date_naissance,
    jourDateNaissance: jour_date_naissance,
    sexeEtatCivil: mapGender(identity.gender),
    codeCogInseeCommuneNaissance: identity.birthplace || undefined,
  };
};

export async function getClient(): Promise<ApiParticulierClient> {
  const { RealClient } = await import("./real-client");
  return new RealClient();
}
