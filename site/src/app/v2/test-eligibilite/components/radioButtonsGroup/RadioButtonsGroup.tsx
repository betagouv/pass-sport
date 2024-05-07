import React, { useState } from 'react';
import styles from './styles.module.scss';
import cn from 'classnames';

type Options = {
  label: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}[];

interface Props {
  fieldsetId: string;
  options: Options;
  description?: JSX.Element;
}

const RadioButtonsGroup: React.FC<Props> = ({ options, fieldsetId, description }) => {
  const [buttonClickedIndex, setButtonClickedIndex] = useState<number | null>(null);

  const buttonHandler = (index: number) => {
    setButtonClickedIndex(index);
  };

  return (
    <fieldset className="fr-fieldset" id={fieldsetId} aria-labelledby={`${fieldsetId}-legend `}>
      <legend
        className={`fr-fieldset__legend--regular fr-fieldset__legend fr-pt-1w fr-pb-2w ${styles.legend}`}
        id={`${fieldsetId}-legend`}
      >
        Choisissez une option *
      </legend>

      {options.map((option, index) => {
        return (
          <div key={option.label} className={`fr-fieldset__element ${styles['fieldset__element']}`}>
            <div
              className={buttonClickedIndex !== index ? styles['transparent-border'] : undefined}
            >
              <div
                className={cn('fr-radio-group', styles['radio-group'], {
                  [`${styles['selected-radio']}`]: buttonClickedIndex === index,
                  [`${styles['deselected-radio']}`]: buttonClickedIndex !== index,
                })}
              >
                <input
                  type="radio"
                  id={`${fieldsetId}-${index}`}
                  name={fieldsetId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    buttonHandler(index);
                    option.onChange(e);
                  }}
                />
                <label className="fr-label" htmlFor={`${fieldsetId}-${index}`}>
                  {option.label}
                </label>
              </div>
            </div>
          </div>
        );
      })}
      {description && <div className={cn(styles.descrpition)}>{description}</div>}
    </fieldset>
  );
};

export default RadioButtonsGroup;
