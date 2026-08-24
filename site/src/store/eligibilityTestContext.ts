import React, { Dispatch, SetStateAction } from 'react';
import { StepOneFields } from '@/types/EligibilityTest';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { CAISSE } from '@/utils/eligibility-test';

type EligibilityTestContextProps = {
  performNewTest: VoidFunction;
  portalNode: HTMLElement | null;
  setPortalNode: (node: HTMLElement | null) => void;
  // Answered in step 1 and held here until step 2 submits: the two are sent to LCA together.
  stepOneFields: StepOneFields | null;
  setStepOneFields: Dispatch<SetStateAction<StepOneFields | null>>;
  // The address step two was submitted with, held only to name the mailbox on screen. Set
  // once the request went through, whatever LCA concluded — that is all the browser knows.
  submittedEmail: string | null;
  setSubmittedEmail: Dispatch<SetStateAction<string | null>>;
  dob?: string;
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
  submittedEmail: null,
  setSubmittedEmail: () => {},
  dob: undefined,
  setAllowance: () => {},
  allowance: null,
  caisse: null,
});

export default EligibilityTestContext;
