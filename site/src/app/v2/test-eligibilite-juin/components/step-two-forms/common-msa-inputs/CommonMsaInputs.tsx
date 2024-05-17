import Input from '@codegouvfr/react-dsfr/Input';
import { ChangeEvent } from 'react';
import { AahMsaInputsState } from 'types/EligibilityTest';

interface Props {
  onCountryChanged: (e: ChangeEvent<HTMLInputElement>) => void;
  birthCountryInputName: string;
  birthPlaceInputName: string;
  inputStates: AahMsaInputsState;
  areInputsDisabled: boolean;
  isBirthInputRequired: boolean;
}

const CommonMsaInputs = ({
  onCountryChanged,
  birthCountryInputName,
  birthPlaceInputName,
  inputStates,
  areInputsDisabled,
  isBirthInputRequired,
}: Props) => {
  return (
    <>
      <Input
        label="Pays de naissance de l’allocataire*"
        // hintText="Nom de la personne qui bénéficie des aides de la CAF ou la MSA"
        nativeInputProps={{
          name: birthCountryInputName,
          onChange: onCountryChanged,
        }}
        state={inputStates.recipientBirthCountry.state}
        stateRelatedMessage={inputStates.recipientBirthCountry.errorMsg}
        disabled={areInputsDisabled}
      />

      {isBirthInputRequired && (
        <Input
          label="Commune de naissance de l’allocataire*"
          // hintText="Nom de la personne qui bénéficie des aides de la CAF ou la MSA"
          nativeInputProps={{ name: birthPlaceInputName }}
          state={inputStates.recipientBirthPlace?.state}
          stateRelatedMessage={inputStates.recipientBirthPlace?.errorMsg}
          disabled={areInputsDisabled}
        />
      )}
    </>
  );
};

export default CommonMsaInputs;
