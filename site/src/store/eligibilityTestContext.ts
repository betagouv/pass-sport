import React, { Dispatch, SetStateAction } from 'react';
import { ConfirmResponseBody, SearchResponseBody } from '@/types/EligibilityTest';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

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
