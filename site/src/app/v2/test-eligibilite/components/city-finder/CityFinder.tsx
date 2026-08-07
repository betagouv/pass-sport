import cn from 'classnames';
import rootStyles from '../../../../utilities.module.scss';
import styles from './styles.module.scss';
import AsyncSelect from 'react-select/async';
import { getFranceCitiesByName } from '@/app/v2/trouver-un-club/agent';
import { City } from '@/types/City';
import { Props as ReactSelectProps, SingleValue } from 'react-select';
import { InputState } from '@/types/form';
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
import React, { ReactNode, useState } from 'react';
import { sortCities } from '@/utils/city';

interface Option {
  label: string;
  value: string;
}

interface Props {
  inputState: InputState;
  legend: string | ReactNode;
  inputName: string;
  isDisabled: boolean;
  onBlur: (text: string | null) => void;
  onChanged: (text: string | null) => void;
  required?: boolean;
  shouldAutoFocus?: boolean;
  /* Stands in for a commune the user would have picked, without running the async search */
  defaultOption?: Option;
}

const CITY_FINDER_DESC_ERROR_ID = 'city-finder-desc-error';
const CustomInput = createCustomInput('Entrez le nom de commune', CITY_FINDER_DESC_ERROR_ID);

const CityFinder = ({
  inputState,
  legend,
  inputName,
  isDisabled,
  onBlur,
  onChanged,
  required = false,
  shouldAutoFocus = false,
  defaultOption,
}: Props) => {
  const [inputValue, setInputValue] = useState(defaultOption?.label ?? '');
  const [value, setValue] = useState<Option>(defaultOption ?? { label: '', value: '' });

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
      <label
        className={isDisabled ? styles['label--disabled'] : rootStyles['text--black']}
        htmlFor={inputName}
      >
        {legend}
        <p className={cn('fr-text--xs', styles.hint, 'fr-mb-1w', 'fr-mt-1v')}>
          Personne responsable du compte de l&apos;allocation.
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
          onBlur={(e) => {
            onBlur(e.target.value);
          }}
          required={required}
          autoFocus={shouldAutoFocus}
          styles={{
            ...selectStyles,
            // The shared control style hardcodes a dark bottom border, which stays dark while
            // every .fr-input around it fades to --border-disabled-grey. Same for the text:
            // DSFR uses --text-disabled-grey, not an arbitrary rgb().
            control: (baseStyles, state) => ({
              ...selectStyles.control(baseStyles),
              ...(state.isDisabled
                ? { borderBottom: '2px solid var(--border-disabled-grey)' }
                : {}),
            }),
            input: (_, state) => {
              return {
                color: state.isDisabled ? 'var(--text-disabled-grey)' : 'initial',
                width: '100%',
              };
            },
          }}
          controlShouldRenderValue={false}
          components={{
            Input: CustomInput,
            Placeholder: CustomPlaceholder,
          }}
          {...(inputState.errorMsg
            ? { 'aria-invalid': true, 'aria-errormessage': CITY_FINDER_DESC_ERROR_ID }
            : { 'aria-invalid': false })}
        />
      </div>

      {inputState.state === 'error' && (
        <div className={cn('fr-pt-2w', styles.container)} role="status">
          <span
            className={cn('fr-icon--sm', 'fr-icon-error-fill', styles.error)}
            aria-hidden="true"
          />
          <p id={CITY_FINDER_DESC_ERROR_ID} className={cn('fr-text--xs', 'fr-mb-0', styles.error)}>
            {inputState.errorMsg}
          </p>
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
