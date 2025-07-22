import styles from './styles.module.scss';
import cn from 'classnames';

type KnowMoreProps = {
  variant: 'purple' | 'yellow';
  knowMore: {
    title: string;
    description: string;
  };
};

export default function KnowMore({ variant, knowMore }: KnowMoreProps) {
  return (
    <div className={cn([styles.container, styles[`container--${variant}`]])}>
      <h2 className={cn('fr-text--md', styles['container__title'])}>{knowMore?.title}</h2>
      <p className="fr-text--md fr-mb-0">{knowMore?.description}</p>
    </div>
  );
}
