import { Metadata } from 'next';
import styles from './styles.module.scss';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import Image from 'next/image';
import breakdance from '@/images/eligibility-test/break-dance.webp';
import cn from 'classnames';
import Button from '@codegouvfr/react-dsfr/Button';
import AllowanceStep from '@/app/v2/test-eligibilite/components/allowance-step/AllowanceStep';
import { CODES_OBTAINABLE, PARCOURS_HORS_FC_ENABLED } from '@/app/constants/env';
import { HORS_FRANCE_CONNECT_MAINTENANCE } from '@/app/v2/test-eligibilite/constants/maintenance';
import KnowMore from '@/app/components/know-more/KnowMore';

export const metadata: Metadata = {
  title: "Test d'éligibilité - pass Sport",
};

const EligibilityTest = () => {
  return (
    <main className={styles.main} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
      <PageTitle
        title="Demander mon pass Sport"
        classes={{
          container: styles['page-header'],
        }}
      />

      <section className="fr-container">
        <div className={styles['top-section-tile']}>
          <Image
            src={breakdance}
            className={cn(['fr-responsive-img', styles['top-section-tile__image']])}
            alt=""
            loading="eager"
          />
          <div className={styles['top-section-tile__description']}>
            <p className="fr-text--xl fr-mb-1w">
              Si vous êtes éligible, vous recevrez un courrier électronique avec votre code pass
              Sport, mi-septembre.
            </p>
          </div>
        </div>
      </section>

      <section className="fr-container fr-my-4w">
        <div className={styles['top-section-content']}>
          <KnowMore
            variant="purple"
            knowMore={{
              title: 'À savoir',
              description:
                "Si vous avez plusieurs enfants, vous devez demander un code pass Sport pour chaque enfant, sous réserve d'éligibilité.",
            }}
          />
        </div>
      </section>

      {!PARCOURS_HORS_FC_ENABLED ? (
        <div className={styles.background}>
          <div className={styles.wrapper}>
            <p className="fr-text--xl fr-text--bold">{HORS_FRANCE_CONNECT_MAINTENANCE.title}</p>
            <p className="fr-mb-4w">{HORS_FRANCE_CONNECT_MAINTENANCE.description}</p>
            <Button linkProps={{ href: '/v2/test-eligibilite' }}>
              Faire ma demande avec FranceConnect
            </Button>
          </div>
        </div>
      ) : CODES_OBTAINABLE ? (
        <AllowanceStep />
      ) : (
        <div className={styles.background}>
          <div className={styles.wrapper}>
            <p className="fr-text--xl fr-text--bold">
              Vous pourrez demander le pass Sport à partir du 1er septembre
            </p>
            <p>Revenez sur cette page le 1er septembre pour obtenir votre pass.</p>
          </div>
        </div>
      )}
    </main>
  );
};

export default EligibilityTest;
