import styles from './styles.module.scss';
import cn from 'classnames';
import { ReactNode } from 'react';

type KnowMoreProps = {
  variant: 'purple' | 'yellow';
  knowMore: {
    title: string;
    description: string | ReactNode;
  };
  children?: ReactNode;
  titleAs?: 'h2' | 'h3';
};

export default function KnowMore({ variant, knowMore, children, titleAs = 'h2' }: KnowMoreProps) {
  return (
    <div className={cn([styles.container, styles[`container--${variant}`]])}>
      {titleAs === 'h2' ? (
        <h2 className={cn('fr-text--md', styles['container__title'])}>{knowMore?.title}</h2>
      ) : (
        <h3 className={cn('fr-text--md fr-h2', styles['container__title'])}>{knowMore?.title}</h3>
      )}
      <p className="fr-text--md fr-mb-0 fr-mt-1w">{knowMore?.description}</p>
      {children && <div className="fr-mt-1w">{children}</div>}
    </div>
  );
}
