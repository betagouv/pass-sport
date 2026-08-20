import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { CAISSE } from '@/utils/eligibility-test';
import { PREFILL_TEST_FORM } from '@/app/constants/env';
import { FRANCE_ISO_CODE } from './countries';

// A commune the CityFinder would have resolved: the hidden input carries the INSEE code,
// the visible text carries the label the async search would have produced.
export type CityDefault = { value: string; label: string };

export type FormDefaults = {
  beneficiaryLastname: string;
  beneficiaryFirstname: string;
  recipientResidencePlace: CityDefault;
  recipientLastname: string;
  recipientFirstname: string;
  recipientCafNumber: string;
  recipientBirthDate: string;
  recipientBirthCountry: string;
  recipientBirthPlace: CityDefault;
};

const PARIS_2E: CityDefault = { value: '75102', label: 'Paris 2e Arrondissement (75)' };
const GONESSE: CityDefault = { value: '95277', label: 'Gonesse (95)' };

const QF_CAF_DEFAULTS: FormDefaults = {
  beneficiaryLastname: 'MERCIER',
  beneficiaryFirstname: 'PIERRE',
  recipientResidencePlace: PARIS_2E,
  recipientLastname: 'MERCIER',
  recipientFirstname: 'PIERRE',
  recipientCafNumber: '0123456',
  recipientBirthDate: '1969-03-17',
  recipientBirthCountry: FRANCE_ISO_CODE,
  recipientBirthPlace: GONESSE,
};

// Only the QF/CAF branch has a known-good case; every other branch is filled by hand.
export const formDefaultsFor = (
  allowance: ALLOWANCE | null,
  caisse: CAISSE | null,
): FormDefaults | null =>
  PREFILL_TEST_FORM && allowance === ALLOWANCE.QF && caisse === CAISSE.CAF ? QF_CAF_DEFAULTS : null;
