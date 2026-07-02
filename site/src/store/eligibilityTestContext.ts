import React, { Dispatch, ReactNode, SetStateAction } from 'react';
import { ConfirmResponseBody, SearchResponseBody } from '@/types/EligibilityTest';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

// The searched beneficiary identity, captured at step-one submit (the form
// unmounts on no-match, so the typed names would otherwise be lost).
export type SearchedBeneficiary = { lastname: string; firstname: string };

type EligibilityTestContextProps = {
  performNewTest: VoidFunction;
  portalNode: HTMLElement | null;
  setPortalNode: (node: HTMLElement | null) => void;
  eligibilityData: SearchResponseBody | null;
  pspCodeData: ConfirmResponseBody | null;
  setEligibilityData: Dispatch<SetStateAction<SearchResponseBody | null>>;
  setPspCodeData: Dispatch<SetStateAction<ConfirmResponseBody | null>>;
  dob?: string;
  benefIsEligible: boolean;
  setBenefIsEligible: Dispatch<SetStateAction<boolean>>;
  setAllowance: Dispatch<SetStateAction<ALLOWANCE | null>>;
  allowance: ALLOWANCE | null;
  // Optional slot (POC embed only): rendered instead of the default
  // VerdictPanel when the LCA search finds no match. Absent on the real
  // /v2/test-eligibilite page — behavior there is unchanged.
  searchNoMatchFallback?: ReactNode;
  searchedBeneficiary?: SearchedBeneficiary | null;
  setSearchedBeneficiary?: (beneficiary: SearchedBeneficiary) => void;
};

const EligibilityTestContext = React.createContext<EligibilityTestContextProps>({
  performNewTest: () => {},
  portalNode: null,
  setPortalNode: () => {},
  eligibilityData: null,
  pspCodeData: null,
  setEligibilityData: () => {},
  setPspCodeData: () => {},
  dob: undefined,
  benefIsEligible: false,
  setBenefIsEligible: () => {},
  setAllowance: () => {},
  allowance: null,
});

export default EligibilityTestContext;
