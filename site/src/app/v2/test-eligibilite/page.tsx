import { Metadata } from 'next';
import styles from './styles.module.scss';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import Image from 'next/image';
import breakdance from '@/images/eligibility-test/break-dance.webp';
import cn from 'classnames';
import { AEEH } from '@/app/v2/accueil/components/acronymes/Acronymes';
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
          />
          <div className={styles['top-section-tile__description']}>
            <p className="fr-text--xl fr-mb-1w">
              Si vous êtes éligible, vous recevrez un courriel ou un SMS avec votre pass Sport :
            </p>
            <ul className="fr-text--xl fr-ml-2w">
              <li>
                26-28 août : pour les bénéficiaires de l&apos;ARS, de l&apos;AEEH et de l&apos;AAH ;
              </li>
              <li>Entre fin octobre et fin novembre : pour les étudiants boursiers.</li>
            </ul>
            <p className="fr-text--xl">
              Exception pour les bénéficiaires de l’
              <AEEH /> entre 6 et 13 ans : demandez votre pass Sport directement sur notre site à
              partir du 1er septembre.
            </p>
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
