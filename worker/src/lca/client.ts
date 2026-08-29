import type {
  ConfirmItem,
  ConfirmPayload,
  LcaError,
  SearchItem,
  SearchPayload,
} from "./types";

// The status travels beside the body rather than inside it: a success answers with a bare
// array, which has nowhere to carry it, and eligibility_history.http_status has to hold the
// status of every call and not only of the failures.
export type LcaResponse<T> = { httpStatus: number; body: T | LcaError };

export interface LcaClient {
  search(payload: SearchPayload): Promise<LcaResponse<SearchItem[]>>;
  confirm(payload: ConfirmPayload, item: SearchItem): Promise<LcaResponse<ConfirmItem[]>>;
}

export const buildSearchQuery = (p: SearchPayload): URLSearchParams => {
  const params = new URLSearchParams();
  params.append("nom", p.beneficiaryLastname);
  params.append("prenom", p.beneficiaryFirstname);
  params.append("dateNaissance", p.beneficiaryBirthDate);
  params.append("codeInsee", p.recipientResidencePlace);
  return params;
};

export const buildConfirmQuery = (p: ConfirmPayload): URLSearchParams => {
  const params = new URLSearchParams();

  params.append("id", p.id);
  params.append("situation", p.situation);
  params.append("organisme", p.organisme);

  if (p.recipientLastname) params.append("allocataireName", p.recipientLastname);
  if (p.recipientFirstname) params.append("allocataireSurname", p.recipientFirstname);
  if (p.situation === "boursier" && p.organisme === "cnous" && p.recipientIneNumber) {
    params.append("matricule", p.recipientIneNumber);
  } else if (p.recipientCafNumber) {
    params.append("matricule", p.recipientCafNumber);
  }

  if (p.recipientBirthPlace) params.append("codeInseeBirth", p.recipientBirthPlace);
  if (p.recipientBirthDate) params.append("allocataireBirthDate", p.recipientBirthDate);
  if (p.recipientBirthCountry) params.append("codeIso", p.recipientBirthCountry);

  return params;
};

// LCA_MODE=mock returns a credential-free deterministic client for local dev; anything
// else returns the real Gravitee client. Mock is never reachable in prod (LCA_MODE unset).
export async function getLcaClient(): Promise<LcaClient> {
  if (process.env.LCA_MODE === "mock") {
    console.warn("[pass-sport-worker] LCA_MODE=mock — using MockLcaClient (no real LCA calls)");
    const { MockLcaClient } = await import("./mock-client");

    return new MockLcaClient();
  }

  const { RealLcaClient } = await import("./real-client");

  return new RealLcaClient();
}
