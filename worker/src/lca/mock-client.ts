import type { LcaClient, LcaResponse } from "./client";
import type { ConfirmItem, ConfirmPayload, SearchItem, SearchPayload } from "./types";

export class MockLcaClient implements LcaClient {
  async search(payload: SearchPayload): Promise<LcaResponse<SearchItem[]>> {
    if (payload.beneficiaryLastname.toLowerCase().startsWith("nomatch")) {
      return { httpStatus: 200, body: [] };
    }
    const isCrous = !!payload.isFromCrous;
    return {
      httpStatus: 200,
      body: [
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
      ],
    };
  }

  async confirm(payload: ConfirmPayload): Promise<LcaResponse<ConfirmItem[]>> {
    return { httpStatus: 200, body: [] };
  }
}
