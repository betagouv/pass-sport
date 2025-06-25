import { useState } from 'react';
import AllowancesStep from '../allowancesStep/AllowancesStep';
import { AGE_RANGE, CHILD_AGE } from '../types/types';
import CustomRadioButtons from '../customRadioButtons/CustomRadioButtons';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';
import FullNegativeVerdictPanel from '@/app/components/verdictPanel/FullNegativeVerdictPanel';
import AgeStep2 from '@/app/v2/test-eligibilite-base/components/ageStep2/AgeStep2';

const ChildAgeStep = () => {
  const [childAge, setChildAge] = useState<CHILD_AGE | null>(null);
  const [isValidated, setIsValidated] = useState(true);

  const fieldsetId = 'childAgeStep-fieldset';
  useRemoveAttributeById(fieldsetId, 'aria-labelledby');

  const buttonClickedHandler = () => {
    setIsValidated(true);
  };

  return (
    <>
      <CustomRadioButtons
        id={fieldsetId}
        name="childAgeStep"
        legendLine1="Quel âge a votre enfant ?"
        isOkButtonDisabled={isValidated}
        onOkButtonClicked={buttonClickedHandler}
        options={[
          {
            label: 'Moins de 6 ans',
            nativeInputProps: {
              onChange: () => {
                setIsValidated(false);
                setChildAge(CHILD_AGE.LESS_THAN_6);
              },
            },
          },
          {
            label: 'Entre 6 et 13 ans',
            nativeInputProps: {
              onChange: () => {
                setIsValidated(false);
                setChildAge(CHILD_AGE.BETWEEN_6_13);
              },
            },
          },
          {
            label: 'Entre 14 et 30 ans',
            nativeInputProps: {
              onChange: () => {
                setIsValidated(false);
                setChildAge(CHILD_AGE.BTW_14_AND_30);
              },
            },
          },
          {
            label: 'Plus de 30 ans',
            nativeInputProps: {
              onChange: () => {
                setIsValidated(false);
                setChildAge(CHILD_AGE.MORE_THAN_30);
              },
            },
          },
        ]}
      />

      {isValidated && childAge === CHILD_AGE.LESS_THAN_6 && <FullNegativeVerdictPanel isLean />}
      {isValidated && childAge === CHILD_AGE.BETWEEN_6_13 && (
        <AgeStep2 ageRange={AGE_RANGE.BETWEEN_6_13} key={childAge} />
      )}
      {isValidated && childAge === CHILD_AGE.BTW_14_AND_30 && <AllowancesStep />}
      {isValidated && childAge === CHILD_AGE.MORE_THAN_30 && <FullNegativeVerdictPanel isLean />}
    </>
  );
};

export default ChildAgeStep;
