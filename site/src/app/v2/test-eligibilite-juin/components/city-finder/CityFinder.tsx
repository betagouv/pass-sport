import cn from 'classnames';
import rootStyles from '../../../../styles.module.scss';
import styles from './styles.module.scss';
import AsyncSelect from 'react-select/async';
import { mapper } from '../../helpers/helper';
import { getFranceCitiesByName } from '@/app/v2/trouver-un-club/agent';
import { City } from 'types/City';
import { InputState } from 'types/EligibilityTest';
import { SingleValue } from 'react-select';

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
}

const CityFinder = ({ inputState, legend, inputName, isDisabled, onChanged }: Props) => {
  const parseCities = (cities: City[]): Option[] =>
    cities.map((city) => {
      return { label: city.nom, value: city.code };
    });

  const fetchCityOptions = (inputValue: string) =>
    getFranceCitiesByName(inputValue).then((cities) => parseCities(cities));

  const birthPlaceChangedHandler = (newValue: SingleValue<Option>) => {
    onChanged(newValue as string | null);
  };

  const selectStyles = {
    control: (baseStyles: Record<string, unknown>) => ({
      ...baseStyles,
      borderColor: '#ffffff',
      backgroundColor: '#eeeeee',
      borderBottom: inputState.state === 'error' ? 'solid #CE0500 2px' : 'solid black 2px',
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
    <div
      className={cn('fr-select-group', {
        'fr-select-group--error': inputState.state === 'error',
      })}
    >
      <label className={rootStyles['text--black']} id="city-select-id">
        {legend}
      </label>
      <p className={cn('fr-text--xs', styles.hint, 'fr-mb-1w')}>
        Format attendu : Si le nom de la commune est composé, veillez à saisir un tiret entre deux
        noms (ex : Saint-Joseph), sauf si le pays débute par le, la, les, auxquels cas vous devez
        séparer d’un caractère « espace » (ex : Le Havre). Si votre pays comporte moins de 4
        caractères il faut ajouter un espace à la fin (ex : Eus).
      </p>
      <AsyncSelect
        aria-labelledby="city-select-id"
        instanceId="city-select-id"
        name={inputName}
        loadingMessage={() => <p>Chargement des villes...</p>}
        noOptionsMessage={() => <p>Aucune ville trouvée</p>}
        placeholder="Trouver la commune"
        cacheOptions
        isClearable
        loadOptions={fetchCityOptions}
        isDisabled={isDisabled}
        onChange={birthPlaceChangedHandler}
        styles={selectStyles}
      />

      {inputState.state === 'error' && (
        <div className={cn('fr-pt-2w', styles.container)}>
          <span
            className={cn('fr-icon--sm', 'fr-icon-error-fill', styles.error)}
            aria-hidden="true"
          ></span>
          <p className={cn('fr-text--xs', 'fr-mb-0', styles.error)}>{inputState.errorMsg}</p>
        </div>
      )}
    </div>
  );
};
export default CityFinder;
