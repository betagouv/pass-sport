import Button, { ButtonProps } from '@codegouvfr/react-dsfr/Button';
import styles from './styles.module.scss';
import cn from 'classnames';

type StepCheckerProps = {
  title: string;
  onClick: VoidFunction;
  iconId?: ButtonProps['iconId'];
  iconPosition?: ButtonProps['iconPosition'];
  btnText?: string;
  btnVariant?: ButtonProps['priority'];
  className?: string;
};

export function StepChecker({
  title,
  onClick,
  iconPosition = 'right',
  iconId = 'fr-icon-arrow-go-back-line',
  btnText = 'Modifier',
  btnVariant = 'tertiary',
  className,
}: StepCheckerProps) {
  return (
    <summary className={cn([className, styles.container])}>
      <span className="fr-icon-checkbox-fill" aria-hidden />
      {title}
      <Button
        type="button"
        iconId={iconId}
        iconPosition={iconPosition}
        priority={btnVariant}
        onClick={onClick}
      >
        {btnText}
      </Button>
    </summary>
  );
}
