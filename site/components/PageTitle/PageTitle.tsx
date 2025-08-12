import styles from './styles.module.scss';
import cn from 'classnames';
import { ReactNode } from 'react';

interface IProps {
  title: string | ReactNode;
  subtitle?: string | ReactNode;
  classes?: {
    container?: string;
  };
}

export default function PageTitle({ title, subtitle, classes }: IProps) {
  return (
    <div
      // Mainly used as an anchor
      id="header"
      className={cn(styles.container, classes?.container)}
    >
      <div className={styles.titlewrapper}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle &&
          (typeof subtitle === 'string' ? <p className={styles.subtitle}>{subtitle}</p> : subtitle)}
      </div>
    </div>
  );
}
