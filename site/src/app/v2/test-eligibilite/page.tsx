import { Metadata } from 'next';
import AllowanceStep from './components/allowance-step/AllowanceStep';
import styles from './styles.module.scss';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import Image from 'next/image';
import breakdance from '@/images/eligibility-test/break-dance.webp';
import cn from 'classnames';
import KnowMore from '@/app/components/know-more/KnowMore';
import { AEEH } from '@/app/v2/accueil/components/acronymes/Acronymes';

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
              Si vous êtes éligibles, vous recevrez un courriel ou un SMS avec votre pass Sport :
            </p>
            <ul className="fr-text--xl fr-ml-2w">
              <li>26-28 août : pour environ 80% des bénéficiaires ;</li>
              <li>Entre mi-octobre et mi-novembre : pour les étudiants boursiers.</li>
            </ul>
            <p className="fr-text--xl">
              Exception pour les bénéficiaires de l’
              <AEEH /> : demandez votre pass Sport directement sur notre site à partir du 1er
              septembre.
            </p>
          </div>
        </div>
      </section>

      <section className="fr-container">
        <div className={styles['top-section-content']}>
          <KnowMore
            variant="purple"
            knowMore={{
              title: 'A savoir',
              description:
                'Si vous avez plusieurs enfants, vous devez récupérer un pass pour chaque enfant.',
            }}
          />

          <p>
            Si vous <span className="fr-text--bold">êtes éligibles</span>, vous recevrez un courriel
            ou un SMS avec votre pass Sport :
          </p>

          <ul className="fr-ml-2w">
            <li>
              <span className="fr-text--bold">30-31 août</span> : pour environ{' '}
              <span className="fr-text--bold">80% des bénéficiaires ;</span>
            </li>
            <li>
              <span className="fr-text--bold">Entre mi-octobre et mi-novembre</span> : pour les{' '}
              <span className="fr-text--bold">étudiants boursiers.</span>
            </li>
          </ul>

          <p>
            <span className="fr-text--bold">Exception pour les bénéficiaires de l&apos;AEEH</span> :
            demandez votre pass Sport directement sur notre site à partir du 1er septembre.
          </p>
        </div>
      </section>

      {process.env.NEXT_PUBLIC_CODES_OBTAINABLE === 'yes' ? (
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
