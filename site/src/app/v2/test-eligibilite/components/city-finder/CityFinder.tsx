import cn from 'classnames';
import rootStyles from '../../../../utilities.module.scss';
import styles from './styles.module.scss';
import AsyncSelect from 'react-select/async';
import { getFranceCitiesByName } from '@/app/v2/trouver-un-club/agent';
import { City } from 'types/City';
import { Props as ReactSelectProps, SingleValue } from 'react-select';
import { sortCities } from 'utils/city';
import { InputState } from 'types/form';
import {
  createCustomInput,
  CustomPlaceholder,
  customScreenReaderStatus,
  guidance,
  onChange,
  onFilter,
  onFocus,
  selectStyles,
} from '@/app/v2/trouver-un-club/components/club-filters/custom-select/CustomSelect';
import React, { useState } from 'react';

interface Option {
  label: string;
  value: string;
}

interface Props {
  inputState: InputState;
  legend: string;
  inputName: string;
  isDisabled: boolean;
  onChanged: (text: string | null) => void;
  required?: boolean;
  secondHintNeeded?: boolean;
}

const CustomInput = createCustomInput('Entrez le nom de commune');

const CityFinder = ({
  inputState,
  legend,
  inputName,
  isDisabled,
  onChanged,
  required = false,
  secondHintNeeded = true,
}: Props) => {
  const [inputValue, setInputValue] = useState('');
  const [value, setValue] = useState<Option>({
    label: '',
    value: '',
  });

  const onInputChange: ReactSelectProps['onInputChange'] = (inputValue, { action }) => {
    if (action === 'input-change') {
      setInputValue(inputValue);
    }
  };

  const birthPlaceChangedHandler = (newValue: SingleValue<Option>) => {
    onChanged(newValue as string | null);
    setInputValue(newValue?.label || '');
    setValue({
      value: newValue?.value || '',
      label: newValue?.label || '',
    });
  };

  return (
    <div
      className={cn('fr-select-group', {
        'fr-select-group--error': inputState.state === 'error',
      })}
    >
      <label className={rootStyles['text--black']} htmlFor={inputName}>
        {legend}
        <p className={cn('fr-text--xs', styles.hint, 'fr-mb-1w', 'fr-mt-1v')}>
          Format attendu : Si le nom de la commune est composé, veillez à saisir un tiret entre deux
          noms (ex : Saint-Joseph), sauf si la commune débute par le, la, les, auxquels cas vous
          devez séparer d’un caractère « espace » (ex : Le Havre). Si votre commune comporte moins
          de 4 caractères il faut ajouter un espace à la fin (ex : Eus). Si vous avez déménagé dans
          les 12 derniers mois, remplissez le champs avec le nom de votre ancienne ville
        </p>
      </label>

      <div className={cn('fr-grid-row', styles['city-finder__container'])}>
        <AsyncSelect<Option, false>
          aria-labelledby="city-select-id"
          instanceId="city-select-id"
          inputId={inputName}
          name={inputName}
          loadingMessage={() => <p>Chargement des communes...</p>}
          noOptionsMessage={() => <p>Aucune commune trouvée</p>}
          cacheOptions
          isDisabled={isDisabled}
          ariaLiveMessages={{ guidance, onChange, onFilter, onFocus }}
          screenReaderStatus={customScreenReaderStatus}
          value={value}
          inputValue={inputValue}
          loadOptions={fetchCityOptions}
          onChange={birthPlaceChangedHandler}
          onInputChange={onInputChange}
          required={required}
          autoFocus
          styles={{
            ...selectStyles,
            input: (_, state) => {
              return {
                color: state.isDisabled ? 'rgb(153, 153, 153)' : 'initial',
                width: '100%',
              };
            },
          }}
          controlShouldRenderValue={false}
          components={{
            Input: CustomInput,
            Placeholder: CustomPlaceholder,
          }}
        />
      </div>

      {secondHintNeeded && (
        <div className={cn('fr-mt-2w', styles.secondHintBlock)}>
          <span className={cn('fr-icon--sm', 'fr-icon-info-fill')} aria-hidden="true" />
          <p className={cn('fr-mb-4w', 'fr-text--xs')}>
            L’allocataire est la personne qui perçoit au moins une aide en regard de leur situation
            familiale et/ou monétaire.
          </p>
        </div>
      )}

      {inputState.state === 'error' && (
        <div className={cn('fr-pt-2w', styles.container)} role="status">
          <span
            className={cn('fr-icon--sm', 'fr-icon-error-fill', styles.error)}
            aria-hidden="true"
          />
          <p className={cn('fr-text--xs', 'fr-mb-0', styles.error)}>{inputState.errorMsg}</p>
        </div>
      )}
    </div>
  );
};

function fetchCityOptions(inputValue: string) {
  return getFranceCitiesByName(inputValue, true).then((cities) =>
    parseCities(sortCities(cities, inputValue)),
  );
}

function parseCities(cities: City[]): Option[] {
  return cities.map((city) => {
    return { label: `${city.nom} (${city.codeDepartement})`, value: city.code };
  });
}

export default CityFinder;
