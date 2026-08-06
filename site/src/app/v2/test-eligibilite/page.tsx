import { Metadata } from 'next';
import styles from './styles.module.scss';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import Image from 'next/image';
import breakdance from '@/images/eligibility-test/break-dance.webp';
import cn from 'classnames';
import AllowanceStep from '@/app/v2/test-eligibilite/components/allowance-step/AllowanceStep';
import { CODES_OBTAINABLE } from '@/app/constants/env';
import KnowMore from '@/app/components/know-more/KnowMore';

export const metadata: Metadata = {
  title: "Test d'éligibilité - pass Sport",
};

const EligibilityTest = () => {
  return (
    <main className={styles.main} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
      <PageTitle
        title="Récupérer mon pass Sport"
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
              Si vous êtes éligible, vous recevrez un courriel avec votre pass Sport :
            </p>
            <ul className="fr-text--xl fr-ml-2w">
              <li>
                xx septembre : pour les bénéficiaires de l&apos;AEEH, de l&apos;AAH et les jeunes
                faisant partie d&apos;un foyer dont le quotient familial est inférieur ou égal à 699
                fin août ;
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="fr-container fr-my-4w">
        <div className={styles['top-section-content']}>
          <KnowMore
            variant="purple"
            knowMore={{
              title: 'A savoir',
              description:
                'Si vous avez plusieurs enfants, vous devez récupérer un pass pour chaque enfant.',
            }}
          />
        </div>
      </section>

      {CODES_OBTAINABLE ? (
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
