import { Metadata } from 'next';
import styles from './styles.module.scss';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import GuidingBlock from '@/app/components/guided-block/GuidingBlock';
import cn from 'classnames';
import SimplifiedEligibilityTest from '@/app/components/simplified-eligibility-test/SimplifiedEligibilityTest';
import Link from 'next/link';
import Image from 'next/image';
import basketball from '@/images/jeunes-et-parents/basketball.webp';
import code from '@/images/code.svg';
import KnowMore from '@/app/components/know-more/KnowMore';
import { JEUNES_PARENTS_PAGE_ANCHORS } from '@/app/v2/jeunes-et-parents/constants/anchors';
import ObtainCodeButton from '@/app/v2/jeunes-et-parents/components/ObtainCodeButton';
import ContactAeehSection from '@/app/v2/jeunes-et-parents/components/ContactAeehSection';
import { CODES_OBTAINABLE } from '@/app/constants/env';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Jeunes et parents',
  };
}

export default function Page() {
  return (
    <main className={styles['container']} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
      <PageTitle title="Jeunes et parents" />

      <div className="fr-container">
        <section className={styles['guiding-block__container']}>
          <GuidingBlock
            description="Le pass Sport est une aide financière de 70 € par jeune éligible pour couvrir tout ou partie des frais d'inscription dans un club, association sportive ou salle de sport partenaire. Il prend la forme d'une réduction immédiate lors de l'inscription. C'est un dispositif du ministère des Sports, de la Jeunesse et de la Vie associative."
            variant="purple"
            fullWidth
            points={[
              {
                title: 'Testez votre éligibilité en 1 min',
                linkProps: {
                  href: `#${JEUNES_PARENTS_PAGE_ANCHORS.ELIGIBILITY_TEST}`,
                },
              },
              {
                title: 'Trouvez une structure sportive partenaire',
                linkProps: {
                  href: `#${JEUNES_PARENTS_PAGE_ANCHORS.FIND_CLUB}`,
                },
              },
              {
                title: 'Recevez ou demandez votre pass Sport',
                linkProps: {
                  href: `#${JEUNES_PARENTS_PAGE_ANCHORS.RECEIVE_CODE}`,
                },
              },
              {
                title: 'Utilisez votre code',
                linkProps: {
                  href: `#${JEUNES_PARENTS_PAGE_ANCHORS.ACTIVATE_CODE}`,
                },
              },
            ]}
            knowMore={{
              title: 'A savoir',
              description:
                'Vous pourrez recevoir ou demander le pass Sport à partir du 1er septembre 2025.',
            }}
          />
        </section>

        <section id={JEUNES_PARENTS_PAGE_ANCHORS.ELIGIBILITY_TEST}>
          <div className={styles['eligibility-section__description']}>
            <h1 className="fr-mb-2w">Testez votre éligibilité en 1 min</h1>

            <section className="fr-mb-2w">
              <p>Qui est concerné par le pass Sport ?</p>
              <ul className="fr-mt-2w fr-pl-4w">
                <li>
                  Les jeunes de 14 à 17 ans bénéficiaires de l’Allocation de Rentrée Scolaire (ARS)
                  ;
                </li>
                <li>
                  Les jeunes en situation de handicap :
                  <ul className="list-style-type--circle">
                    <li>
                      de 6 à 19 ans bénéficiaires de l’Allocation d’Éducation de l’Enfant Handicapé
                      (AEEH) ;
                    </li>
                    <li>
                      de 16 à 30 ans bénéficiaires de l’Allocation aux Adultes Handicapés (AAH) ;
                    </li>
                  </ul>
                </li>
                <li>
                  Les étudiants boursiers de moins de 28 ans bénéficiaires d’une bourse attribuée
                  avant le 15 octobre 2025 :
                  <ul className="list-style-type--circle">
                    <li>bourse du CROUS (y compris l’aide annuelle) ;</li>
                    <li>bourse régionale formations sanitaires et sociales.</li>
                  </ul>
                </li>
              </ul>
            </section>
          </div>

          <section
            className={styles['eligibility-section']}
            id={SKIP_LINKS_ID.eligibilityTestButton}
          >
            <div className={cn('fr-container', styles['eligibility-section__wrapper'])}>
              <SimplifiedEligibilityTest
                display="row"
                buttonVariant="primary"
                headingLevel="h2"
                jeDonneMonAvisBtnPadding={false}
                displaySeparator={false}
              />
            </div>
          </section>
        </section>

        <section id={JEUNES_PARENTS_PAGE_ANCHORS.FIND_CLUB} className={styles['find-club-section']}>
          <Image
            src={basketball}
            className={cn('fr-responsive-img', styles['find-club-section__image'])}
            alt=""
          />

          <div className={styles['find-club-section__description']}>
            <h1>Trouvez une structure sportive partenaire</h1>
            <p>
              Vous pouvez utiliser le pass Sport dans plus de 85 000 clubs, associations sportives
              et salles de sport partenaires, partout en France.
            </p>

            <p>
              Rapprochez-vous de votre club avec votre pass Sport ou consultez la liste des
              structures sportives partenaires disponibles ci-dessous.
            </p>

            <ul className="list-style-type--none fr-pl-0">
              <li>
                <span>
                  <Link
                    href="/v2/trouver-un-club"
                    className="fr-link fr-icon-arrow-right-line fr-link--icon-right"
                    target="_blank"
                  >
                    Liste de structures sportives partenaires
                  </Link>
                </span>
              </li>
              <li>
                <span>
                  <Link
                    href="https://www.handiguide.sports.gouv.fr/"
                    className="fr-link fr-icon-arrow-right-line fr-link--icon-right"
                    target="_blank"
                    aria-label="Ouvrir une nouvelle fenêtre vers le site HandiGuide"
                  >
                    HandiGuide des sports pour une liste de structures sportives accueillant des
                    personnes en situation de handicap
                  </Link>
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section
          id={JEUNES_PARENTS_PAGE_ANCHORS.RECEIVE_CODE}
          className={styles['receive-code-section']}
        >
          <h1>Recevez votre pass Sport</h1>
          <KnowMore
            variant="purple"
            knowMore={{
              title: 'A savoir',
              description: `Vous pourrez recevoir ou demander le pass Sport à partir du 1er septembre et l'utiliser jusqu'au 31 décembre 2025.`,
            }}
          />
          <div>
            <p>
              Si vous <span className="fr-text--bold">êtes éligible</span>, vous recevrez un
              courriel ou un SMS avec votre pass Sport :
            </p>
            <ol className="fr-ml-2w" start={1}>
              <li>
                <span className="fr-text--bold">26-28 août</span> : pour les bénéficiaires de
                l&apos;ARS, de l&apos;AEEH et de l&apos;AAH ;
              </li>
              <li>
                <span className="fr-text--bold">Entre fin octobre et fin novembre</span> : pour les
                étudiants boursiers.
              </li>
            </ol>
            <section className="fr-my-4w" id={SKIP_LINKS_ID.aeehContent}>
              <KnowMore
                variant="yellow"
                knowMore={{
                  title: `Exception pour les bénéficiaires de l'AEEH entre 6 et 13 ans`,
                  description: CODES_OBTAINABLE
                    ? 'Demandez votre pass Sport directement à partir de ce formulaire'
                    : `Demandez votre pass Sport directement sur notre site à partir du 1er septembre.`,
                }}
              >
                {CODES_OBTAINABLE && <ContactAeehSection />}
              </KnowMore>
              {/* todo: confirm with Julianne */}
              {/*<p>*/}
              {/*  <span className="fr-text--bold">*/}
              {/*    Exception pour les bénéficiaires de l&apos;AEEH*/}
              {/*  </span>{' '}*/}
              {/*  : demandez votre pass Sport directement sur notre site à partir du 1er septembre.*/}
              {/*</p>*/}
            </section>
            Si, après cette date vous n&apos;avez pas reçu votre pass Sport :
            <ol className="fr-ml-2w" start={1}>
              <li>Vérifiez dans vos spams ou indésirables.</li>
              <li>
                Vérifiez votre éligibilité à l&apos;aide du test. <br />
                <Link href={`#${JEUNES_PARENTS_PAGE_ANCHORS.ELIGIBILITY_TEST}`}>
                  Testez votre éligibilité.
                </Link>
              </li>
              <li>Récupérer votre code sur ce site (après le 1er septembre).</li>
            </ol>
            <ObtainCodeButton />
            <p>
              Vous pourrez utiliser votre pass Sport{' '}
              <span className="fr-text--bold">jusqu&apos;au 31 décembre 2025.</span>
            </p>
          </div>
        </section>

        <section
          id={JEUNES_PARENTS_PAGE_ANCHORS.ACTIVATE_CODE}
          className={styles['activate-code-section']}
        >
          <Image
            src={code}
            className={cn('fr-responsive-img', styles['activate-code-section__image'])}
            alt=""
          />

          <div className={styles['activate-code-section__description']}>
            <h1>Utilisez votre code</h1>

            <p>
              Pour l&apos;utiliser, il suffira de{' '}
              <span className="fr-text--bold">
                présenter son code à son club ou sa salle de sport au moment de l&apos;inscription.
              </span>{' '}
              Celui-ci déduira automatiquement 70€ du prix de la licence ou de l&apos;abonnement au
              moment de l&apos;inscription.
            </p>

            <p>
              Le pass Sport est{' '}
              <span className="fr-text--bold">valable du 1er septembre au 31 décembre 2025.</span>
            </p>
          </div>
        </section>

        <section className={styles['decret-section']}>
          <h1 className="fr-h4">Texte de référence</h1>
          <Link
            href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000051872024/"
            target="_blank"
            className="align-self--baseline"
            aria-label="Ouvrir une nouvelle fenêtre vers le Décret n° 2025-630 du 8 juillet 2025 relatif au « Pass'Sport » 2025"
          >
            Décret n° 2025-630 du 8 juillet 2025 relatif au « Pass&apos;Sport » 2025
          </Link>
        </section>
      </div>
    </main>
  );
}
