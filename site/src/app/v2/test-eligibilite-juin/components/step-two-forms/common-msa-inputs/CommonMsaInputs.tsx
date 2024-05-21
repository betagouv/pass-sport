import Select from '@codegouvfr/react-dsfr/Select';
import { ChangeEvent } from 'react';
import { AahMsaInputsState } from 'types/EligibilityTest';
import { countries } from '../../../helpers/countries';
import AsyncSelect from 'react-select/async';
import { getFranceCitiesByName } from '@/app/v2/trouver-un-club/agent';
import { City } from 'types/City';
import rootStyles from '../../../../../styles.module.scss';
import cn from 'classnames';
import styles from './styles.module.scss';
import { SingleValue } from 'react-select';
import { mapper } from '../../../helpers/helper';

interface Props {
  onCountryChanged: (e: ChangeEvent<HTMLSelectElement>) => void;
  onBirthPlaceChanged: (text: string | null) => void;
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
  onBirthPlaceChanged,
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

  const birthPlaceChangedHandler = (newValue: SingleValue<Option>) => {
    onBirthPlaceChanged(newValue as string | null);
  };

  const selectStyles = {
    control: (baseStyles: Record<string, unknown>) => ({
      ...baseStyles,
      borderColor: '#ffffff',
      backgroundColor: '#eeeeee',
      borderBottom: 'solid black 2px',
    }),
    indicatorSeparator: (baseStyles: Record<string, unknown>) => ({
      ...baseStyles,
      backgroundColor: '#ffffff',
    }),
    valueContainer: (baseStyles: Record<string, unknown>) => ({
      ...baseStyles,
      paddingLeft: '14px',
    }),
  };
  return (
    <>
      <Select
        label="Pays de naissance de l’allocataire*"
        hint="Format attendu : Format attendu : Si le nom du pays est composé, veillez à saisir un tiret entre deux noms (ex : Pays-Bas)"
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
        <div
          className={cn('fr-select-group', {
            'fr-select-group--error': inputStates['recipientBirthPlace']?.state === 'error',
          })}
        >
          <label className={rootStyles['text--black']} id="city-select-id">
            Commune de naissance de l&apos;allocataire*
          </label>
          <p className={cn('fr-text--xs', styles.hint, 'fr-mb-1w')}>
            Format attendu : Si le nom de la commune est composé, veillez à saisir un tiret entre
            deux noms (ex : Saint-Joseph), sauf si le pays débute par le, la, les, auxquels cas vous
            devez séparer d’un caractère « espace » (ex : Le Havre). Si votre pays comporte moins de
            4 caractères il faut ajouter un espace à la fin (ex : Eus).
          </p>
          <AsyncSelect
            aria-labelledby="city-select-id"
            instanceId="city-select-id"
            name={birthPlaceInputName}
            loadingMessage={() => <p>Chargement des villes...</p>}
            noOptionsMessage={() => <p>Aucune ville trouvée</p>}
            placeholder="Trouver votre ville"
            cacheOptions
            isClearable
            loadOptions={fetchCityOptions}
            isDisabled={areInputsDisabled}
            onChange={birthPlaceChangedHandler}
            styles={selectStyles}
          />

          {inputStates['recipientBirthPlace']?.state === 'error' && (
            <div className={cn('fr-pt-2w', styles.container)}>
              <span
                className={cn('fr-icon--sm', 'fr-icon-error-fill', styles.error)}
                aria-hidden="true"
              ></span>
              <p className={cn('fr-text--xs', 'fr-mb-0', styles.error)}>
                {mapper['recipientBirthPlace']}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default CommonMsaInputs;
