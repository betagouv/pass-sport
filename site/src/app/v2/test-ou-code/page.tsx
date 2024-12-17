import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import cn from 'classnames';
import styles from './styles.module.scss';
import GetOrTestChoice from './components/get-or-test-step/GetOrTestStep';
import { Metadata } from 'next';
import { isPasSportClosed } from '@/utils/date';

export const metadata: Metadata = {
  title: 'Je fais le test - pass Sport',
};

const TestOuCode = () => {
  return !isPasSportClosed() ? (
    <main
      className={cn('fr-pb-4w', styles.main)}
      tabIndex={-1}
      id={SKIP_LINKS_ID.mainContent}
      role="main"
    >
      <h1 className={cn('fr-pt-9w', 'fr-pb-4w', 'fr-px-2w', styles.title)}>
        Puis-je bénéficier du pass Sport?
      </h1>
      <div className={cn('fr-pb-4w', 'fr-mx-auto', 'fr-px-2w', styles.background)}>
        <div className={cn('fr-pt-7w', 'fr-mx-auto', styles.wrapper)}>
          <GetOrTestChoice />
        </div>
      </div>
    </main>
  ) : null;
};

export default TestOuCode;
