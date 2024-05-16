import { useState } from 'react';
import StepOneForm from '../step-one-form/StepOneForm';
import YoungCafForm from '../step-two-forms/youngCafForm';
import { ConfirmResponseBody, SearchResponseBody } from 'types/EligibilityTest';
import YoungMsaForm from '../step-two-forms/youngMsaForm';
import AahCafForm from '../step-two-forms/aahCafForm';

const EligibilityTestForms = () => {
  const [eligibilityData, setEligibilityData] = useState<SearchResponseBody>([]);
  const [pspCodeData, setpspCodeData] = useState<ConfirmResponseBody>([]);

  return (
    <div>
      <StepOneForm onDataRecieved={(data: SearchResponseBody) => setEligibilityData(data)} />

      {JSON.stringify(eligibilityData)}

      {eligibilityData.length > 0 &&
        eligibilityData[0].situation === 'jeune' &&
        eligibilityData[0].organisme === 'CAF' && (
          <YoungCafForm
            eligibilityDataItem={eligibilityData[0]}
            onDataRecieved={(data: ConfirmResponseBody) => setpspCodeData(data)}
          />
        )}

      {eligibilityData.length > 0 &&
        eligibilityData[0].situation === 'jeune' &&
        eligibilityData[0].organisme === 'MSA' && (
          <YoungMsaForm
            eligibilityDataItem={eligibilityData[0]}
            onDataRecieved={(data: ConfirmResponseBody) => setpspCodeData(data)}
          />
        )}

      {eligibilityData.length > 0 &&
        eligibilityData[0].situation === 'AAH' &&
        eligibilityData[0].organisme === 'CAF' && (
          <AahCafForm
            eligibilityDataItem={eligibilityData[0]}
            onDataRecieved={(data: ConfirmResponseBody) => setpspCodeData(data)}
          />
        )}
      {pspCodeData.length > 0 && <p> Le code pass sport est {pspCodeData[0].id_psp}</p>}
    </div>
  );
};

export default EligibilityTestForms;
