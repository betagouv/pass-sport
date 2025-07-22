import styles from './styles.module.scss';
import Link, { LinkProps } from 'next/link';
import cn from 'classnames';

export type GuidingBlockProps = {
  title: string;
  description: string;
  variant: 'purple' | 'yellow';
  points: {
    title: string;
    linkProps: LinkProps;
  }[];
  knowMore: {
    title: string;
    description: string;
  };
};

export default function GuidingBlock({
  title,
  description,
  points,
  knowMore,
  variant,
}: GuidingBlockProps) {
  return (
    <section className={cn(styles.container, styles[`container--${variant}`])}>
      <header>
        <h1 className={cn('fr-h4', styles.title)}>{title}</h1>
        <p className={styles.description}>{description}</p>
      </header>

      {points && (
        <ul className={styles.list}>
          {points.map((point, index, i) => (
            <li className={styles['list__bullet']} key={point.title}>
              <span className={styles['list__bullet-index']}>{index}</span>
              <Link
                href={point.linkProps.href}
                className="fr-link--icon-right fr-icon-arrow-right-line"
              >
                {point.title}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <footer className={styles.knowMore}>
        <h2 className={cn('fr-text--md', styles['knowMore__title'])}>{knowMore?.title}</h2>
        <p className="fr-text--md fr-mb-0">{knowMore?.description}</p>
      </footer>
    </section>
  );
}
