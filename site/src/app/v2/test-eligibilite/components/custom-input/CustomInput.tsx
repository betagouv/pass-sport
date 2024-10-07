import Input, { InputProps } from '@codegouvfr/react-dsfr/Input';
import cn from 'classnames';
import styles from './styles.module.scss';
import { ReactNode } from 'react';

interface Props {
  inputProps: InputProps;
  secondHint?: ReactNode;
}

const CustomInput = ({ inputProps, secondHint }: Props) => (
  <>
    <Input className="fr-mb-0" {...inputProps} />
    {secondHint && (
      <div className={cn('fr-pt-2w', styles.container)}>
        <span
          className={cn('fr-icon--sm', 'fr-icon-info-fill', styles.color, styles.position)}
          aria-hidden="true"
        />
        <p className={cn('fr-mb-4w', 'fr-text--xs', styles.color)}>{secondHint}</p>
      </div>
    )}
  </>
);

export default CustomInput;
