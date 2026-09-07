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
import { AccordionsFaq } from '@/app/v2/structures/components/AccordionsFaq';
import { FAQ_PAGE_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { DISPLAY_TYPE } from '@/app/constants/display-type';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';
import { AccordionsKitCommunication } from '@/app/v2/structures/components/AccordionsKitCommunication';

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
            description="Vous êtes un club, une association sportive ou une structure de loisir sportif marchand ? Adhérez au pass Sport et contribuez à faciliter l’accès à la pratique sportive des jeunes"
            variant="yellow"
            fullWidth
            points={[
              {
                title: 'Kit de communication',
                linkProps: {
                  href: `#${STRUCTURE_PAGE_ANCHORS.COMMUNICATION_KIT}`,
                },
              },
              {
                title: "Conditions d'éligibilité des structures sportives",
                linkProps: {
                  href: `#${STRUCTURE_PAGE_ANCHORS.ELIGIBILITY_CONDITIONS}`,
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
                title: 'Modalités de remboursement du pass Sport',
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
          id={STRUCTURE_PAGE_ANCHORS.COMMUNICATION_KIT}
          className={styles['communication-kit-section']}
        >
          <Image
            src={athletism}
            className={cn('fr-responsive-img', styles['communication-kit-section__image'])}
            alt=""
          />

          <div className={styles['communication-kit-section__description']}>
            <h2>Kit de communication</h2>
            <p>
              Téléchargez les supports de communication du pass Sport pour informer vos adhérents et
              leurs familles : visuels pour les réseaux sociaux, vidéos, affiches, texte prêt à
              l&apos;emploi. Tous les contenus sont prêts à être utilisés ou adaptés à vos besoins.
            </p>
          </div>
        </section>

        <section className={cn(styles['communication-kit-section__accordions'], 'fr-mb-4w')}>
          <AccordionsKitCommunication />
        </section>

        <section
          id={STRUCTURE_PAGE_ANCHORS.ELIGIBILITY_CONDITIONS}
          className={styles['eligibility-conditions-section']}
          style={{
            marginTop: '-24px',
          }}
        >
          <h2 className="fr-h1 fr-mb-0">Conditions d&apos;éligibilité des structures sportives</h2>
          <p className="fr-mb-n8v">
            Pour devenir partenaire du dispositif pass Sport, votre structure doit remplir au moins
            l’une des trois conditions suivantes :
          </p>
          <ol>
            <li>
              <span className="fr-text--bold">Affiliation </span> : vous devez être affilié pour la
              saison 2026-2027 à l&apos;une des fédérations sportives agréées par le ministère des
              Sports, de la Jeunesse et de la Vie associative (à l&apos;exclusion des fédérations
              scolaires).
              <div className="fr-mb-n4v">
                <DownloadLink
                  details="PDF ~ 455 kB"
                  label="Télécharger le tableau des fédérations sportives agréées"
                  href="/assets/partenaires/tableau-federations.pdf"
                />
              </div>
            </li>
            <li>
              <span className="fr-text--bold">Agrément </span> : votre structure doit disposer
              d&apos;un agrément Sport (délivré après 2016) ou Jeunesse Éducation Populaire – JEP
              (délivré après 2021) ET proposer une activité physique et sportive tout au long de
              l&apos;année.
            </li>
            <li>
              <span className="fr-text--bold">Loisir sportif marchand</span> : vous êtes une
              structure à but lucratif du loisir sportif marchand, vous devez signer la charte
              d’engagement du ministère des Sports, de la Jeunesse et de la Vie associative et
              relever d’un des codes NAF suivants :
              <ul className="fr-pl-4w">
                <li>9311Z : gestion d&apos;installations sportives</li>
                <li>9312Z : activités de clubs de sports</li>
                <li>9329Z : autres activités récréatives et de loisirs</li>
                <li>9313Z : activités des centres de culture physique</li>
                <li>
                  8551Z : enseignement de disciplines sportives et d&apos;activités de loisirs
                </li>
                <li>6420Z : activités des sociétés holding</li>
              </ul>
            </li>
          </ol>

          <div className="fr-mt-n8v">
            <DownloadLink
              details="PDF ~ 121 kB"
              label="Télécharger la charte d'engagement 2026"
              href="/assets/partenaires/charte-lsm-2026.pdf"
            />
          </div>

          <p className="fr-mt-n8v fr-mb-4w">
            Si vous ne remplissez pas l&apos;une de ces trois conditions, le dispositif ne vous est
            pas ouvert. Le justificatif d’éligibilité (attestation d&apos;affiliation ou agrément ou
            charte d’engagement) seront vérifiés. En cas de non-éligibilité, les pass Sport saisis
            ne vous seront pas remboursés.
          </p>
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
              Clubs affiliés à une fédération sportive agréée par le ministère des Sports, de la
              Jeunesse et de la Vie associative : attestation d&apos;affiliation (une attestation
              par fédération affiliée) ;
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
            href="https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054761806"
            target="_blank"
            className="align-self--baseline fr-link"
            title="Décret n° 2026-830 du 28 août 2026 relatif au « Pass'Sport » 2026 - nouvelle fenêtre"
          >
            Décret n° 2026-830 du 28 août 2026 relatif au « Pass&apos;Sport » 2026
          </Link>
        </section>
      </div>
    </main>
  );
}
