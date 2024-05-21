import styles from './styles.module.scss';
import cn from 'classnames';

export enum QUESTION_STYLES {
  MAY_STYLE = 'MAY_STYLE',
  JUNE_STYLE = 'JUNE_STYLE',
}

interface Props {
  question: string | JSX.Element;
  description?: string | JSX.Element;
  children: JSX.Element;
  style?: QUESTION_STYLES;
}

const Question = ({
  question,
  description,
  children,
  style = QUESTION_STYLES.MAY_STYLE,
}: Props) => {
  return (
    <div className={` ${styles.container} ${styles.fit}`}>
      <div
        className={cn('fr-p-2w', styles.panel, styles.fit, {
          [`${styles['panel_may']}`]: style === QUESTION_STYLES.MAY_STYLE,
          [`${styles['panel_june']}`]: style === QUESTION_STYLES.JUNE_STYLE,
        })}
      >
        {typeof question === 'string' ? (
          <p className={`fr-text--lg fr-mb-0 ${styles.paragraph}`}>{question}</p>
        ) : (
          question
        )}
      </div>

      {description && (
        <div className={`fr-p-2w ${styles.panel}`}>
          {typeof description === 'string' ? (
            <p className={`fr-text--md fr-mb-0 ${styles.description}`}>{description}</p>
          ) : (
            description
          )}
        </div>
      )}

      <div className="fr-pb-1w">{children}</div>
    </div>
  );
};

export default Question;
