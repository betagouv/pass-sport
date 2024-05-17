import Input from '@codegouvfr/react-dsfr/Input';
import Select from '@codegouvfr/react-dsfr/Select';
import { ChangeEvent } from 'react';
import { AahMsaInputsState } from 'types/EligibilityTest';
import { countries } from '../../../helpers/countries';
import AsyncSelect from 'react-select/async';
import { getFranceCitiesByName } from '@/app/v2/trouver-un-club/agent';
import { City } from 'types/City';

interface Props {
  onCountryChanged: (e: ChangeEvent<HTMLSelectElement>) => void;
  birthCountryInputName: string;
  birthPlaceInputName: string;
  inputStates: AahMsaInputsState;
  areInputsDisabled: boolean;
  isBirthInputRequired: boolean;
}

interface Option {
  label: string;
  value: string;
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

  const parseCities = (cities: City[]): Option[] =>
    cities.map((city) => {
      return { label: city.nom, value: city.code };
    });

  const fetchCityOptions = (inputValue: string) =>
    getFranceCitiesByName(inputValue).then((cities) => parseCities(cities));

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
        // <Input
        //   label="Commune de naissance de l’allocataire*"
        //   // hintText="Nom de la personne qui bénéficie des aides de la CAF ou la MSA"
        //   nativeInputProps={{ name: birthPlaceInputName }}
        //   state={inputStates.recipientBirthPlace?.state}
        //   stateRelatedMessage={inputStates.recipientBirthPlace?.errorMsg}
        //   disabled={areInputsDisabled}
        // />
        <AsyncSelect
          instanceId="city-select-id"
          name={birthPlaceInputName}
          loadingMessage={() => <p>Chargement des villes...</p>}
          noOptionsMessage={() => <p>Aucune ville trouvée</p>}
          placeholder="Trouver votre ville"
          cacheOptions
          isClearable
          loadOptions={fetchCityOptions}
          isDisabled={areInputsDisabled}

          // onChange={cityChangeHandler}
          // styles={selectStyles}
        />
      )}
    </>
  );
};

export default CommonMsaInputs;
