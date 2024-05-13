import { useState } from 'react';
import StepOneForm from '../step-one-form/StepOneForm';
import StepTwoForm from '../step-two-form/StepTwoForm';
import { SearchResponseBody } from 'types/EligibilityTest';

const EligibilityTestForms = () => {
  const [eligibilityData, setEligibilityData] = useState<SearchResponseBody | null>(null);
  return (
    <div>
      <StepOneForm onDataRecieved={(data: SearchResponseBody) => setEligibilityData(data)} />
      {JSON.stringify(eligibilityData)}
      <StepTwoForm />
    </div>
  );
};

export default EligibilityTestForms;
