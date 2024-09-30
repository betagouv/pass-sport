import RadioButtons, { RadioButtonsProps } from '@codegouvfr/react-dsfr/RadioButtons';
import styles from './styles.module.scss';
import Legend from './legend/Legend';
import { ReactNode } from 'react';
import Button from '@codegouvfr/react-dsfr/Button';
import { setFocusOn } from '@/utils/dom';
import { useEffect, useRef } from 'react';

type Props = Omit<RadioButtonsProps, 'legend'> & {
  id: string;
  legendLine1: string | ReactNode;
  legendLine2?: string;
  legendLine3?: string;
  legendDescription?: ReactNode;
  isOkButtonDisabled: boolean;
  onOkButtonClicked: () => void;
};

const CustomRadioButtons: React.FC<Props> = (props) => {
  const {
    isOkButtonDisabled,
    onOkButtonClicked,
    legendLine1,
    legendLine2,
    legendLine3,
    legendDescription,
    ...onlyRadioButtonsProps
  } = props;

  useEffect(() => {
    setFocusOn(`#${props.id} div div input`);
  }, [props.id]);

  return (
    <div className="fr-mb-4w">
      <RadioButtons
        {...onlyRadioButtonsProps}
        classes={{ legend: styles.legend }}
        legend={
          <Legend
            line1={props.legendLine1}
            line2={props.legendLine2}
            line3={props.legendLine3}
            legendDescription={props.legendDescription}
          />
        }
      />
      <div className={styles['button-container']}>
        <Button disabled={isOkButtonDisabled} onClick={onOkButtonClicked}>
          Je valide
        </Button>
      </div>
    </div>
  );
};

export default CustomRadioButtons;
