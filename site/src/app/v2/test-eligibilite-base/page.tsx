import styles from './styles.module.scss';
import cn from 'classnames';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import { Metadata } from 'next';
import EligibilityTestWrapper from '@/app/v2/test-eligibilite-base/components/eligibilityTestWrapper/EligibilityTestWrapper';

export const metadata: Metadata = {
  title: 'Puis-je bénéficier du pass Sport ? - pass Sport',
};

const EligibilityTest = () => {
  return (
    <main
      className={cn('fr-pb-4w', styles.main)}
      tabIndex={-1}
      id={SKIP_LINKS_ID.mainContent}
      role="main"
    >
      <div>
        <h1 className={`fr-pt-8w fr-mb-4w fr-px-2w ${styles.title}`}>
          Puis-je bénéficier du pass Sport?
        </h1>

        <div className={`fr-mb-8w fr-mx-auto fr-px-2w ${styles.background}`}>
          <div className={`fr-mx-auto ${styles.wrapper}`}>
            <EligibilityTestWrapper />
          </div>
        </div>
      </div>
    </main>
  );
};

export default EligibilityTest;
