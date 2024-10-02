import {
  ConfirmPayload,
  ConfirmResponseBody,
  ConfirmResponseErrorBody,
  SearchPayload,
  SearchResponseBody,
  SearchResponseErrorBody,
} from 'types/EligibilityTest';

import * as Sentry from '@sentry/nextjs';
import { addQrCodeToConfirmResponse } from './qr-code';

export const buildLCAConfirmUrl = (data: ConfirmPayload): URL => {
  const domain = process.env.LCA_API_URL;

  if (!domain) {
    throw new Error('Error: LCA_API_URL is not set');
  }

  const params = new URLSearchParams();
  params.append('id', data.id);
  params.append('situation', data.situation);
  params.append('organisme', data.organisme);

  const allocataireName = data.recipientLastname;
  if (allocataireName) {
    params.append('allocataireName', allocataireName);
  }

  const allocataireSurname = data.recipientFirstname;
  if (allocataireSurname) {
    params.append('allocataireSurname', allocataireSurname);
  }

  if (data.situation === 'boursier' && data.organisme === 'cnous' && data.recipientIneNumber) {
    params.append('matricule', data.recipientIneNumber);
  } else if (data.recipientCafNumber) {
    params.append('matricule', data.recipientCafNumber);
  }

  const recipientBirthPlace = data.recipientBirthPlace;
  if (recipientBirthPlace) {
    params.append('codeInseeBirth', recipientBirthPlace);
  }

  const recipientBirthDate = data.recipientBirthDate;
  if (recipientBirthDate) {
    params.append('allocataireBirthDate', recipientBirthDate);
  }

  const recipientBirthCountry = data.recipientBirthCountry;
  if (recipientBirthCountry) {
    params.append('codeIso', recipientBirthCountry);
  }

  const baseUrl = `${domain}/apim/api-asso-admin/passsport/beneficiaires/confirm`;

  const url = new URL(baseUrl);
  url.search = params.toString();
  return url;
};

export const buildLCASearchUrl = (data: SearchPayload): URL => {
  const domain = process.env.LCA_API_URL;

  if (!domain) {
    throw new Error('Error: LCA_API_URL is not set');
  }

  const params = new URLSearchParams();
  params.append('nom', data.beneficiaryLastname);
  params.append('prenom', data.beneficiaryFirstname);
  params.append('dateNaissance', data.beneficiaryBirthDate);
  params.append('codeInsee', data.recipientResidencePlace);

  const baseUrl = `${domain}/apim/api-asso-admin/passsport/beneficiaires/search`;

  const url = new URL(baseUrl);
  url.search = params.toString();

  return url;
};

export const fetchQrCode = async (
  payload: ConfirmPayload,
): Promise<ConfirmResponseBody | ConfirmResponseErrorBody> => {
  const authenticationKey = process.env.LCA_API_KEY;

  if (!authenticationKey) {
    throw new Error('LCA authentication key is missing');
  }

  const url: URL = buildLCAConfirmUrl(payload);

  const response = await fetch(url, { headers: { 'X-Gravitee-Api-Key': authenticationKey } });

  if (!response.ok) {
    throw new Error(
      `Request to LCA api on /confirm has failed. Response status is ${response.status}; Response body is ${JSON.stringify(await response.json())}.`,
    );
  }

  const responseBody = (await response.json()) as ConfirmResponseBody | ConfirmResponseErrorBody;

  if ('message' in responseBody) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setExtra('responseBody', responseBody);
      scope.captureMessage('Unexpected response on LCA POST api/eligibility-test/confirm');
    });
    return responseBody;
  }
  if (responseBody instanceof Array && responseBody.length === 0) {
    return responseBody;
  }
  const enhancedResponse = addQrCodeToConfirmResponse(responseBody);
  return enhancedResponse;
};

export const fetchEligible = async (payload: SearchPayload) => {
  const authenticationKey = process.env.LCA_API_KEY;

  if (!authenticationKey) {
    throw new Error('LCA authentication key is missing');
  }

  const url: URL = buildLCASearchUrl(payload);

  const response = await fetch(url, { headers: { 'X-Gravitee-Api-Key': authenticationKey } });

  if (!response.ok) {
    throw new Error(
      `Request to LCA api on /search has failed. Response status is ${response.status}; Response body is ${JSON.stringify(await response.json())}`,
    );
  }

  const responseBody = (await response.json()) as SearchResponseBody | SearchResponseErrorBody;

  if ('message' in responseBody) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setExtra('responseBody', responseBody);
      scope.captureMessage('Unexpected response on LCA POST api/eligibility-test/search');
    });

    return responseBody;
  }

  return responseBody.map((item) => {
    // Remove matricule from final output
    const { matricule, ...remaining } = item;

    return remaining;
  });
};
