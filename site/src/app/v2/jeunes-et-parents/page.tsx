import { Metadata } from 'next';
import styles from './styles.module.scss';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import cn from 'classnames';
import Link from 'next/link';
import Image from 'next/image';
import basketball from '@/images/jeunes-et-parents/basketball.webp';
import code from '@/images/code.svg';
import { JEUNES_PARENTS_PAGE_ANCHORS } from '@/app/v2/jeunes-et-parents/constants/anchors';
import ObtainCodeButton from '@/app/v2/jeunes-et-parents/components/ObtainCodeButton';
import { FAQ_PAGE_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { DISPLAY_TYPE } from '@/app/constants/display-type';
import { AccordionsFaq } from '@/app/v2/jeunes-et-parents/components/AccordionsFaq';
import { CAF, CROUS, MSA } from '@/app/v2/accueil/components/acronymes/Acronymes';
import GuidingBlock from '@/app/components/guided-block/GuidingBlock';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Jeunes et parents',
  };
}

export default function Page() {
  return (
    <main className={styles['container']} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
      <PageTitle title="Jeunes et parents" />

      <div className={cn(['fr-container', styles.container])}>
        <section className={styles['guiding-block__container']}>
          <GuidingBlock
            description="Le pass Sport permet de bénéficier d'une réduction immédiate de 50€ lors d'une inscription sportive. Ce dispositif est financé par le ministère chargé des Sports."
            variant="purple"
            fullWidth
            points={[
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
              description: 'Vous pouvez utiliser votre pass Sport jusqu’au 31 décembre 2026.',
            }}
          />
        </section>

        <section id={JEUNES_PARENTS_PAGE_ANCHORS.FIND_CLUB} className={styles['find-club-section']}>
          <Image
            src={basketball}
            className={cn('fr-responsive-img', styles['find-club-section__image'])}
            alt=""
            loading="eager"
          />

          <div className={styles['find-club-section__description']}>
            <h2 className="fr-h1 fr-mb-0">Trouvez une structure sportive partenaire</h2>
            <p>
              Vous pouvez utiliser le pass Sport dans plus de 85 000 clubs, associations sportives
              et salles de sport partenaires, partout en France.
            </p>

            <p>
              Rapprochez-vous de votre club ou salle de sport avec votre pass Sport ou consultez la
              liste des structures sportives partenaires disponibles ci-dessous.
            </p>

            <ul className="list-style-type--none fr-pl-0">
              <li>
                <span>
                  <Link
                    href="/v2/trouver-un-club"
                    className="fr-link fr-icon-arrow-right-line fr-link--icon-right"
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
          <h2 className="fr-h1 fr-mb-0">Recevez votre pass Sport</h2>
          <div>
            <p>
              Les bénéficiaires recevront leur code pass Sport directement par e-mail mi-septembre
              2026, à l’adresse transmise par les organismes partenaires (<CAF />, <MSA />,{' '}
              <CROUS />
              ). Pensez à vérifier vos courriers indésirables ou spams.
            </p>
            <ObtainCodeButton />
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
            <h2 className="fr-h1">Utilisez votre code</h2>

            <p>
              Le pass Sport prend la forme d&apos;un code composé de 10 caractères alphanumériques,
              différents de ceux de 2025.
            </p>

            <p>
              Pour l&apos;utiliser, il suffira de{' '}
              <span className="fr-text--bold">
                présenter votre code à votre club ou salle de sport au moment de l&apos;inscription
              </span>
              . Celui-ci déduira automatiquement la valeur faciale du prix de la licence ou de
              l&apos;abonnement au moment de l&apos;inscription.
            </p>

            <p>
              Le pass Sport est{' '}
              <span className="fr-text--bold">valable jusqu&apos;au 31 décembre 2026.</span>
            </p>
          </div>
        </section>

        <section id={JEUNES_PARENTS_PAGE_ANCHORS.FAQ} className={styles['faq-section']}>
          <h2 className="fr-mb-2w">Une question ?</h2>
          <AccordionsFaq />

          <p className="fr-mt-4w">
            <Link
              href={`/v2/une-question?${FAQ_PAGE_QUERY_PARAMS.displayType}=${DISPLAY_TYPE.BENEF}`}
              className="fr-link fr-link--icon-right fr-icon-arrow-right-line"
            >
              Voir plus de questions
            </Link>
          </p>
        </section>

        {/*todo: enable later*/}
        {/*<section className={styles['decret-section']}>*/}
        {/*  <h2 className="fr-h4">Texte de référence</h2>*/}
        {/*  <Link*/}
        {/*    href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000051872024/"*/}
        {/*    target="_blank"*/}
        {/*    className="align-self--baseline fr-link"*/}
        {/*    title="Décret n° 2026-630 du 8 juillet 2026 relatif au « Pass'Sport » 2026 - nouvelle fenêtre"*/}
        {/*  >*/}
        {/*    Décret n° 2026-630 du 8 juillet 2026 relatif au « Pass&apos;Sport » 2026*/}
        {/*  </Link>*/}
        {/*</section>*/}
      </div>
    </main>
  );
}
