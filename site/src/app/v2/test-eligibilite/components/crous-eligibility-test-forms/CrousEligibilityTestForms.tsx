import { useCallback, useState } from 'react';
import StepOneForm from '../step-one-form/StepOneForm';
import { EnhancedConfirmResponseBody, SearchResponseBody } from 'types/EligibilityTest';
import QrCodeVerdict from '../qrcode-verdict/QrCOdeVerdict';
import FullNegativeVerdictPanel from '@/app/components/verdictPanel/FullNegativeVerdictPanel';
import { push } from '@socialgouv/matomo-next';
import CrousForm from '@/app/v2/test-eligibilite/components/step-two-forms/CrousForm';

const CrousEligibilityTestForms = () => {
  const [eligibilityData, setEligibilityData] = useState<SearchResponseBody | null>(null);
  const [pspCodeData, setpspCodeData] = useState<EnhancedConfirmResponseBody | null>(null);
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

  return (
    <>
      <fieldset id="second-step-form" className="fr-fieldset">
        <StepOneForm
          onDataReceived={(data: SearchResponseBody) => {
            setEligibilityData(data);
            setpspCodeData(null);
          }}
          onEligibilityFailure={() => onEligibilityFailure('first step')}
          isDirectBeneficiary
        />
      </fieldset>

      {eligibilityData && eligibilityData.length > 0 && (
        <fieldset id="third-step-form" className="fr-fieldset">
          {eligibilityData[0].situation.toLowerCase() === 'boursier' &&
            eligibilityData[0].organisme === 'cnous' && (
              <CrousForm
                eligibilityDataItem={eligibilityData[0]}
                onDataReceived={(data: EnhancedConfirmResponseBody) => setpspCodeData(data)}
                onEligibilitySuccess={onEligibilitySuccess}
                onEligibilityFailure={onEligibilityFailure}
              />
            )}
        </fieldset>
      )}

      {((eligibilityData && eligibilityData.length === 0) ||
        (pspCodeData && pspCodeData.length === 0)) && (
        <div className="fr-mt-6w">
          <FullNegativeVerdictPanel isLean />
        </div>
      )}

      {pspCodeData && pspCodeData.length > 0 && (
        <div className="fr-mt-6w">
          <QrCodeVerdict data={pspCodeData[0]} />
        </div>
      )}
    </>
  );
};

export default CrousEligibilityTestForms;
