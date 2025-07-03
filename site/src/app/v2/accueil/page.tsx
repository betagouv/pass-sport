import styles from './styles.module.scss';
import SocialMediaPanel from '../../components/social-media-panel/SocialMediaPanel';
import cn from 'classnames';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Image from 'next/image';
import passSportLines from '@/images/homepage/pass-sport-lines.webp';
import runningTracks from '@/images/homepage/running-tracks.png';
import wheelchairBasketball from '@/images/homepage/wheelchair-basketball.png';
import Link from 'next/link';
import { getCategoriesWithArticles } from '@/app/v2/une-question/server-agent';
import ContentSection from '@/app/v2/une-question/components/ContentSection/ContentSection';
import SimplifiedEligibilityTest from '@/app/components/simplified-eligibility-test/SimplifiedEligibilityTest';

export const metadata: Metadata = {
  title: 'Accueil - pass Sport',
  description: "Page d'accueil du site pass.sports.gouv.fr pour les particuliers",
};

export default async function Accueil() {
  const categoriesWithArticles = await getCategoriesWithArticles({ isProVersion: false });
  const categoriesWithArticlesPro = await getCategoriesWithArticles({ isProVersion: true });

  return (
    <>
      <main className={styles.main} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <section className={styles['top-section__wrapper']}>
          <div className="fr-container">
            <Image src={passSportLines} className={styles['top-section__wrapper-image']} alt="" />

            <div className={styles['top-section__content']}>
              <div>
                <h1 className="fr-text--bold">Sportif entre 6 et 30 ans ?</h1>
                <h2 className="fr-text--xl fr-text--regular">
                  Bénéficiaire de l’AEEH, ARS, AAH, d’une bourse du CROUS ou d’une Bourse régionale
                  pour une formation sanitaire ou sociale ?
                </h2>
              </div>

              <div>
                <p className="fr-mb-2w">Réduction immédiate</p>
                <p>
                  de <span className={styles['amount']}>70€</span>
                </p>
                <p>dans les clubs partenaires</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className={styles['eligibility-section']}>
            <div className="fr-container fr-grid-row fr-grid-row--center">
              <SimplifiedEligibilityTest />
            </div>
          </div>
        </section>

        <section className="fr-container">
          <div className={styles['benef-faq']}>
            <h1 className="fr-mb-5w">Qu&apos;est-ce que le pass Sport ?</h1>
            <p className="fr-mb-2w">
              Le pass Sport est une aide financière de 70 € par enfant pour couvrir tout ou partie
              des frais d’inscription dans un club, association sportive ou salle de sport
              partenaire.
            </p>

            <p>
              Cette aide s’adresse aux enfants et aux jeunes qui rencontrent des obstacles à la
              pratique sportive – qu’ils soient d’ordre financier, social ou liés à un handicap.
              L’objectif : leur permettre d’accéder durablement à une activité physique encadrée, au
              sein d’un environnement structurant, éducatif et sécurisé.
            </p>

            <ContentSection
              categoriesWithArticles={categoriesWithArticles}
              isFromMainPage={false}
            />
          </div>
        </section>

        <section className={cn('fr-container', styles['first-middle-section'])}>
          <div className={styles['first-middle-section__description']}>
            <h1>Où faire du sport ?</h1>
            <p>Trouvez votre activité dans l’une de nos structures partenaires.</p>
            <Link
              href="/v2/trouver-un-club"
              className="fr-btn fr-btn--tertiary fr-btn--icon-right fr-icon-arrow-right-line"
            >
              Trouver une structure
            </Link>
          </div>

          <Image
            src={runningTracks}
            alt=""
            className={cn('fr-responsive-img', styles['first-middle-section__image'])}
          />
        </section>

        <section className="fr-container">
          <div className={styles['benef-faq']}>
            <h1 className="fr-mb-5w">Structures partenaires</h1>
            <p className="fr-mb-2w">
              Clubs, associations sportives ou salles de sport partenaires, grâce au dispositif pass
              Sport, contribuez à accueillir encore plus de jeunes dans vos clubs et offrez leur la
              possibilité de bénéficier d’une aide à la pratique par une déduction de 70€ à
              l’inscription qui vous sera intégralement remboursée par l’État.
            </p>

            <ContentSection
              categoriesWithArticles={categoriesWithArticlesPro}
              isFromMainPage={false}
            />
          </div>
        </section>

        <section className={cn('fr-container', styles['second-middle-section'])}>
          <div className={styles['second-middle-section__description']}>
            <h1>Handiguide</h1>
            <p>
              Le guide des activités physiques et sportives pour les personnes en situation de
              handicap.
            </p>

            <span>
              <Link
                href="https://www.handiguide.sports.gouv.fr/"
                target="_blank"
                className="fr-link"
              >
                Consulter le site de l&apos;Handiguide
              </Link>
            </span>
          </div>

          <Image
            src={wheelchairBasketball}
            alt=""
            className={cn('fr-responsive-img', styles['second-middle-section__image'])}
          />
        </section>

        <section className={styles.indicators}>
          <div className="fr-container">
            <div className={styles['indicators__content']}>
              <p>
                <span className={styles['indicators__main-number']}>1 649</span>
                <span className={styles['indicators__description']}>pass Sports activés</span>
              </p>

              <p>
                <span className={styles['indicators__main-number']}>85 000</span>
                <span className={styles['indicators__description']}>clubs partenaires</span>
              </p>

              <p>
                <span className={styles['indicators__main-number']}>4.6/5</span>
                <span className={styles['indicators__description']}>évaluation du dispositif</span>
              </p>
            </div>
          </div>
        </section>
      </main>

      <SocialMediaPanel isHomePage />
    </>
  );
}
