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
            <ul>
              <li>
                Jeunes de 6 à 17 ans révolus faisant partie d&apos;un foyer dont le quotient
                familial est inférieur ou égal à 699 ;
              </li>
              <li>
                Jeunes en situation de handicap :
                <ul>
                  <li>
                    de 6 à 19 ans révolus bénéficiaires de l&apos;AEEH (Allocation d&apos;éducation
                    de l&apos;enfant handicapé) ;
                  </li>
                  <li>
                    de 16 à 30 ans révolus bénéficiaires de l&apos;AAH (Allocation aux adultes
                    handicapés).
                  </li>
                </ul>
              </li>
              <li>
                Boursiers au plus de 28 ans révolus, titulaires d&apos;une bourse attribuée avant le
                15 octobre 2026 :
                <ul>
                  <li>Bourse du CROUS (y compris l&apos;aide annuelle) ;</li>
                  <li>Bourse régionale pour une formation sanitaire et sociale.</li>
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
