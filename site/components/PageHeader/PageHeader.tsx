import styles from './styles.module.scss';
import cn from 'classnames';
import { ReactNode } from 'react';

interface IProps {
  title: string | ReactNode;
  subtitle?: string | ReactNode;
  isProVersion?: boolean;
  classes?: {
    container?: string;
  };
}

export default function PageHeader({ title, subtitle, classes, isProVersion = false }: IProps) {
  return (
    <header
      // Mainly used as an anchor
      id="header"
      role="banner"
      className={cn(styles.container, classes?.container, {
        [styles['container--pro']]: isProVersion,
      })}
    >
      <div className={styles.titlewrapper}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle &&
          (typeof subtitle === 'string' ? <p className={styles.subtitle}>{subtitle}</p> : subtitle)}
      </div>
    </header>
  );
}
