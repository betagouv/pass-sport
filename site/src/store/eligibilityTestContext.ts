import React, { Dispatch, SetStateAction } from 'react';
import { StepOneFields } from '@/types/EligibilityTest';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { CAISSE } from '@/utils/eligibility-test';

type EligibilityTestContextProps = {
  performNewTest: VoidFunction;
  portalNode: HTMLElement | null;
  setPortalNode: (node: HTMLElement | null) => void;
  // Sits above the "Quelle est votre situation ?" heading: every verdict is drawn there,
  // whichever step of the parcours pronounced it.
  verdictNode: HTMLElement | null;
  setVerdictNode: (node: HTMLElement | null) => void;
  // Answered in step 1 and held here until step 2 submits: the two are sent to LCA together.
  stepOneFields: StepOneFields | null;
  setStepOneFields: Dispatch<SetStateAction<StepOneFields | null>>;
  // Whether step 1 is closed. Kept apart from stepOneFields so "Modifier" reopens the form on
  // the answers already given instead of an empty one.
  isStepOneValidated: boolean;
  setIsStepOneValidated: Dispatch<SetStateAction<boolean>>;
  // The address step two was submitted with, held only to name the mailbox on screen. Set
  // once the request went through, whatever LCA concluded — that is all the browser knows.
  submittedEmail: string | null;
  setSubmittedEmail: Dispatch<SetStateAction<string | null>>;
  dob?: string;
  setAllowance: (allowance: ALLOWANCE | null) => void;
  allowance: ALLOWANCE | null;
  caisse: CAISSE | null;
};

const EligibilityTestContext = React.createContext<EligibilityTestContextProps>({
  performNewTest: () => {},
  portalNode: null,
  setPortalNode: () => {},
  verdictNode: null,
  setVerdictNode: () => {},
  stepOneFields: null,
  setStepOneFields: () => {},
  isStepOneValidated: false,
  setIsStepOneValidated: () => {},
  submittedEmail: null,
  setSubmittedEmail: () => {},
  dob: undefined,
  setAllowance: () => {},
  allowance: null,
  caisse: null,
});

export default EligibilityTestContext;
