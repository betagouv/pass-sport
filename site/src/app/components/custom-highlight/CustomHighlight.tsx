import Highlight from '@codegouvfr/react-dsfr/Highlight';
import cn from 'classnames';
import styles from './styles.module.scss';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  withIcon?: boolean;
  classes?: string[];
  size?: 'lg' | 'md' | 'sm';
  boldText?: boolean;
  originalLeftBorder?: boolean;
}

const CustomHighlight: React.FC<Props> = ({
  children,
  classes,
  size = 'md',
  withIcon = true,
  boldText = true,
  originalLeftBorder = true,
}) => {
  return (
    <div
      className={cn('fr-highlight', styles['highlight--override'], ...(classes || []), {
        [styles['highlight--left-border']]: !originalLeftBorder,
      })}
    >
      {withIcon && (
        <span className={cn('fr-icon-quote-line', styles['highlight__icon'])} aria-hidden />
      )}
      <div
        className={cn({
          'fr-text--sm': size === 'sm',
          'fr-text--md': size === 'md',
          'fr-text--lg': size === 'lg',
          'fr-text--bold': boldText,
        })}
      >
        {children}
      </div>
    </div>
  );
};

export default CustomHighlight;
