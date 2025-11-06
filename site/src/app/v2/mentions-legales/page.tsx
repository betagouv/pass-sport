import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import PageTitle from '../../../../components/PageTitle/PageTitle';
import styles from './style.module.scss';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Link from 'next/link';
import Button from '@codegouvfr/react-dsfr/Button';
import { CONTACT_PAGE_QUERYPARAMS } from '../../constants/search-query-params';

export const metadata: Metadata = {
  title: 'Mentions légales - pass Sport',
};

export default function MentionsLegales() {
  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle
          title="Mentions légales"
          subtitle=""
          classes={{
            container: styles['page-header'],
          }}
        />

        <div className={styles.wrapper}>
          <section className="fr-mb-4w">
            <h2 className="fr-mb-2w">Éditeur de la plateforme</h2>
            <p className="fr-mb-2w">La Plateforme pass Sport est éditée par :</p>
            <p className="fr-mb-2w">
              La Direction des sports du ministère des sports et des jeux olympiques et
              paralympiques, située :
            </p>
            <p className="fr-mb-2w text--italic">
              <span className="display--block">95 avenue de France</span>
              <span className="display--block">75650 Paris</span>
              <span className="display--block">CEDEX 13</span>
              <span className="display--block">France</span>
            </p>
            <p>
              Téléphone :{' '}
              <Link
                href="tel:+33140459000"
                aria-label="Ouvrir une application pour appeler le 01 40 45 90 00"
              >
                01 40 45 90 00
              </Link>
            </p>
            <p>
              Contact : <Link href="mailto:passsport@sports.gouv.fr">passsport@sports.gouv.fr</Link>
            </p>
          </section>

          <section className="fr-mb-4w">
            <h2 className="fr-mb-2w">Directeur de la publication</h2>
            <p className="fr-mb-2w">Fabienne BOURDAIS, Directrice des sports</p>
          </section>

          <section className="fr-mb-4w">
            <h2 className="fr-mb-2w">Hébergement de la Plateforme</h2>
            <p className="fr-mb-2w">Ce site est hébergé en propre par Scalingo :</p>
            <p className="text--italic">
              <span className="display--block">13 rue Jacques Peirotes</span>
              <span className="display--block">67000 Strasbourg </span>
              <span className="display--block">France</span>
            </p>
          </section>

          <section className="fr-mb-4w">
            <h2 className="fr-mb-2w">Accessibilité</h2>
            <p className="fr-mb-2w">
              La conformité aux normes d&apos;accessibilité numérique est un objectif ultérieur mais
              nous tâchons de rendre ce site accessible à toutes et à tous.
            </p>

            <h3 className="fr-mb-2w">Signaler un dysfonctionnement</h3>
            <p className="fr-mb-2w">
              Si vous rencontrez un défaut d&apos;accessibilité vous empêchant d&apos;accéder à un
              contenu ou une fonctionnalité du site, merci de nous en faire part en contactant le
              support. Si vous n&apos;obtenez pas de réponse rapide de notre part, vous êtes en
              droit de faire parvenir vos doléances ou une demande de saisine au Défenseur des
              droits.
            </p>
            <Button
              className="fr-mb-2w"
              priority="primary"
              size="large"
              linkProps={{
                href: `/v2/une-question?${CONTACT_PAGE_QUERYPARAMS.modalOpened}=1`,
                'aria-label': 'Naviguer vers la page de formulaire de contact du support',
              }}
            >
              Contacter le support
            </Button>

            <h3 className="fr-mb-2w">En savoir plus</h3>
            <p>
              Pour en savoir plus sur la politique d&apos;accessibilité numérique de l&apos;État :{' '}
              <Link
                href="http://references.modernisation.gouv.fr/accessibilite-numerique"
                target="_blank"
                aria-label="Ouvrir une nouvelle fenêtre vers la politique d'accessibilité numérique de l'État"
              >
                http://references.modernisation.gouv.fr/accessibilite-numerique
              </Link>
            </p>
          </section>

          <section>
            <h2 className="fr-mb-2w">Sécurité</h2>
            <p>
              Le site est protégé par un certificat électronique, matérialisé pour la grande
              majorité des navigateurs par un cadenas. Cette protection participe à la
              confidentialité des échanges. En aucun cas les services associés à la plateforme ne
              seront à l&apos;origine d&apos;envoi de courriels pour demander la saisie
              d&apos;informations personnelles.
            </p>
          </section>
        </div>
      </main>

      <SocialMediaPanel titleAs="h2" />
    </>
  );
}
