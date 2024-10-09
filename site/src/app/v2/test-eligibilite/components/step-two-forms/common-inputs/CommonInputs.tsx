import Select from '@codegouvfr/react-dsfr/Select';
import { ChangeEvent } from 'react';
import { AahMsaInputsState, CrousInputsState } from 'types/EligibilityTest';
import { countries } from '../../../helpers/countries';
import CityFinder from '../../city-finder/CityFinder';

interface Props {
  onCountryChanged: (e: ChangeEvent<HTMLSelectElement>) => void;
  onBirthPlaceChanged: (text: string | null) => void;
  birthCountryInputName: string;
  birthPlaceInputName: string;
  inputStates: AahMsaInputsState | CrousInputsState;
  areInputsDisabled: boolean;
  isBirthInputRequired: boolean;
  isDirectBeneficiary?: boolean;
  shouldAutoFocus: boolean;
}

const CommonInputs = ({
  onCountryChanged,
  onBirthPlaceChanged,
  birthCountryInputName,
  birthPlaceInputName,
  inputStates,
  areInputsDisabled,
  isBirthInputRequired,
  isDirectBeneficiary = false,
  shouldAutoFocus,
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
        label={isDirectBeneficiary ? `Pays de naissance*` : `Pays de naissance de l’allocataire*`}
        hint="Format attendu : Format attendu : Si le nom du pays est composé, veillez à saisir un tiret entre deux noms (ex : Pays-Bas)"
        nativeSelectProps={{
          name: birthCountryInputName,
          onChange: onCountryChanged,
          required: true,
          'aria-label': isDirectBeneficiary
            ? `Saisir votre pays de naissance`
            : `Saisir le pays de naissance de l'allocataire`,
          autoFocus: shouldAutoFocus,
        }}
        state={inputStates.recipientBirthCountry?.state}
        stateRelatedMessage={inputStates.recipientBirthCountry?.errorMsg}
        disabled={areInputsDisabled}
      >
        <>
          <option disabled hidden selected value="">
            Selectionnez une option
          </option>
          {getCountryOptions()}
        </>
      </Select>

      <div role="alert">
        {isBirthInputRequired && (
          <CityFinder
            inputName={birthPlaceInputName}
            inputState={inputStates['recipientBirthPlace']!}
            legend={
              isDirectBeneficiary
                ? `Commune de naissance*`
                : `Commune de naissance de l'allocataire*`
            }
            isDisabled={areInputsDisabled}
            onChanged={onBirthPlaceChanged}
            required={isBirthInputRequired}
            secondHintNeeded={!isDirectBeneficiary}
            shouldAutoFocus={shouldAutoFocus}
          />
        )}
      </div>
    </>
  );
};

export default CommonInputs;
