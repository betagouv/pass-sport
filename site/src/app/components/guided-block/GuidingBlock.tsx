import styles from './styles.module.scss';
import Link, { LinkProps } from 'next/link';
import cn from 'classnames';
import KnowMore from '@/app/components/know-more/KnowMore';

export type GuidingBlockProps = {
  title?: string;
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
  fullWidth?: boolean;
  headingLevel?: number;
};

export default function GuidingBlock({
  title,
  description,
  points,
  knowMore,
  variant,
  fullWidth = false,
  headingLevel = 1,
}: GuidingBlockProps) {
  return (
    <section
      className={cn(
        styles.container,
        styles[`container--${variant}`],
        fullWidth ? styles['container--full-width'] : null,
      )}
    >
      <header>
        {title &&
          (headingLevel === 1 ? (
            <h1 className={cn('fr-h4', styles.title)}>{title}</h1>
          ) : (
            <h2 className={cn('fr-h4', styles.title)}>{title}</h2>
          ))}
        <p className={styles.description}>{description}</p>
      </header>

      {points && (
        <ul className={styles.list}>
          {points.map((point, index, i) => (
            <li className={styles['list__bullet']} key={point.title}>
              <span className={styles['list__bullet-index']}>{index + 1}</span>
              <Link
                href={point.linkProps.href}
                className="fr-link fr-link--icon-right fr-icon-arrow-right-line"
              >
                {point.title}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <footer className={styles.knowMore}>
        <KnowMore
          knowMore={knowMore}
          variant={variant}
          titleAs={headingLevel === 1 ? 'h2' : 'h3'}
        ></KnowMore>
      </footer>
    </section>
  );
}
