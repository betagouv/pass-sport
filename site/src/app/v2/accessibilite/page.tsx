import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import PageTitle from '../../../../components/PageTitle/PageTitle';
import styles from './style.module.scss';
import EligibilityTestBanner from '@/components/eligibility-test-banner/EligibilityTestBanner';
import cn from 'classnames';
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
            <h1 className="fr-mb-1w">Déclaration d’accessibilité</h1>
            <p>
              <strong>
                Direction des Sports/Ministères des Sports, de la Jeunesse et de la Vie Associative
              </strong>{' '}
              s’engage à rendre ses sites internet, intranet, extranet et ses progiciels accessibles
              (et ses applications mobiles et mobilier urbain numérique) conformément à l’article 47
              de la loi n°2005-102 du 11 février 2005.
            </p>

            <p>
              Cette déclaration d’accessibilité s’applique à{' '}
              <Link href="https://www.pass.sports.gouv.fr">
                <strong>https://www.pass.sports.gouv.fr</strong>
              </Link>
              .
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-1w">État de conformité</h2>
            <p>
              <strong>
                Audit de conformité pass Sport{' '}
                <a target="_blank" href="https://www.pass.sports.gouv.fr">
                  https://www.pass.sports.gouv.fr
                </a>
              </strong>{' '}
              est <strong>totalement</strong> conforme avec le référentiel général d’amélioration de
              l’accessibilité (RGAA).
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-1w">Résultats des tests</h2>

            <p>
              L’audit de conformité réalisé par <strong>DINUM (Brigade du Numérique)</strong> révèle
              que <strong>100%</strong> des critères du RGAA version 4 sont respectés.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-3w">Contenus non accessibles</h2>
          </section>

          <section className="fr-mb-6w">
            <h3 className="fr-mb-3w"> Contenus non soumis à l’obligation d’accessibilité </h3>

            <div>
              <p>Lecteur vidéo (Vimeo), Carte interactive (Leaflet)</p>
            </div>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-3w"> Établissement de cette déclaration d’accessibilité </h2>

            <p>
              Cette déclaration a été établie le <strong>25 septembre 2024</strong>. Elle a été mise
              à jour le <strong>30 septembre 2024</strong>.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h3 className="fr-mb-3w"> Technologies utilisées pour la réalisation de l’audit </h3>

            <ul>
              <li>HTML</li>
              <li>CSS</li>
              <li>React</li>
              <li>Javascript</li>
              <li>NextJS</li>
            </ul>
          </section>

          <section className="fr-mb-6w">
            <h3 className="fr-mb-3w">Environnement de test</h3>

            <p>
              Les vérifications de restitution de contenus ont été réalisées sur la base de la
              combinaison fournie par la base de référence du RGAA, avec les versions suivantes :
            </p>

            <ul>
              <li> Sur Mobile iOS avec Safari et VoiceOver</li>
              <li> Sur Ordinateur MacOS avec Safari et VoiceOver</li>
              <li> Sur Ordinateur Windows avec Firefox et JAWS</li>
              <li> Sur Ordinateur Windows avec Firefox et NVDA</li>
            </ul>
          </section>

          <section className="fr-mb-6w">
            <h3 className="fr-mb-3w">Outils pour évaluer l’accessibilité</h3>

            <ul>
              <li>Validateur HTML du W3C</li>
              <li>Inspecteur de composants</li>
              <li>ArcToolkit</li>
              <li>HeadingsMap</li>
              <li>Colour Contrast Analyser</li>
              <li>Web Developer Toolbar</li>
              <li>WCAG Contrast checker</li>
            </ul>
          </section>

          <section className="fr-mb-6w">
            <h3 className="fr-mb-3w">
              Pages du site ayant fait l’objet de la vérification de conformité{' '}
            </h3>

            <ul>
              <li>
                Foire aux Questions{' '}
                <Link href="https://www.pass.sports.gouv.fr/v2/une-question">
                  <strong>https://www.pass.sports.gouv.fr/v2/une-question</strong>
                </Link>
              </li>
              <li>
                Test d&apos;éligibilité{' '}
                <Link href="https://www.pass.sports.gouv.fr/v2/test-eligibilite-base">
                  <strong>https://www.pass.sports.gouv.fr/v2/test-eligibilite-base</strong>
                </Link>
              </li>
              <li>
                Trouver un club{' '}
                <Link href="https://www.pass.sports.gouv.fr/v2/trouver-un-club">
                  <strong>https://www.pass.sports.gouv.fr/v2/trouver-un-club</strong>
                </Link>
              </li>
              <li>
                Tout savoir sur le pass Sport - Pro{' '}
                <Link href="https://www.pass.sports.gouv.fr/v2/pro/tout-savoir-sur-le-pass-sport">
                  <strong>
                    https://www.pass.sports.gouv.fr/v2/pro/tout-savoir-sur-le-pass-sport
                  </strong>
                </Link>
              </li>
              <li>
                Ressources{' '}
                <Link href="https://www.pass.sports.gouv.fr/v2/pro/ressources">
                  <strong>https://www.pass.sports.gouv.fr/v2/pro/ressources</strong>
                </Link>
              </li>
              <li>
                Accueil{' '}
                <Link href="https://www.pass.sports.gouv.fr">
                  <strong>https://www.pass.sports.gouv.fr</strong>
                </Link>
              </li>
              <li>
                Mentions légales{' '}
                <Link href="https://www.pass.sports.gouv.fr/v2/mentions-legales">
                  <strong>https://www.pass.sports.gouv.fr/v2/mentions-legales</strong>
                </Link>
              </li>
              <li>
                Plan du site{' '}
                <Link href="https://www.pass.sports.gouv.fr/v2/plan-du-site">
                  <strong>https://www.pass.sports.gouv.fr/v2/plan-du-site</strong>
                </Link>
              </li>
              <li>
                Page rubrique &ldquo;Tout savoir sur le pass Sport&rdquo;{' '}
                <Link href="https://www.pass.sports.gouv.fr/v2/tout-savoir-sur-le-pass-sport">
                  <strong>https://www.pass.sports.gouv.fr/v2/tout-savoir-sur-le-pass-sport</strong>
                </Link>
              </li>
              <li>
                Page du pass Sport{' '}
                <Link href="https://www.pass.sports.gouv.fr/v2/code/scan#S%2FnFnOd4tAmYWbSP0HVDP0PZ0ghnU0kyCniT3Xvgq7C%2Fpf6SGZemYoMybHzrA3AWi0PgM4cVstYazR%2BksyNspChNTBD%2BZBImK9y68pP2ERw%3D">
                  <strong>
                    https://www.pass.sports.gouv.fr/v2/code/scan#S%2FnFnOd4tAmYWbSP0HVDP0PZ0ghnU0kyCniT3Xvgq7C%2Fpf6SGZemYoMybHzrA3AWi0PgM4cVstYazR%2BksyNspChNTBD%2BZBImK9y68pP2ERw%3D
                  </strong>
                </Link>
              </li>
              <li>
                Détail du club{' '}
                <Link href="https://www.pass.sports.gouv.fr/v2/trouver-un-club/CLUB%20DES%20SPORTS%20DE%20CHAMONIX">
                  <strong>
                    https://www.pass.sports.gouv.fr/v2/trouver-un-club/CLUB%20DES%20SPORTS%20DE%20CHAMONIX
                  </strong>
                </Link>
              </li>
            </ul>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-3w">Retour d’information et contact</h2>

            <p>
              Si vous n&apos;arrivez pas à accéder à un contenu ou à un service, vous pouvez
              contacter le responsable de Audit de conformité pass Sport pour être orienté vers une
              alternative accessible ou obtenir le contenu sous une autre forme.
            </p>

            <ul>
              <li>
                {' '}
                Contacter{' '}
                <strong>
                  Direction des Sports/Ministères des Sports, de la Jeunesse et de la Vie
                  Associative :{' '}
                  <Link href="mailto:contact@pass-sport.beta.gouv.fr">
                    contact@pass-sport.beta.gouv.fr
                  </Link>
                </strong>
              </li>
            </ul>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-3w">Voies de recours</h2>

            <p>
              Si vous constatez un défaut d’accessibilité vous empêchant d’accéder à un contenu ou
              une fonctionnalité du site, que vous nous le signalez et que vous ne parvenez pas à
              obtenir une réponse de notre part, vous êtes en droit de faire parvenir vos doléances
              ou une demande de saisine au Défenseur des droits.
            </p>

            <p>Plusieurs moyens sont à votre disposition :</p>

            <ul>
              <li>Écrire un message au Défenseur des droits</li>
              <li> Contacter le délégué du Défenseur des droits dans votre région</li>
            </ul>

            <p>
              Envoyer un courrier par la poste (gratuit, ne pas mettre de timbre) Défenseur des
              droits Libre réponse 71120 75342 Paris CEDEX 07
            </p>
          </section>
        </div>
      </main>

      <EligibilityTestBanner />
      <SocialMediaPanel />
    </>
  );
}
