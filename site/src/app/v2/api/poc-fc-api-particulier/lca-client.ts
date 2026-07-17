// POC-only LCA client. The LCA API is temporarily unavailable: the real
// search/confirm calls run only when LCA_API_ENABLED === 'true'; otherwise the
// responses are mocked (deterministic, echoing the beneficiary identity).
// The production manual flow (test-eligibilite) is not affected — it calls
// eligibility-test.ts directly.

import { fetchCode, fetchEligible } from '@/app/services/eligibility-test';
import {
  ConfirmPayload,
  ConfirmResponseBody,
  ConfirmResponseErrorBody,
  SearchPayload,
  SearchResponseBodyItem,
  SearchResponseErrorBody,
} from 'types/EligibilityTest';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

// Read at call time (not module load) so tests can toggle the flag.
const isLcaApiEnabled = () => process.env.LCA_API_ENABLED === 'true';

const MOCK_MATRICULE = '9999999999999';

const mockSearch = (payload: SearchPayload): SearchResponseBodyItem[] => [
  {
    id: 900001,
    nom: payload.beneficiaryLastname.toUpperCase(),
    prenom: payload.beneficiaryFirstname.toUpperCase(),
    date_naissance: `${payload.beneficiaryBirthDate}T00:00:00.000Z`,
    situation: payload.isFromCrous
      ? 'boursier'
      : payload.allowanceName === ALLOWANCE.AAH
        ? 'AAH'
        : 'jeune',
    organisme: payload.isFromCrous ? 'cnous' : 'CAF',
    matricule: MOCK_MATRICULE,
    hasMatricule: true,
  },
];

const mockConfirm = (
  payload: ConfirmPayload,
  searchItem: SearchResponseBodyItem,
): ConfirmResponseBody => [
  {
    id: searchItem.id,
    id_psp: `26-MOCK-${payload.id}`,
    nom: searchItem.nom,
    prenom: searchItem.prenom,
    nom_complet: `${searchItem.prenom} ${searchItem.nom}`,
    date_naissance: searchItem.date_naissance,
    genre: 'F',
    situation: searchItem.situation,
    organisme: searchItem.organisme,
    allocataire: {
      qualite: 'Mme',
      nom: payload.recipientLastname ?? '',
      prenom: payload.recipientFirstname ?? '',
      matricule: MOCK_MATRICULE,
      code_organisme: '220',
      courriel: 'mock@example.fr',
      telephone: '0600000000',
      commune_naissance: 'MOCKVILLE',
      code_insee_commune_naissance: '29098',
      date_naissance: payload.recipientBirthDate ?? '1980-01-01',
    },
    adresse: {
      voie: '1 RUE DE LA DEMO',
      code_postal: '29810',
      commune: 'MOCKVILLE',
      nom_adresse_postale:
        `${payload.recipientFirstname ?? ''} ${payload.recipientLastname ?? ''}`.trim(),
      code_insee: '29098',
    },
    exercice_id: 4,
    a_valider: false,
    refuser: false,
    created_at: '2026-01-01T00:00:00.000+01:00',
    updated_at: '2026-01-01T00:00:00.000+01:00',
    uuid_doc: null,
    pdf_base_64: 'mock-pdf-base-64',
  },
];

export const searchBeneficiary = async (
  payload: SearchPayload,
): Promise<SearchResponseBodyItem[] | SearchResponseErrorBody> =>
  isLcaApiEnabled()
    ? ((await fetchEligible(payload, { keepMatricule: true })) as
        | SearchResponseBodyItem[]
        | SearchResponseErrorBody)
    : mockSearch(payload);

export const confirmBeneficiary = async (
  payload: ConfirmPayload,
  // Only used by the mock branch, to echo the beneficiary identity.
  searchItem: SearchResponseBodyItem,
): Promise<ConfirmResponseBody | ConfirmResponseErrorBody> =>
  isLcaApiEnabled() ? fetchCode(payload) : mockConfirm(payload, searchItem);
