import { useState } from 'react';
import AgeStep2 from '../ageStep2/AgeStep2';
import { AGE_RANGE } from '../types/types';
import CustomRadioButtons from '../customRadioButtons/CustomRadioButtons';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';
import FullNegativeVerdictPanel from '@/app/components/verdictPanel/FullNegativeVerdictPanel';

const AgeStep = () => {
  const [ageRange, setAgeRange] = useState<AGE_RANGE | null>(null);
  const [isValidated, setIsValidated] = useState(true);

  const fieldsetId = 'ageStep-fieldset';
  useRemoveAttributeById(fieldsetId, 'aria-labelledby');

  const buttonClickedHandler = () => {
    setIsValidated(true);
  };

  return (
    <div>
      <CustomRadioButtons
        id={fieldsetId}
        name="ageStep"
        legendLine1="Quel âge avez-vous ?"
        isOkButtonDisabled={isValidated}
        onOkButtonClicked={buttonClickedHandler}
        options={[
          {
            label: 'Entre 6 et 13 ans',
            nativeInputProps: {
              onChange: () => {
                setAgeRange(AGE_RANGE.BETWEEN_6_13);
                setIsValidated(false);
              },
            },
          },
          {
            label: 'Entre 14 et 30 ans',
            nativeInputProps: {
              onChange: () => {
                setAgeRange(AGE_RANGE.BETWEEN_14_30), setIsValidated(false);
              },
            },
          },
          {
            label: 'Plus de 30 ans',
            nativeInputProps: {
              onChange: () => {
                setAgeRange(AGE_RANGE.GREATER_THAN_30);
                setIsValidated(false);
              },
            },
          },
        ]}
      />

      {isValidated && ageRange === AGE_RANGE.GREATER_THAN_30 && (
        <FullNegativeVerdictPanel isLean={false} />
      )}

      {/* "key" property here is crucial, it allows to "reset" the subsequent components */}
      {/* more info at https://react.dev/learn/preserving-and-resetting-state */}
      {isValidated && ageRange !== null && (
        <AgeStep2 ageRange={ageRange} key={ageRange} isForMySelf />
      )}
    </div>
  );
};

export default AgeStep;
