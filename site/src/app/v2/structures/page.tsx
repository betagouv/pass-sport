import { Metadata } from 'next';
import styles from './styles.module.scss';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import GuidingBlock from '@/app/components/guided-block/GuidingBlock';
import cn from 'classnames';
import Link from 'next/link';
import Image from 'next/image';
import simonRunning from '@/images/structures/simon-running.webp';
import { STRUCTURE_PAGE_ANCHORS } from '@/app/v2/structures/constants/anchors';
import { AccordionsFaq } from '@/app/v2/structures/components/AccordionsFaq';
import { FAQ_PAGE_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { DISPLAY_TYPE } from '@/app/constants/display-type';

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
            description="Vous êtes un club, une association sportive ou un loisir sportif marchand ? Adhérez au pass Sport et contribuez à faciliter l’accès à la pratique sportive des jeunes"
            variant="yellow"
            fullWidth
            points={[
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
              title: 'À savoir',
              description: `Vous pouvez enregistrer les codes pass Sport sur votre Compte Asso jusqu'au 31 décembre 2026.`,
            }}
          />
        </section>

        <section
          id={STRUCTURE_PAGE_ANCHORS.LE_COMPTE_ASSO_ACCOUNT}
          className={styles['lca-section']}
          style={{
            marginTop: '-24px',
          }}
        >
          <h2 className="fr-h1 fr-mb-0">Créez votre Compte Asso</h2>
          <p>
            Sur Le Compte Asso, vous pourrez créer un compte pour devenir partenaire du dispositif,
            entrer les codes pass Sport et suivre vos remboursements.
          </p>
          <Link
            className="fr-link fr-icon-download-line fr-link-icon--right align-self--baseline"
            target="_blank"
            aria-label="Ouvrir une nouvelle fenêtre vers Le Compte Asso"
            href="https://associations.gouv.fr/le-compte-asso"
          >
            Le Compte Asso
          </Link>
          <p>
            Si vous avez déjà un compte sur Le Compte Asso, actualisez votre profil (informations de
            contact, coordonnées bancaires) et déposez votre justificatif d&apos;éligibilité dans la
            section « affiliations et adhérents personnes morales » :
          </p>
          <ul className="fr-ml-2w fr-mt-n3w">
            <li>
              Clubs affiliés à une fédération sportive agréée par le ministère chargé des Sports :
              attestation d&apos;affiliation (une attestation par fédération affiliée) ;
            </li>
            <li>
              Associations agréées Jeunesse Éducation Populaire (JEP) ou Sport : agrément JEP ou
              Sport valide ;
            </li>
            <li>Structures des loisirs sportifs marchands : charte d&apos;engagement 2026.</li>
          </ul>

          {/* todo: enable later when we have up to date versions of the tutorials */}
        </section>

        <section id={STRUCTURE_PAGE_ANCHORS.INPUT_CODES} className={styles['input-codes-section']}>
          <h2 className="fr-h1 fr-mb-0">Saisissez les codes des bénéficiaires</h2>

          <ol className="fr-ml-2w" start={1}>
            <li>Le bénéficiaire vous présente son code alphanumérique (26-XXXX-XXXX).</li>
            <li>
              Votre structure accorde une réduction immédiate sur l&apos;inscription du
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
            <span className="fr-text--bold">jusqu&apos;au 31 décembre 2026</span>.
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
            <h2 className="fr-h1 fr-mb-0">Modalités de remboursement du pass Sport</h2>
            <ol>
              <li>Saisissez vos pass Sport sur Le Compte Asso jusqu&apos;au 31 décembre 2026.</li>
              <li>Une fois les pass Sport saisis, votre dossier est instruit.</li>
              <li>
                Après vérification et validation du dossier, le paiement vous sera versé le mois
                suivant.
              </li>
            </ol>

            <p>
              Vous pouvez saisir les codes des bénéficiaires{' '}
              <span className="fr-text--bold">jusqu&apos;au 31 décembre 2026</span>.
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
        {/* todo: enable later when we will have the signed decret */}
        {/*<section className={styles['decret-section']}>*/}
        {/*  <h2 className="fr-h4">Texte de référence</h2>*/}
        {/*  <Link*/}
        {/*    href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000051872024/"*/}
        {/*    target="_blank"*/}
        {/*    className="align-self--baseline fr-link"*/}
        {/*    aria-label="Ouvrir une nouvelle fenêtre vers le Décret n° 2025-630 du 8 juillet 2025 relatif au « Pass'Sport » 2025"*/}
        {/*  >*/}
        {/*    Décret n° 2025-630 du 8 juillet 2025 relatif au « Pass&apos;Sport » 2025*/}
        {/*  </Link>*/}
        {/*</section>*/}
      </div>
    </main>
  );
}
