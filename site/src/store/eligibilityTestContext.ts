import React, { Dispatch, SetStateAction } from 'react';
import { StepOneFields, VerdictResponseBody } from '@/types/EligibilityTest';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { CAISSE } from '@/utils/eligibility-test';

type EligibilityTestContextProps = {
  performNewTest: VoidFunction;
  portalNode: HTMLElement | null;
  setPortalNode: (node: HTMLElement | null) => void;
  // Answered in step 1 and held here until step 2 submits: the two are sent to LCA together.
  stepOneFields: StepOneFields | null;
  setStepOneFields: Dispatch<SetStateAction<StepOneFields | null>>;
  verdict: VerdictResponseBody | null;
  setVerdict: Dispatch<SetStateAction<VerdictResponseBody | null>>;
  dob?: string;
  benefIsEligible: boolean;
  setBenefIsEligible: Dispatch<SetStateAction<boolean>>;
  setAllowance: Dispatch<SetStateAction<ALLOWANCE | null>>;
  allowance: ALLOWANCE | null;
  caisse: CAISSE | null;
};

const EligibilityTestContext = React.createContext<EligibilityTestContextProps>({
  performNewTest: () => {},
  portalNode: null,
  setPortalNode: () => {},
  stepOneFields: null,
  setStepOneFields: () => {},
  verdict: null,
  setVerdict: () => {},
  dob: undefined,
  benefIsEligible: false,
  setBenefIsEligible: () => {},
  setAllowance: () => {},
  allowance: null,
  caisse: null,
});

export default EligibilityTestContext;
