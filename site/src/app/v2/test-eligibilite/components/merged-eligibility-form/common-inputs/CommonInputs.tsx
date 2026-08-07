import Select from '@codegouvfr/react-dsfr/Select';
import { ChangeEvent, FocusEvent, ReactNode } from 'react';
import { BirthInputsState } from '@/types/EligibilityTest';
import { countries } from '../../../helpers/countries';
import CityFinder from '../../city-finder/CityFinder';

interface Props {
  onCountryChanged: (e: ChangeEvent<HTMLSelectElement>) => void;
  onCountryBlur?: (e: FocusEvent<HTMLSelectElement>) => void;
  onBirthPlaceChanged: (text: string | null) => void;
  birthCountryInputName: string;
  birthPlaceInputName: string;
  inputStates: BirthInputsState;
  areInputsDisabled: boolean;
  isBirthInputRequired: boolean;
  isDirectBeneficiary?: boolean;
  shouldAutoFocus: boolean;
  /* Off in the merged form: a required field the resolved caisse doesn't need would block submit */
  isCountryRequired?: boolean;
  countryLabel?: ReactNode;
  birthPlaceLabel?: ReactNode;
  defaultBirthCountry?: string;
  defaultBirthPlace?: { value: string; label: string };
}

const CommonInputs = ({
  onCountryChanged,
  onCountryBlur,
  onBirthPlaceChanged,
  birthCountryInputName,
  birthPlaceInputName,
  inputStates,
  areInputsDisabled,
  isBirthInputRequired,
  isDirectBeneficiary = false,
  shouldAutoFocus,
  isCountryRequired = true,
  countryLabel,
  birthPlaceLabel,
  defaultBirthCountry,
  defaultBirthPlace,
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
        label={
          countryLabel ??
          (isDirectBeneficiary ? (
            <>
              Pays de naissance <span className="text--required">*</span>
            </>
          ) : (
            <>
              Pays de naissance de l&apos;allocataire <span className="text--required">*</span>
            </>
          ))
        }
        hint="Si le nom du pays contient plusieurs mots, vérifiez s'il y a des tirets (ex : Royaume-Uni ou Côte-d'Ivoire)."
        nativeSelectProps={{
          name: birthCountryInputName,
          onChange: onCountryChanged,
          onBlur: onCountryBlur,
          defaultValue: defaultBirthCountry ?? '',
          required: isCountryRequired,
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
          <option disabled hidden value="">
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
              birthPlaceLabel ??
              (isDirectBeneficiary ? (
                <>
                  Commune de naissance <span className="text--required">*</span>
                </>
              ) : (
                <>
                  Commune de naissance de l&apos;allocataire{' '}
                  <span className="text--required">*</span>
                </>
              ))
            }
            isDisabled={areInputsDisabled}
            onBlur={onBirthPlaceChanged}
            onChanged={onBirthPlaceChanged}
            required={isBirthInputRequired}
            shouldAutoFocus={shouldAutoFocus}
            defaultOption={defaultBirthPlace}
          />
        )}
      </div>
    </>
  );
};

export default CommonInputs;
