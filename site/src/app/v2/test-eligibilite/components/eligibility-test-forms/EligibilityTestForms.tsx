import { useCallback, useContext, useState } from 'react';
import StepOneForm from '../step-one-form/StepOneForm';
import YoungCafForm from '../step-two-forms/YoungCafForm';
import { EnhancedConfirmResponseBody, SearchResponseBody } from 'types/EligibilityTest';
import YoungMsaForm from '../step-two-forms/YoungMsaForm';
import AahCafForm from '../step-two-forms/AahCafForm';
import AahMsaForm from '../step-two-forms/AahMsaForm';
import { push } from '@socialgouv/matomo-next';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { StepChecker } from '@/app/v2/test-eligibilite/components/step-checker/StepChecker';
import { createPortal } from 'react-dom';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import VerdictPanel from '@/app/v2/test-eligibilite/components/verdict-panel/VerdictPanel';
import { useAutoCorrectAllowance } from '@/app/v2/test-eligibilite/hooks/use-auto-correct-allowance';

const EligibilityTestForms = () => {
  const {
    allowance,
    portalRef,
    eligibilityData,
    setEligibilityData,
    pspCodeData,
    setPspCodeData,
    benefIsEligible,
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

  const getStepCheckerName = useCallback(() => {
    if (!eligibilityData || eligibilityData?.length <= 0) return '';

    switch (eligibilityData[0].organisme) {
      case 'cnous':
      case 'CAF':
      case 'MSA':
        return 'Votre caisse d’allocation';
      default:
        return '';
    }
  }, [eligibilityData]);

  return (
    <>
      {eligibilityData && eligibilityData.length > 0 && (
        <StepChecker
          title={getStepCheckerName()}
          onClick={() => {
            setEligibilityData(null);
            setPspCodeData(null);
          }}
          className="fr-mt-2w"
        />
      )}

      {eligibilityData && eligibilityData.length > 0 && allowance !== ALLOWANCE.AEEH && (
        <p className="fr-ml-n1w fr-mb-2w">
          Ces informations nous aideront à faire valoir vos droits.
        </p>
      )}

      {!eligibilityData && (
        <p className="fr-mb-2w fr-ml-n1w">
          Ces informations nous aideront à connaître votre caisse d&apos;affiliation.
        </p>
      )}

      {!eligibilityData && (
        <fieldset id="second-step-form" className="fr-fieldset">
          <StepOneForm
            onDataReceived={(data: SearchResponseBody) => {
              setEligibilityData(data);
              setPspCodeData(null);
            }}
            onEligibilityFailure={() => onEligibilityFailure('first step')}
          />
        </fieldset>
      )}

      {eligibilityData && eligibilityData.length > 0 && (
        <fieldset id="third-step-form" className="fr-fieldset">
          {eligibilityData[0].situation.toLowerCase() === 'jeune' &&
            eligibilityData[0].organisme === 'CAF' && (
              <YoungCafForm
                eligibilityDataItem={eligibilityData[0]}
                onDataReceived={(data: EnhancedConfirmResponseBody) => setPspCodeData(data)}
                onEligibilitySuccess={onEligibilitySuccess}
                onEligibilityFailure={onEligibilityFailure}
              />
            )}

          {eligibilityData[0].situation.toLowerCase() === 'jeune' &&
            eligibilityData[0].organisme === 'MSA' && (
              <YoungMsaForm
                eligibilityDataItem={eligibilityData[0]}
                onDataReceived={(data: EnhancedConfirmResponseBody) => setPspCodeData(data)}
                onEligibilitySuccess={onEligibilitySuccess}
                onEligibilityFailure={onEligibilityFailure}
              />
            )}

          {eligibilityData[0].situation === 'AAH' && eligibilityData[0].organisme === 'CAF' && (
            <AahCafForm
              eligibilityDataItem={eligibilityData[0]}
              onDataReceived={(data: EnhancedConfirmResponseBody) => setPspCodeData(data)}
              onEligibilitySuccess={onEligibilitySuccess}
              onEligibilityFailure={onEligibilityFailure}
            />
          )}

          {eligibilityData[0].situation === 'AAH' && eligibilityData[0].organisme === 'MSA' && (
            <AahMsaForm
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
          portalRef.current,
        )}
    </>
  );
};

export default EligibilityTestForms;
