import styles from './styles.module.scss';
import cn from 'classnames';
import { ReactNode } from 'react';

type KnowMoreProps = {
  variant: 'purple' | 'yellow';
  knowMore: {
    title: string;
    description: string;
  };
  children?: ReactNode;
};

export default function KnowMore({ variant, knowMore, children }: KnowMoreProps) {
  return (
    <div className={cn([styles.container, styles[`container--${variant}`]])}>
      <h2 className={cn('fr-text--md', styles['container__title'])}>{knowMore?.title}</h2>
      <p className="fr-text--md fr-mb-0 fr-mt-1w">{knowMore?.description}</p>
      {children && <div className="fr-mt-1w">{children}</div>}
    </div>
  );
}
