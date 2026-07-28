import type { LcaClient } from "./client";
import type {
  ConfirmItem,
  ConfirmPayload,
  LcaError,
  SearchItem,
  SearchPayload,
} from "./types";

export class MockLcaClient implements LcaClient {
  async search(payload: SearchPayload): Promise<SearchItem[] | LcaError> {
    if (payload.beneficiaryLastname.toLowerCase().startsWith("nomatch")) return [];
    const isCrous = !!payload.isFromCrous;
    return [
      {
        id: 1,
        nom: payload.beneficiaryLastname,
        prenom: payload.beneficiaryFirstname,
        date_naissance: payload.beneficiaryBirthDate,
        situation: isCrous ? "boursier" : "jeune",
        organisme: isCrous ? "cnous" : "CAF",
        matricule: "MOCK-MATRICULE",
        hasMatricule: true,
      },
    ];
  }

  async confirm(payload: ConfirmPayload): Promise<ConfirmItem[] | LcaError> {
    return [
      {
        id: Number(payload.id) || 1,
        id_psp: "MOCK-PSP-CODE",
        nom: payload.recipientLastname ?? "N",
        prenom: payload.recipientFirstname ?? "P",
        date_naissance: payload.recipientBirthDate ?? "2004-05-15",
        situation: payload.situation,
        organisme: payload.organisme,
        // matricule is stripped by process.ts sanitize before storage.
        allocataire: { matricule: "MOCK-MATRICULE" },
      },
    ];
  }
}
