import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import cn from 'classnames';
import styles from './styles.module.scss';
import GetOrTestChoice from './components/get-or-test-step/GetOrTestStep';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Je fais le test - pass Sport',
};

const TestOuCode = () => {
  return (
    <main className={styles.main} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
      <section className={styles.section}>
        <h1 className={`fr-pt-8w fr-mb-4w fr-px-2w ${styles.title}`}>
          Puis-je bénéficier du pass Sport?
        </h1>

        <div className={`fr-pb-2w fr-mx-auto fr-px-2w fr-pt-4w ${styles.background}`}>
          <section className={cn('fr-mb-2w', styles.description)}>
            <h2 className="fr-h4">Qui est concerné par le pass Sport ?</h2>
            <ul className="fr-mt-2w fr-pl-4w">
              <li>
                Les jeunes de 14 à 17 ans bénéficiaires de l’Allocation de Rentrée Scolaire (ARS) ;
              </li>
              <li>
                Les jeunes en situation de handicap :
                <ul className="list-style-type--circle">
                  <li>
                    de 6 à 19 ans bénéficiaires de l’Allocation d’Éducation de l’Enfant Handicapé
                    (AEEH) ;
                  </li>
                  <li>
                    de 16 à 30 ans bénéficiaires de l’Allocation aux Adultes Handicapés (AAH) ;
                  </li>
                </ul>
              </li>
              <li>
                Les étudiants boursiers de moins de 28 ans bénéficiaires d’une bourse attribuée
                avant le 15 octobre 2025 :
                <ul className="list-style-type--circle">
                  <li>bourse du CROUS (y compris l’aide annuelle) ;</li>
                  <li>bourse régionale pour une formation sanitaire ou sociale.</li>
                </ul>
              </li>
            </ul>
          </section>

          <div className={`fr-mx-auto ${styles.wrapper}`}>
            <GetOrTestChoice />
          </div>
        </div>
      </section>
    </main>
  );
};

export default TestOuCode;
