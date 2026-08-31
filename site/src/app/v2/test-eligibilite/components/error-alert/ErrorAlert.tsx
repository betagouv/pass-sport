import { useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Alert from '@codegouvfr/react-dsfr/Alert';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import styles from './styles.module.scss';
import cn from 'classnames';

interface Props {
  title: string;
}

const ErrorAlert = ({ title }: Props) => {
  const alertRef = useRef<HTMLDivElement>(null);
  const { verdictNode } = useContext(EligibilityTestContext);

  useEffect(() => {
    alertRef.current?.focus();
  }, [title, verdictNode]);

  if (!verdictNode) {
    return null;
  }

  return createPortal(
    <div ref={alertRef} tabIndex={-1} className={cn('fr-mb-4w', styles['top-section-content'])}>
      <Alert severity="error" title={title} />
    </div>,
    verdictNode,
  );
};

export default ErrorAlert;
