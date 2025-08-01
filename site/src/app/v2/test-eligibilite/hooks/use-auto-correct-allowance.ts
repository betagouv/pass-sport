import { useContext, useEffect } from 'react';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { ALLOWANCE_MAPPING_TO_ALLOCATION, isEligible } from '@/utils/eligibility-test';
import EligibilityTestContext from '@/store/eligibilityTestContext';

// Use in the form to autocorrect the selected allowance whenever the
// server value is not matching with the user's allowance
export function useAutoCorrectAllowance() {
  const { eligibilityData, setBenefIsEligible, dob, allowance, setAllowance } =
    useContext(EligibilityTestContext);

  useEffect(() => {
    if (!dob) return;

    switch (eligibilityData?.[0]?.situation) {
      case 'jeune':
        if (allowance !== ALLOWANCE.ARS) {
          setAllowance(ALLOWANCE.ARS);
          setBenefIsEligible(
            isEligible({
              targetDate: dob,
              allocationName: ALLOWANCE_MAPPING_TO_ALLOCATION[ALLOWANCE.ARS],
            }),
          );
        }
        break;
      case 'AAH':
        if (allowance !== ALLOWANCE.AAH) {
          setAllowance(ALLOWANCE.AAH);
          setBenefIsEligible(
            isEligible({
              targetDate: dob,
              allocationName: ALLOWANCE_MAPPING_TO_ALLOCATION[ALLOWANCE.AAH],
            }),
          );
        }
        break;
      case 'boursier':
        if (allowance !== ALLOWANCE.CROUS) {
          setAllowance(ALLOWANCE.CROUS);
          setBenefIsEligible(
            isEligible({
              targetDate: dob,
              allocationName: ALLOWANCE_MAPPING_TO_ALLOCATION[ALLOWANCE.CROUS],
            }),
          );
        }
        break;
    }
  }, [allowance, dob, eligibilityData, setAllowance, setBenefIsEligible]);
}
