import { useEffect, useRef } from 'react';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import Actions from '@/app/components/actions/Actions';
import { JeDonneMonAvisBtn } from '@/app/components/je-donne-mon-avis-btn/JeDonneMonAvisBtn';
import styles from './styles.module.scss';

/**
 * The refusal our own rules pronounce, before the form is ever filled in: the declared
 * allocation and date of birth already put this person outside the dispositif, so no LCA call
 * and no email follow. Everything downstream of a submitted form is told by email now.
 */
const NotEligiblePanel = () => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <>
      <section
        className={styles['section-failure']}
        aria-live="assertive"
        ref={panelRef}
        tabIndex={-1}
      >
        <Alert
          severity="error"
          title="Nous sommes désolés, d’après les informations que vous nous avez fournies, vous n’êtes pas éligible au pass Sport."
        />
        <section className="fr-mt-3w">
          <p>Le dispositif est ouvert :</p>
          <ul className="fr-ml-2w">
            <li>
              Aux jeunes de 6 à 17 ans révolus faisant partie d&apos;un foyer dont le quotient
              familial est inférieur ou égal à 699 ;
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
      </section>

      <section className={styles['section-cta']}>
        <Actions displayHomeBackBtn newTestBtnVariant="tertiary" />
      </section>

      <section className={styles['section-je-donne-mon-avis']}>
        <hr className="fr-mb-2w" />
        <JeDonneMonAvisBtn isSuccess={false} />
      </section>
    </>
  );
};

export default NotEligiblePanel;
