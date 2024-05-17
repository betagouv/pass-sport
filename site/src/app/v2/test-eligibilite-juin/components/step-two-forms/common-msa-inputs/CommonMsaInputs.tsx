import Input from '@codegouvfr/react-dsfr/Input';
import Select from '@codegouvfr/react-dsfr/Select';
import { ChangeEvent } from 'react';
import { AahMsaInputsState } from 'types/EligibilityTest';
import { countries } from '../../../helpers/countries';

interface Props {
  onCountryChanged: (e: ChangeEvent<HTMLSelectElement>) => void;
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
  const getCountryOptions = () =>
    countries
      .sort((a, b) => {
        if (a.label.trim() < b.label.trim()) {
          return -1;
        }
        if (a.label.trim() > b.label.trim()) {
          return 1;
        }
        return 0;
      })
      .map((country) => (
        <option key={country.isoCode} value={country.isoCode}>
          {country.label}
        </option>
      ));
  return (
    <>
      <Select
        label="Pays de naissance de l’allocataire*"
        nativeSelectProps={{
          name: birthCountryInputName,
          onChange: onCountryChanged,
        }}
        state={inputStates.recipientBirthCountry.state}
        stateRelatedMessage={inputStates.recipientBirthCountry.errorMsg}
        disabled={areInputsDisabled}
      >
        <>
          <option disabled hidden selected value="">
            Selectionnez une option
          </option>
          {getCountryOptions()}
        </>
      </Select>

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
