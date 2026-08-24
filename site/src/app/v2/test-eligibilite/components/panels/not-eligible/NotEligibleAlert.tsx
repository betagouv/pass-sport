import { useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import styles from '../styles.module.scss';

const NotEligibleAlert = () => {
  const alertRef = useRef<HTMLDivElement>(null);
  const { verdictNode } = useContext(EligibilityTestContext);

  useEffect(() => {
    alertRef.current?.focus();
  }, [verdictNode]);

  if (!verdictNode) {
    return null;
  }

  return createPortal(
    <div ref={alertRef} tabIndex={-1} className={styles['top-section-content']}>
      <Alert
        severity="error"
        title="Nous sommes désolés, d’après les informations que vous nous avez fournies, vous n’êtes pas éligible au pass Sport."
      />
      <section>
        <p>Le dispositif est ouvert :</p>
        <ul className="fr-ml-2w">
          <li>
            Aux jeunes de 6 à 17 ans révolus faisant partie d&apos;un foyer dont le quotient
            familial est inférieur ou égal à 699 €;
          </li>
          <li>
            Aux jeunes en situation de handicap :
            <ul className="fr-ml-2w">
              <li>
                De 6 à 19 ans bénéficiaires de l&apos;AEEH (Allocation d&apos;Education de
                l&apos;Enfant Handicapé) ;
              </li>
              <li>
                De 16 à 30 ans bénéficiaires de l&apos;AAH (Allocation aux Adultes Handicapés).
              </li>
            </ul>
          </li>
          <li>
            Aux jeunes de moins de 28 ans bénéficiaires d&apos;une bourse attribuée avant le 15
            octobre 2026 :
            <ul className="fr-ml-2w">
              <li>Bourse du CROUS (y compris l&apos;aide annuelle) ;</li>
              <li>Bourse régionale pour une formation sanitaire et sociale.</li>
            </ul>
          </li>
        </ul>
      </section>
    </div>,
    verdictNode,
  );
};

export default NotEligibleAlert;
