import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import PageTitle from '../../../../components/PageTitle/PageTitle';
import styles from './style.module.scss';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Accessibilité - pass Sport',
};

export default function Accessibilite() {
  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle
          title="Accessibilité"
          classes={{
            container: styles['page-header'],
          }}
        />
        <div className={styles.wrapper}>
          <section className="fr-mb-6w">
            <h2 className="fr-mb-1w">Déclaration d&apos;accessibilité</h2>
            <p className="text--italic fr-mb-1w">Établie le 8 août 2025.</p>
            <p>
              La direction des sports du Ministères des Sports, de la Jeunesse et de la Vie
              Associative s&apos;engage à rendre son service accessible conformément à
              l&apos;article 47 de la loi n°2005-102 du 11 février 2005. Cette déclaration
              d&apos;accessibilité s&apos;applique à{' '}
              <Link href="https://www.pass.sports.gouv.fr" className="fr-link">
                https://www.pass.sports.gouv.fr
              </Link>
              .
            </p>

            <p>À cette fin, nous mettons en œuvre les actions suivantes :</p>

            <ul>
              <li>
                <Link
                  href="https://beta.gouv.fr/accessibilite/schema-pluriannuel"
                  className="fr-link"
                >
                  Un schéma pluriannuel de mise en accessibilité
                </Link>{' '}
                ;
              </li>
              <li>Réalisation d&apos;un audit complet RGAA 4.1 d&apos;ici décembre 2025 ;</li>
              <li>Élaboration et suivi d&apos;un plan d&apos;actions annuel.</li>
            </ul>
          </section>

          <section className="fr-mb-6w">
            <h3 className="fr-mb-1w">État de conformité</h3>
            <p>
              pass Sport est non conforme avec le{' '}
              <abbr title="Référentiel général d'amélioration de l'accessibilité">RGAA</abbr>. Le
              site n&apos;a pas été audité depuis sa refonte le 8 août 2025. L&apos;absence de
              résultats d&apos;audit en cours de validité entraîne une déclaration en
              non-conformité. Cependant, l&apos;équipe s&apos;efforce de créer un service accessible
              à tous en suivant les recommandations du RGAA.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h3 className="fr-mb-3w">Amélioration et contact</h3>

            <p>
              Si vous n&apos;arrivez pas à accéder à un contenu ou à un service, vous pouvez
              contacter le responsable de pass Sport pour être orienté vers une alternative
              accessible ou obtenir le contenu sous une autre forme.
            </p>

            <ul>
              <li>
                E-mail :{' '}
                <Link href="contact@pass-sport.beta.gouv.fr" className="fr-link">
                  contact@pass-sport.beta.gouv.fr
                </Link>
              </li>
              <li>
                Adresse :{' '}
                <address>
                  Direction des sports / Ministère des Sports, de la Jeunesse et de la Vie
                  associative, <br />
                  95 avenue de France,
                  <br /> 75013 Paris
                </address>
              </li>
            </ul>

            <p>Nous essayons de répondre sous 7 jours ouvrés.</p>
          </section>

          <section className="fr-mb-6w">
            <h3 className="fr-mb-3w">Voies de recours</h3>

            <p>
              Cette procédure est à utiliser dans le cas suivant : vous avez signalé au responsable
              du site internet un défaut d&apos;accessibilité qui vous empêche d&apos;accéder à un
              contenu ou à un des services du portail et vous n&apos;avez pas obtenu de réponse
              satisfaisante.
            </p>

            <p>Vous pouvez :</p>

            <ul>
              <li>
                Écrire un message au{' '}
                <Link
                  href="https://formulaire.defenseurdesdroits.fr/formulaire_saisine/"
                  className="fr-link"
                >
                  Défenseur des droits
                </Link>{' '}
                ;
              </li>
              <li>
                Contacter le{' '}
                <Link
                  href="https://www.defenseurdesdroits.fr/carte-des-delegues"
                  className="fr-link"
                >
                  délégué du Défenseur des droits dans votre région
                </Link>{' '}
                ;
              </li>
              <li>
                Envoyer un courrier par la poste (gratuit, ne pas mettre de timbre) :
                <address>
                  Défenseur des droits
                  <br /> Libre Réponse 71120 <br />
                  75342 Paris CEDEX 07
                </address>
              </li>
            </ul>
          </section>
        </div>
      </main>

      <SocialMediaPanel />
    </>
  );
}
