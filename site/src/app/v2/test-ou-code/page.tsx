import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import cn from 'classnames';
import styles from './styles.module.scss';
import GetOrTestChoice from './components/get-or-test-step/GetOrTestStep';
import { Metadata } from 'next';
import EligibilityTestWrapper from '@/app/v2/test-eligibilite-base/components/eligibilityTestWrapper/EligibilityTestWrapper';

export const metadata: Metadata = {
  title: 'Je fais le test - pass Sport',
};

const TestOuCode = () => {
  return (
    <main className={styles.main} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
      <section>
        <h1 className={`fr-pt-8w fr-mb-4w fr-px-2w ${styles.title}`}>
          Puis-je bénéficier du pass Sport?
        </h1>

        <div className={`fr-pb-8w fr-mx-auto fr-px-2w fr-pt-4w ${styles.background}`}>
          <div className={`fr-mx-auto ${styles.wrapper}`}>
            <GetOrTestChoice />
          </div>
        </div>
      </section>
    </main>
  );
};

export default TestOuCode;
