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
import Button from '@codegouvfr/react-dsfr/Button';
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
            description="Le pass Sport est une aide financière de 70 € par enfant pour couvrir tout ou partie des frais d'inscription dans un club, association sportive ou salle de sport partenaire, qui prend la forme d'une réduction immédiate lors de l'inscription. Dispositif financé par le ministère des Sports, de la Jeunesse et de la Vie associative."
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
                title: 'Choisissez un club partenaire',
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
                title: 'Activez votre code',
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
          <div className={styles['eligibility-section']}>
            <div
              className={cn(
                'fr-container fr-grid-row fr-grid-row--center',
                styles['eligibility-section__wrapper'],
              )}
            >
              <SimplifiedEligibilityTest display="row" buttonVariant="primary" headingLevel="h1" />
            </div>
          </div>
        </section>

        <section id={JEUNES_PARENTS_PAGE_ANCHORS.FIND_CLUB} className={styles['find-club-section']}>
          <Image
            src={basketball}
            className={cn('fr-responsive-img', styles['find-club-section__image'])}
            alt=""
          />

          <div className={styles['find-club-section__description']}>
            <h1>Choisissez un club partenaire</h1>
            <p>
              Vous pouvez utiliser le pass Sport dans plus de 85 000 clubs, associations sportives
              et salles de sport partenaires, partout en France.
            </p>

            <p>
              Rapprochez-vous de votre club avec votre pass Sport ou consultez la liste des
              structures sportives partenaires disponibles ci-dessous.
            </p>

            <span>
              <Link
                href="/v2/trouver-un-club"
                className="fr-link fr-icon-arrow-right-line fr-link--icon-right"
              >
                Liste des structures sportives partenaires
              </Link>
            </span>
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
              Si vous <span className="fr-text--bold">êtes éligibles</span>, vous recevrez un
              courriel ou un SMS avec votre pass Sport :
            </p>
            <ol className="fr-ml-2w" start={1}>
              <li>
                <span className="fr-text--bold">26-28 août</span> : pour environ{' '}
                <span className="fr-text--bold">80% des bénéficiaires ;</span>
              </li>
              <li>
                <span className="fr-text--bold">Entre mi-octobre et mi-novembre</span> : pour les{' '}
                <span className="fr-text--bold">étudiants boursiers.</span>
              </li>
            </ol>
            <p>
              <span className="fr-text--bold">Exception pour les bénéficiaires de l&apos;AEEH</span>{' '}
              : demandez votre pass Sport directement sur notre site à partir du 1er septembre.
            </p>
            Si, après cette date vous n&apos;avez pas reçu votre pass Sport :
            <ol className="fr-ml-2w" start={1}>
              <li>Vérifiez dans vos spams ou indésirables.</li>
              <li>
                Vérifiez votre éligibilité à l&apos;aide du test. <br />
                <Link href={`#${JEUNES_PARENTS_PAGE_ANCHORS.ELIGIBILITY_TEST}`}>
                  Remonter vers le test.
                </Link>
              </li>
              <li>Récupérer votre code sur ce site (après le 1er septembre).</li>
            </ol>
            {CODES_OBTAINABLE && (
              <Button
                className="fr-my-2w"
                linkProps={{
                  href: '/v2/test-ou-code',
                }}
              >
                Demander le pass Sport
              </Button>
            )}
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
            <h1>Activez votre code</h1>
            <p>
              Le pass Sport prend la forme d&apos;un code composé de 10 caractères alphanumériques,
              différents de ceux de 2024.
            </p>

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
