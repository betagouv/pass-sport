import { Metadata } from 'next';
import styles from './styles.module.scss';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import GuidingBlock from '@/app/components/guided-block/GuidingBlock';
import cn from 'classnames';
import Link from 'next/link';
import Image from 'next/image';
import athletism from '@/images/structures/athletism.webp';
import simonRunning from '@/images/structures/simon-running.webp';
import { STRUCTURE_PAGE_ANCHORS } from '@/app/v2/structures/constants/anchors';
import { AccordionsKitCommunication } from '@/app/v2/structures/components/AccordionsKitCommunication';
import { AccordionsBecomePartner } from '@/app/v2/structures/components/AccordionsBecomePartner';
import { AccordionsFaq } from '@/app/v2/structures/components/AccordionsFaq';
import { FAQ_PAGE_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { DISPLAY_TYPE } from '@/app/constants/display-type';
import KnowMore from '@/app/components/know-more/KnowMore';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Structures sportives',
  };
}

export default function Page() {
  return (
    <main className={styles['container']} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
      <PageTitle title="Structures sportives" />

      <div className={cn(['fr-container', styles.container])}>
        <section className={styles['guiding-block__container']}>
          <GuidingBlock
            description="Le pass Sport permet de bénéficier d'une réduction immédiate de 70€ lors d'une inscription sportive. Ce dispositif est financé par le ministère chargé des Sports."
            variant="yellow"
            fullWidth
            points={[
              {
                title: 'Consultez les outils pour les structures sportives',
                linkProps: {
                  href: `#${STRUCTURE_PAGE_ANCHORS.BECOME_PARTNER}`,
                },
              },
              {
                title: 'Téléchargez votre kit de communication',
                linkProps: {
                  href: `#${STRUCTURE_PAGE_ANCHORS.COMMUNICATION_KIT}`,
                },
              },
              {
                title: 'Créez votre Compte Asso',
                linkProps: {
                  href: `#${STRUCTURE_PAGE_ANCHORS.LE_COMPTE_ASSO_ACCOUNT}`,
                },
              },
              {
                title: 'Saisissez les codes des bénéficiaires',
                linkProps: {
                  href: `#${STRUCTURE_PAGE_ANCHORS.INPUT_CODES}`,
                },
              },
              {
                title: 'Recevez le remboursement',
                linkProps: {
                  href: `#${STRUCTURE_PAGE_ANCHORS.GET_REFUNDS}`,
                },
              },
            ]}
            knowMore={{
              title: 'A savoir',
              description:
                'Tous les bénéficiaires n’ont pas encore reçu leur pass Sport, vous pouvez leur proposer de prendre un chèque de caution de 70€. Nous vous remercions pour votre mobilisation.',
            }}
          />
        </section>

        <section
          id={STRUCTURE_PAGE_ANCHORS.BECOME_PARTNER}
          className={styles['become-partner-section']}
        >
          <h2 className="fr-mb-0 fr-h1">Consultez les outils pour les structures sportives</h2>
        </section>

        <section className={styles['become-partner-section__accordions']}>
          <AccordionsBecomePartner />
        </section>

        <section
          id={STRUCTURE_PAGE_ANCHORS.COMMUNICATION_KIT}
          className={styles['communication-kit-section']}
        >
          <Image
            src={athletism}
            className={cn('fr-responsive-img', styles['communication-kit-section__image'])}
            alt=""
          />

          <div className={styles['communication-kit-section__description']}>
            <h2>Téléchargez votre kit de communication</h2>
            <p>
              Le ministère chargé des Sports a élaboré un ensemble d&apos;outils et supports de
              communication qui sont mis à disposition des acteurs et peuvent être utilisés pour
              assurer la promotion du dispositif.
            </p>
          </div>
        </section>

        <section className={styles['communication-kit-section__accordions']}>
          <AccordionsKitCommunication />
        </section>

        <section
          id={STRUCTURE_PAGE_ANCHORS.LE_COMPTE_ASSO_ACCOUNT}
          className={styles['lca-section']}
        >
          <h2 className="fr-h1">Créez votre Compte Asso</h2>
          {/*<KnowMore*/}
          {/*  variant="yellow"*/}
          {/*  knowMore={{*/}
          {/*    title: 'A savoir',*/}
          {/*    description: `Vous pouvez suivre la procédure de création pas à pas en visionnant cette vidéo tutoriel.`,*/}
          {/*  }}*/}
          {/*/>*/}
          <p>
            Sur Le Compte Asso, vous pourrez créer un compte pour devenir partenaire du dispositif,
            entrer les codes pass Sport et suivre vos remboursements.
          </p>
          <Link
            className="fr-link fr-icon-download-line fr-link-icon--right align-self--baseline"
            target="_blank"
            aria-label="Ouvrir une nouvelle fenêtre vers Le Compte Asso"
            href="https://lecompteasso.associations.gouv.fr/"
          >
            Le Compte Asso
          </Link>
          <p>
            Si vous avez déjà un compte sur Le Compte Asso, actualisez votre profil en téléversant
            votre justificatif d&apos;éligibilité dans la section « affiliations et adhérents
            personnes morales » :
          </p>
          <ul className="fr-ml-2w fr-mt-n3w">
            <li>
              Clubs affiliés à une fédération sportive agréée par le ministère chargé des Sports :
              attestation d&apos;affiliation (une attestation par fédération affiliée) ;
            </li>
            <li>
              Associations agréées Jeunesse Education Populaire (JEP) ou Sport : agrément JEP ou
              Sport valide ;
            </li>
            <li>Structures des loisirs sportifs marchands : charte d&apos;engagement 2025.</li>
          </ul>

          <section>
            <p className="fr-mt-2w">
              <Link
                href="https://view.genially.com/68ca5c87e161eb800feb72cf/guide-clubs-affiliees-a-une-fede-agreee-ministere-charge-des-sports"
                target="_blank"
                className="fr-link"
              >
                Consulter le tutoriel pour les structures affiliées
              </Link>
            </p>

            <p className="fr-mt-2w">
              <Link
                href="https://view.genially.com/68c96700f88999c4be85cef4/guide-assos-avec-un-agrement-jep-ou-sport"
                target="_blank"
                className="fr-link"
              >
                Consulter le tutoriel pour les structures agréées Sport ou JEP
              </Link>
            </p>

            <p className="fr-mt-2w">
              <Link
                href="https://view.genially.com/68a832edc26eae6fb0633be1/guide-loisirs-sportifs-marchands-lsm"
                target="_blank"
                className="fr-link"
              >
                Consulter le tutoriel pour les structures Loisirs Sportifs Marchands
              </Link>
            </p>
          </section>
        </section>

        <section id={STRUCTURE_PAGE_ANCHORS.INPUT_CODES} className={styles['input-codes-section']}>
          <h2 className="fr-h1">Saisissez les codes des bénéficiaires</h2>

          <ol className="fr-ml-2w" start={1}>
            <li>Le bénéficiaire vous présente son code alphanumérique (25-XXXX-XXXX).</li>
            <li>
              Votre structure accorde une réduction immédiate de 70€ sur l&apos;inscription du
              bénéficiaire.
            </li>
            <li>
              Sur votre compte Asso, allez dans la section &laquo; Gérer les inscriptions pass Sport
              &raquo;, puis &laquo; Suivi des inscriptions pass Sport &raquo; pour ajouter un
              nouveau bénéficiaire.
            </li>
          </ol>
          <p className="fr-mb-0">
            Vous pouvez saisir les codes des bénéficiaires{' '}
            <span className="fr-text--bold">du 1er septembre jusqu&apos;au 31 décembre 2025</span>.
          </p>

          <p className="fr-mb-0">
            <Link
              href="https://lecompteasso.associations.gouv.fr/"
              target="_blank"
              title="Lien vers Le Compte Asso (nouvelle fenêtre)"
              className="fr-link"
            >
              Le Compte Asso
            </Link>
          </p>
        </section>

        <section id={STRUCTURE_PAGE_ANCHORS.GET_REFUNDS} className={styles['get-refunds-section']}>
          <Image
            src={simonRunning}
            className={cn('fr-responsive-img', styles['get-refunds-section__image'])}
            alt=""
          />

          <div className={styles['get-refunds-section__description']}>
            <h2 className="fr-h1">Recevez le remboursement</h2>

            <KnowMore
              variant="yellow"
              knowMore={{
                title: 'A savoir',
                description: `Une 2ème vague de paiement est en cours. Les structures concernées recevront un remboursement le 31 octobre.`,
              }}
            />

            <p>
              Si votre dossier est correct, les remboursements arriveront dans le mois suivant la
              saisie des codes dans votre compte Asso.
            </p>

            <p>
              Vous pouvez saisir les codes des bénéficiaires{' '}
              <span className="fr-text--bold">du 1er septembre jusqu’au 31 décembre 2025</span>.
            </p>

            <p className="fr-mb-0">
              <Link
                href="https://lecompteasso.associations.gouv.fr/"
                target="_blank"
                title="Lien vers Le Compte Asso (nouvelle fenêtre)"
                className="fr-link"
              >
                Le Compte Asso
              </Link>
            </p>
          </div>
        </section>

        <section id={STRUCTURE_PAGE_ANCHORS.FAQ} className={styles['faq-section']}>
          <h2 className="fr-mb-2w">Une question ?</h2>
          <AccordionsFaq />

          <p className="fr-mt-4w">
            <Link
              href={`/v2/une-question?${FAQ_PAGE_QUERY_PARAMS.displayType}=${DISPLAY_TYPE.PRO}`}
              className="fr-link fr-link--icon-right fr-icon-arrow-right-line"
            >
              Voir plus de questions
            </Link>
          </p>
        </section>

        <section className={styles['decret-section']}>
          <h2 className="fr-h4">Texte de référence</h2>
          <Link
            href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000051872024/"
            target="_blank"
            className="align-self--baseline fr-link"
            aria-label="Ouvrir une nouvelle fenêtre vers le Décret n° 2025-630 du 8 juillet 2025 relatif au « Pass'Sport » 2025"
          >
            Décret n° 2025-630 du 8 juillet 2025 relatif au « Pass&apos;Sport » 2025
          </Link>
        </section>
      </div>
    </main>
  );
}
