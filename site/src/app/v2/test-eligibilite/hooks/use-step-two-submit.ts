import { useContext, useState } from 'react';
import { push } from '@socialgouv/matomo-next';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import type { EligibilityTestRequest } from '@/types/EligibilityTest';
import { requestPassSportCode } from '../agent';

type RecipientFields = Omit<
  EligibilityTestRequest,
  | 'allowanceName'
  | 'caisse'
  | 'beneficiaryLastname'
  | 'beneficiaryFirstname'
  | 'beneficiaryBirthDate'
  | 'recipientResidencePlace'
>;

const GENERIC_ERROR = 'Une erreur a eu lieu. Merci de réessayer plus tard';

/**
 * The single LCA round-trip, shared by the five step-two forms. Each of them differs only in
 * the identifiers its caisse asks for; what happens to them afterwards is identical.
 */
export const useStepTwoSubmit = () => {
  const { allowance, caisse, dob, stepOneFields, setSubmittedEmail } =
    useContext(EligibilityTestContext);
  const [isFormDisabled, setIsFormDisabled] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (recipientFields: RecipientFields): Promise<void> => {
    if (!allowance || !dob || !stepOneFields) {
      setError(GENERIC_ERROR);
      return;
    }

    setError(null);
    setIsFormDisabled(true);

    const verdict = await requestPassSportCode({
      allowanceName: allowance,
      caisse,
      beneficiaryLastname: stepOneFields.beneficiaryLastname,
      beneficiaryFirstname: stepOneFields.beneficiaryFirstname,
      beneficiaryBirthDate: dob,
      recipientResidencePlace: stepOneFields.recipientResidencePlace,
      ...recipientFields,
    });

    if (verdict.outcome === 'error') {
      setError(GENERIC_ERROR);
      setIsFormDisabled(false);
      push([
        'trackEvent',
        'Eligibility Test',
        'Eligibility test completed',
        'Eligibility test submission failed',
      ]);
      return;
    }

    setSubmittedEmail(recipientFields.recipientEmail);
    // No success/failure split any more: the answer is the same whatever LCA held, and only
    // the worker knows which email went out (eligibility_results.verdict).
    push(['trackEvent', 'Eligibility Test', 'Eligibility test completed', 'Outcome emailed']);
  };

  return { isFormDisabled, error, submit };
};
