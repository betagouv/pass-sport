import styles from './styles.module.scss';
import cn from 'classnames';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Image from 'next/image';
import passSportLogoWhite from '@/images/pass-sport-logo-white.svg';
import leftLines from '@/images/homepage/left-lines.svg';
import rightLines from '@/images/homepage/right-lines.svg';
import lucie from '@/images/homepage/lucie.jpg';
import Link from 'next/link';
import SimplifiedEligibilityTest from '@/app/components/simplified-eligibility-test/SimplifiedEligibilityTest';
import GuidingBlock, { GuidingBlockProps } from '@/app/components/guided-block/GuidingBlock';
import MainTiles from '@/app/v2/accueil/components/main-tiles/MainTiles';
import { STRUCTURE_PAGE_ANCHORS } from '@/app/v2/structures/constants/anchors';
import { JEUNES_PARENTS_PAGE_ANCHORS } from '@/app/v2/jeunes-et-parents/constants/anchors';

export const metadata: Metadata = {
  title: 'Accueil - pass Sport',
  description: "Page d'accueil du site pass.sports.gouv.fr pour les particuliers",
};

const [guidingBlocks1, guidingBlocks2]: GuidingBlockProps[] = [
  {
    variant: 'purple',
    title: 'Pour les jeunes',
    description: 'Comment bénéficier du pass Sport pour votre inscription sportive ?',
    knowMore: {
      title: 'A savoir',
      description:
        'Vous pourrez recevoir ou demander le pass Sport à partir du 1er septembre 2025.',
    },
    points: [
      {
        title: 'Testez votre éligibilité en 1 min',
        linkProps: {
          href: `/v2/jeunes-et-parents#${JEUNES_PARENTS_PAGE_ANCHORS.ELIGIBILITY_TEST}`,
        },
      },
      {
        title: 'Choisissez un club partenaire',
        linkProps: {
          href: `/v2/jeunes-et-parents#${JEUNES_PARENTS_PAGE_ANCHORS.FIND_CLUB}`,
        },
      },
      {
        title: 'Recevez ou demandez votre pass Sport',
        linkProps: {
          href: `/v2/jeunes-et-parents#${JEUNES_PARENTS_PAGE_ANCHORS.RECEIVE_CODE}`,
        },
      },
      {
        title: 'Activez votre code',
        linkProps: {
          href: `/v2/jeunes-et-parents#${JEUNES_PARENTS_PAGE_ANCHORS.ACTIVATE_CODE}`,
        },
      },
    ],
  },
  {
    variant: 'yellow',
    title: 'Pour les structures',
    description: 'Comment devenir partenaire et accompagner vos adhérents ?',
    knowMore: {
      title: 'A savoir',
      description:
        'Vous pourrez récolter les codes auprès des jeunes et les enregistrer sur le Compte Asso à partir du 1er septembre 2025.',
    },
    points: [
      {
        title: 'Devenez partenaire du pass Sport',
        linkProps: {
          href: `/v2/structure#${STRUCTURE_PAGE_ANCHORS.BECOME_PARTNER}`,
        },
      },
      {
        title: 'Téléchargez votre kit de communication',
        linkProps: {
          href: `/v2/structure#${STRUCTURE_PAGE_ANCHORS.COMMUNICATION_KIT}`,
        },
      },
      {
        title: 'Créez votre Compte Asso',
        linkProps: {
          href: `/v2/structure#${STRUCTURE_PAGE_ANCHORS.LE_COMPTE_ASSO_ACCOUNT}`,
        },
      },
      {
        title: 'Saisissez les codes des bénéficiaires',
        linkProps: {
          href: `/v2/structure#${STRUCTURE_PAGE_ANCHORS.INPUT_CODES}`,
        },
      },
      {
        title: 'Obtenez le remboursement de l’inscription',
        linkProps: {
          href: `/v2/structure#${STRUCTURE_PAGE_ANCHORS.GET_REFUNDS}`,
        },
      },
    ],
  },
];

export default async function Accueil() {
  return (
    <>
      <main className={styles.main} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <section className={styles['top-section__wrapper']}>
          <div className="fr-container">
            <Image src={leftLines} className={styles['top-section__wrapper-left-image']} alt="" />
            <Image src={rightLines} className={styles['top-section__wrapper-right-image']} alt="" />

            <div className={styles['top-section__content']}>
              <section className={styles['top-section__content-title']}>
                <Image src={passSportLogoWhite} alt="" />
                <h1 className="fr-text--heavy">
                  70 € de réduction immédiate
                  <span className="display--block">sur l&apos;inscription sportive</span>
                </h1>
              </section>

              <MainTiles titleAs="h2" />
            </div>
          </div>
        </section>

        <section className={styles['guiding-blocks']}>
          <GuidingBlock {...guidingBlocks1} />
          <GuidingBlock {...guidingBlocks2} />
        </section>

        <section>
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

        <section className="fr-container">
          <div className={styles['benef-faq']}>
            <h1 className="fr-mb-5w">Qu&apos;est-ce que le pass Sport ?</h1>
            <p className="fr-mb-2w">
              Valable du 1er septembre au 31 décembre 2025, le pass Sport est une aide financière de
              70€ par enfant pour couvrir tout ou partie des frais d’inscription dans un club,
              association sportive ou salle de sport partenaire qui prend la forme d’une réduction
              immédiate lors de l’inscription.
            </p>

            <p>
              Cette aide du ministère des Sports, de la Jeunesse et de la Vie associative s’adresse
              aux enfants et aux jeunes qui rencontrent des obstacles à la pratique sportive –
              qu’ils soient d’ordre financier, social ou liés à un handicap. L’objectif : leur
              permettre d’accéder durablement à une activité physique encadrée, au sein d’un
              environnement structurant, éducatif et sécurisé.
            </p>

            <div className="fr-my-5w">
              <MainTiles titleAs="h2" />
            </div>

            <h1 className="fr-mb-5w">Une question ?</h1>
            <p className="fr-mb-2w">
              Vous avez consulté les différentes pages sans trouver l’information que vous cherchiez
              ? Vous vous posez des questions sur le pass Sport ?
            </p>
            <Link href="/v2/une-question" className="fr-icon-arrow-right-line fr-link--icon-right">
              Consulter la liste des questions fréquemment posées
            </Link>
          </div>
        </section>

        <section className={cn('fr-container', styles['handiguide-section'])}>
          <div className={styles['handiguide-section__description']}>
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

            <p className={cn(['fr-text--sm', styles['handiguide-section__legend']])}>
              Sur la photo : Lucie Hautiere, médaillée d’or des championnats d’Europe en 2023 et
              participation aux Jeux Paralympiques de Paris 2024 en para tennis de table.
            </p>
          </div>

          <Image
            src={lucie}
            className={cn('fr-responsive-img', styles['handiguide-section__image'])}
            alt=""
          />
        </section>
      </main>
    </>
  );
}
