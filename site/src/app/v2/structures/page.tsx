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
            description="Le pass Sport est une aide financière de 70 € par jeune éligible pour couvrir tout ou partie des frais d'inscription dans un club, association sportive ou salle de sport partenaire. Il prend la forme d'une réduction immédiate lors de l'inscription. C'est un dispositif du ministère des Sports, de la Jeunesse et de la Vie associative."
            variant="yellow"
            fullWidth
            points={[
              {
                title: 'Devenez partenaire du pass Sport',
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
                'Vous pourrez collecter les codes auprès des jeunes et les enregistrer sur le Compte Asso à partir du 1er septembre 2025.',
            }}
          />
        </section>

        <section
          id={STRUCTURE_PAGE_ANCHORS.BECOME_PARTNER}
          className={styles['become-partner-section']}
        >
          <h1 className="fr-mb-0">Devenez partenaire du pass Sport</h1>
          <p>
            En tant que structure proposant une activité physique ou sportive, vous pouvez devenir
            partenaire du dispositif. Des tutoriels seront bientôt à votre disposition sur cet
            espace pour faciliter votre engagement dans le déploiement du pass Sport.
          </p>
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
            <h1>Téléchargez votre kit de communication</h1>
            <p>
              Le ministère des Sports, de la Jeunesse et la Vie associative a élaboré un ensemble
              d&apos;outils et supports de communication qui sont mis à disposition de
              l&apos;ensemble des acteurs et peuvent être utilisés pour assurer la promotion du
              dispositif.
            </p>

            <span>
              <Link href="/v2/partenaires" className="fr-link ">
                Accédez aux ressources
              </Link>
            </span>
          </div>
        </section>

        <section
          id={STRUCTURE_PAGE_ANCHORS.LE_COMPTE_ASSO_ACCOUNT}
          className={styles['lca-section']}
        >
          <h1>Créez votre Compte Asso</h1>
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
              Clubs affiliés aux fédérations sportives agréées par le ministère des Sports, de la
              Jeunesse et de la Vie associative : attestation d&apos;affiliation ;
            </li>
            <li>
              Associations agréées Jeunesse Education Populaire (JEP) ou Sport : agrément JEP ou
              Sport valide ;
            </li>
            <li>Structures des loisirs sportifs marchands : charte d&apos;engagement 2025.</li>
          </ul>
        </section>

        <section id={STRUCTURE_PAGE_ANCHORS.INPUT_CODES} className={styles['input-codes-section']}>
          <h1>Saisissez les codes des bénéficiaires</h1>

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

          <p>
            Vous pourrez saisir les codes des bénéficiaires{' '}
            <span className="fr-text--bold">
              à partir du 1er septembre jusqu’au 31 décembre 2025.
            </span>
          </p>

          <Link
            className="fr-link fr-icon-download-line fr-link-icon--right align-self--baseline"
            target="_blank"
            aria-label="Ouvrir une nouvelle fenêtre vers Le Compte Asso"
            href="https://lecompteasso.associations.gouv.fr/"
          >
            Le Compte Asso
          </Link>
        </section>

        <section id={STRUCTURE_PAGE_ANCHORS.GET_REFUNDS} className={styles['get-refunds-section']}>
          <Image
            src={simonRunning}
            className={cn('fr-responsive-img', styles['get-refunds-section__image'])}
            alt=""
          />

          <div className={styles['get-refunds-section__description']}>
            <h1>Recevez le remboursement</h1>

            <p>
              Des informations seront régulièrement mises à jour sur cette page pour vous informer
              des échéances de paiement.
            </p>

            <p>
              Vous pourrez saisir les codes des bénéficiaires{' '}
              <span className="fr-text--bold">
                à partir du 1er septembre et jusqu’au 31 décembre 2025.
              </span>
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
