import { useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import styles from '../styles.module.scss';

const EmailSentAlert = () => {
  const alertRef = useRef<HTMLDivElement>(null);
  const { submittedEmail, verdictNode } = useContext(EligibilityTestContext);

  useEffect(() => {
    alertRef.current?.focus();
  }, [verdictNode]);

  if (!verdictNode) {
    return null;
  }

  return createPortal(
    <div ref={alertRef} tabIndex={-1} className={styles['top-section-content']}>
      <Alert
        severity="success"
        title="Votre demande a bien été prise en compte."
        description={
          <>
            <p>
              Un e-mail vient d&apos;être envoyé à{' '}
              <span className="fr-text--bold">{submittedEmail}</span>. Il contient le résultat de
              votre demande.
            </p>
            <p className="fr-mb-0">
              Pensez à vérifier vos courriers indésirables. L&apos;e-mail peut mettre quelques
              minutes à arriver.
            </p>
          </>
        }
      />
    </div>,
    verdictNode,
  );
};

export default EmailSentAlert;
