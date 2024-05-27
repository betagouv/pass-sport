import { useState } from 'react';
import StepOneForm from '../step-one-form/StepOneForm';
import YoungCafForm from '../step-two-forms/YoungCafForm';
import { EnhancedConfirmResponseBody, SearchResponseBody } from 'types/EligibilityTest';
import YoungMsaForm from '../step-two-forms/YoungMsaForm';
import AahCafForm from '../step-two-forms/AahCafForm';
import QrCodeVerdict from '../qrcode-verdict/QrCOdeVerdict';
import AahMsaForm from '../step-two-forms/AahMsaForm';
import FullNegativeVerdictPanel from '@/app/components/verdictPanel/FullNegativeVerdictPanel';

const EligibilityTestForms = () => {
  const [eligibilityData, setEligibilityData] = useState<SearchResponseBody | null>(null);
  const [pspCodeData, setpspCodeData] = useState<EnhancedConfirmResponseBody | null>(null);

  return (
    <div>
      <StepOneForm
        onDataReceived={(data: SearchResponseBody) => {
          setEligibilityData(data);
          setpspCodeData(null);
        }}
      />

      {eligibilityData &&
        eligibilityData.length > 0 &&
        eligibilityData[0].situation === 'jeune' &&
        eligibilityData[0].organisme === 'CAF' && (
          <YoungCafForm
            eligibilityDataItem={eligibilityData[0]}
            onDataReceived={(data: EnhancedConfirmResponseBody) => setpspCodeData(data)}
          />
        )}

      {eligibilityData &&
        eligibilityData.length > 0 &&
        eligibilityData[0].situation === 'jeune' &&
        eligibilityData[0].organisme === 'MSA' && (
          <YoungMsaForm
            eligibilityDataItem={eligibilityData[0]}
            onDataReceived={(data: EnhancedConfirmResponseBody) => setpspCodeData(data)}
          />
        )}

      {eligibilityData &&
        eligibilityData.length > 0 &&
        eligibilityData[0].situation === 'AAH' &&
        eligibilityData[0].organisme === 'CAF' && (
          <AahCafForm
            eligibilityDataItem={eligibilityData[0]}
            onDataReceived={(data: EnhancedConfirmResponseBody) => setpspCodeData(data)}
          />
        )}

      {eligibilityData &&
        eligibilityData.length > 0 &&
        eligibilityData[0].situation === 'AAH' &&
        eligibilityData[0].organisme === 'MSA' && (
          <AahMsaForm
            eligibilityDataItem={eligibilityData[0]}
            onDataReceived={(data: EnhancedConfirmResponseBody) => setpspCodeData(data)}
          />
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
    </div>
  );
};

export default EligibilityTestForms;
