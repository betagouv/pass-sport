'use client';

import Button from '@codegouvfr/react-dsfr/Button';
import styles from './styles.module.scss';
import { push } from '@socialgouv/matomo-next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import { isPasSportClosed } from '@/utils/date';

const EligibilityTestBanner = () => {
  const eligibilityTestOnClick = () => {
    push(['trackEvent', 'Eligibility Test Button', 'Clicked', 'Banner test button']);
  };

  return !isPasSportClosed() ? (
    <aside
      className={`fr-py-6w fr-px-2w fr-p-md-11w fr-mx-auto ${styles.banner}`}
      id={SKIP_LINKS_ID.eligibilityTestButton}
    >
      <div className={styles['text-container']}>
        <h1 className={styles.text}>Puis-je bénéficier du pass Sport ?</h1>
        <p className={`fr-text--lead fr-px-2w ${styles.text}`}>
          50€ pour aider les jeunes à faire du sport entre 6 et 30 ans
        </p>
      </div>

      <Button
        className="fr-mx-auto"
        priority="primary"
        size="large"
        linkProps={{
          href: '/v2/test-eligibilite-base',
          'aria-label': "Visiter la page pour effectuer le test d'éligibilité",
          onClick: eligibilityTestOnClick,
        }}
      >
        Je fais le test
      </Button>
    </aside>
  ) : null;
};

export default EligibilityTestBanner;
