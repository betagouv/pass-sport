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

  // Set LCA_MOCK_CONFIRM_CODE to a row's stored code to reach the happy path in local dev; unset
  // answers [], i.e. "LCA does not serve this one yet".
  async confirm(payload: ConfirmPayload): Promise<LcaResponse<ConfirmItem[]>> {
    const code = process.env.LCA_MOCK_CONFIRM_CODE;

    if (!code) return { httpStatus: 200, body: [] };

    return {
      httpStatus: 200,
      body: [
        {
          id: Number(payload.id),
          id_psp: code,
          nom: payload.recipientLastname ?? "",
          prenom: payload.recipientFirstname ?? "",
          date_naissance: payload.recipientBirthDate ?? "",
          situation: payload.situation,
          organisme: payload.organisme,
        },
      ],
    };
  }
}
