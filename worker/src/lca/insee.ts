// No commune de résidence exists on the FranceConnect parcours: residence_insee is NULL on every
// row it writes, the key is absent from allocataire_identite, and the CSV injected into LCA carries
// adresse_allocataire = {}. /search requires codeInsee anyway, hence a code no commune bears — it
// describes nobody and cannot be mistaken for a real residence in eligibility_history.
export const PENDING_CHECK_INSEE_CODE = "99999";

export const pendingCheckInseeCode = (): string =>
  process.env.LCA_PENDING_CHECK_INSEE_CODE ?? PENDING_CHECK_INSEE_CODE;

// CROUS students often have no address on file: /search retries on this one, which is a REAL
// commune (Paris 13e). Distinct from the fictional code above.
export const DEFAULT_INSEE_CODE = "75113";
