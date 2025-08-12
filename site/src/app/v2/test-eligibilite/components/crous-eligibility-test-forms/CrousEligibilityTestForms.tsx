import { useCallback, useContext, useState } from 'react';
import StepOneForm from '../step-one-form/StepOneForm';
import { EnhancedConfirmResponseBody, SearchResponseBody } from 'types/EligibilityTest';
import { push } from '@socialgouv/matomo-next';
import CrousForm from '@/app/v2/test-eligibilite/components/step-two-forms/CrousForm';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { createPortal } from 'react-dom';
import { StepChecker } from '@/app/v2/test-eligibilite/components/step-checker/StepChecker';
import VerdictPanel from '@/app/v2/test-eligibilite/components/verdict-panel/VerdictPanel';
import { useAutoCorrectAllowance } from '@/app/v2/test-eligibilite/hooks/use-auto-correct-allowance';

const CrousEligibilityTestForms = () => {
  const {
    portalRef,
    eligibilityData,
    setEligibilityData,
    benefIsEligible,
    pspCodeData,
    setPspCodeData,
  } = useContext(EligibilityTestContext);

  const onEligibilitySuccess = useCallback(() => {
    push([
      'trackEvent',
      'Eligibility Test',
      'Eligibility test completed',
      'Eligibility test successful',
    ]);
  }, []);

  const onEligibilityFailure = useCallback((name = 'final step') => {
    push([
      'trackEvent',
      'Eligibility Test',
      'Eligibility test completed',
      `Eligibility test unsuccessful - ${name}`,
    ]);
  }, []);

  useAutoCorrectAllowance();

  return (
    <>
      {eligibilityData && eligibilityData.length > 0 && (
        <StepChecker
          title="Vous êtes affilié à une bourse"
          onClick={() => {
            setEligibilityData(null);
            setPspCodeData(null);
          }}
          className="fr-mt-2w"
        />
      )}

      {!eligibilityData && (
        <fieldset id="second-step-form" className="fr-fieldset">
          <StepOneForm
            onDataReceived={(data: SearchResponseBody) => {
              setEligibilityData(data);
              setPspCodeData(null);
            }}
            onEligibilityFailure={() => onEligibilityFailure('first step')}
            isDirectBeneficiary
          />
        </fieldset>
      )}

      {eligibilityData && eligibilityData.length > 0 && (
        <fieldset id="third-step-form" className="fr-fieldset">
          {eligibilityData[0].situation.toLowerCase() === 'boursier' &&
            eligibilityData[0].organisme === 'cnous' && (
              <CrousForm
                eligibilityDataItem={eligibilityData[0]}
                onDataReceived={(data: EnhancedConfirmResponseBody) => setPspCodeData(data)}
                onEligibilitySuccess={onEligibilitySuccess}
                onEligibilityFailure={onEligibilityFailure}
              />
            )}
        </fieldset>
      )}

      {((eligibilityData && eligibilityData.length === 0) ||
        (pspCodeData && pspCodeData.length === 0)) &&
        portalRef?.current &&
        createPortal(
          <div className="fr-mt-6w">
            <VerdictPanel isSuccess={false} isEligible={benefIsEligible} />
          </div>,
          portalRef.current,
        )}

      {pspCodeData &&
        pspCodeData.length > 0 &&
        portalRef?.current &&
        createPortal(
          <div className="fr-mt-6w">
            <VerdictPanel isSuccess isEligible={benefIsEligible} />
          </div>,
          portalRef?.current,
        )}
    </>
  );
};

export default CrousEligibilityTestForms;
