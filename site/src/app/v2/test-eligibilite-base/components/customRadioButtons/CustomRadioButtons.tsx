import RadioButtons, { RadioButtonsProps } from '@codegouvfr/react-dsfr/RadioButtons';
import styles from './styles.module.scss';
import { ReactNode } from 'react';
import Button from '@codegouvfr/react-dsfr/Button';

type Props = Omit<RadioButtonsProps, 'legend'> & {
  id: string;
  legend: string | ReactNode;
};

const CustomRadioButtons = (props: Props) => {
  const { legend, ...onlyRadioButtonsProps } = props;

  return (
    <div>
      <RadioButtons
        {...onlyRadioButtonsProps}
        classes={{ legend: styles.legend, inputGroup: 'fr-radio-rich' }}
        legend={
          typeof legend === 'string' ? (
            <>
              <p className="fr-mb-2w">{legend}</p>
            </>
          ) : (
            legend
          )
        }
      />
      <div className={styles['button-container']}>
        <Button type="submit">Valider les informations</Button>
      </div>
    </div>
  );
};

export default CustomRadioButtons;
