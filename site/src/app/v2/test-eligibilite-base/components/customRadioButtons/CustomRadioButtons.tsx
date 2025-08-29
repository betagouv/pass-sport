import RadioButtons, { RadioButtonsProps } from '@codegouvfr/react-dsfr/RadioButtons';
import styles from './styles.module.scss';
import { ReactNode, useEffect } from 'react';
import Button from '@codegouvfr/react-dsfr/Button';
import { setFocusOn } from '@/utils/dom';

type Props = Omit<RadioButtonsProps, 'legend'> & {
  id: string;
  legend: string | ReactNode;
  legendDescription?: ReactNode;
  onOkButtonClicked: () => void;
};

const CustomRadioButtons: React.FC<Props> = (props) => {
  const { onOkButtonClicked, legend, legendDescription, ...onlyRadioButtonsProps } = props;

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
        <Button onClick={onOkButtonClicked}>Valider les informations</Button>
      </div>
    </div>
  );
};

export default CustomRadioButtons;
