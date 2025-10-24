import { ChangeEvent } from 'react';

interface Props {
  isAroundMeDisabled: boolean;
  isChecked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}
const AroundMeFilter: React.FC<Props> = ({ isAroundMeDisabled, isChecked, onChange }) => {
  return (
    <div className="fr-fieldset">
      <div className="fr-fieldset__content">
        <div className="fr-checkbox-group">
          <input
            id="around-me-checkbox-id"
            type="checkbox"
            name="geolocation-checkbox"
            checked={isChecked}
            onChange={onChange}
            disabled={isAroundMeDisabled}
          />
          <label className="fr-label fr-text--text-mention-grey" htmlFor="around-me-checkbox-id">
            Autour de chez vous
            {isAroundMeDisabled && (
              <span className="fr-hint-text fr-text--text-mention-grey">
                Vous devez autoriser la géolocalisation pour utiliser ce filtre
              </span>
            )}
          </label>
        </div>
      </div>
    </div>
  );
};

export default AroundMeFilter;
