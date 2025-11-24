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
          <h1 className="fr-mb-1w">Déclaration d&apos;accessibilité</h1>

          <p>
            <strong>
              La direction des sports du Ministères des Sports, de la Jeunesse et de la Vie
              Associative
            </strong>{' '}
            s&apos;engage à rendre ses sites internet, intranet, extranet et ses progiciels
            accessibles (et ses applications mobiles et mobilier urbain numérique) conformément à
            l&apos;article 47 de la loi n<sup>o</sup>&nbsp;2005-102 du 11&nbsp;février 2005.
          </p>

          <p className="fr-mb-2w">
            Cette déclaration d&apos;accessibilité s&apos;applique à{' '}
            <strong>https://www.pass.sports.gouv.fr</strong>.
          </p>

          <h2 className="fr-mb-1w">État de conformité</h2>

          <p className="fr-mb-2w">
            <strong>
              Pass Sport{' '}
              <a target="_blank" href="https://www.pass.sports.gouv.fr">
                https://www.pass.sports.gouv.fr
              </a>
            </strong>{' '}
            est <strong>totalement conforme</strong> avec le référentiel général d&apos;amélioration
            de l&apos;accessibilité (RGAA).
          </p>

          <h3 className="fr-mb-1w">Résultats des tests</h3>

          <p className="fr-mb-2w">
            L&apos;audit de conformité réalisé par{' '}
            <strong>Brigade d&apos;Intervention du Numérique de la DINUM</strong> révèle que{' '}
            <strong>100&nbsp;%</strong> des critères du RGAA version 4.1.2 sont respectés.
          </p>

          <h2> Établissement de cette déclaration d&apos;accessibilité </h2>

          <p className="fr-mb-2w">
            Cette déclaration a été établie le <strong>14 octobre 2025</strong>. Elle a été mise à
            jour le <strong>21 novembre 2025</strong>.
          </p>

          <h3> Technologies utilisées pour la réalisation de l&apos;audit </h3>

          <ul className="fr-mb-2w">
            <li>HTML</li>
            <li>CSS</li>
            <li>Javascript</li>
          </ul>

          <h3 className="fr-mb-1w">Environnement de test</h3>

          <p>
            Les vérifications de restitution de contenus ont été réalisées sur la base de la
            combinaison fournie par la base de référence du RGAA, avec les versions suivantes&nbsp;:
          </p>

          <ul className="fr-mb-2w">
            <li> Sur Mobile iOS avec Safari et VoiceOver</li>
            <li> Sur Ordinateur MacOS avec Safari et VoiceOver</li>
            <li> Sur Ordinateur Windows avec Firefox et JAWS</li>
            <li> Sur Ordinateur Windows avec Microsoft Edge et JAWS</li>
            <li> Sur Ordinateur Windows avec Firefox et NVDA</li>
          </ul>

          <h3 className="fr-mb-1w">Outils pour évaluer l&apos;accessibilité</h3>

          <ul className="fr-mb-2w">
            <li>Web Developer Toolbar</li>
            <li>Colour Contrast Analyser</li>
            <li>HeadingsMap</li>
            <li>WCAG Contrast checker</li>
            <li>Inspecteur de composants</li>
            <li>Validateur HTML du W3C</li>
          </ul>

          <h3 className="fr-mb-1w">
            {' '}
            Pages du site ayant fait l&apos;objet de la vérification de conformité{' '}
          </h3>

          <ul className="fr-mb-2w">
            <li>
              Accueil <strong>https://www.pass.sports.gouv.fr/v2/accueil</strong>
            </li>
            <li>
              Mentions légales <strong>https://www.pass.sports.gouv.fr/v2/mentions-legales</strong>
            </li>
            <li>
              Plan du site <strong>https://www.pass.sports.gouv.fr/v2/plan-du-site</strong>
            </li>
            <li>
              Accessibilité <strong>https://www.pass.sports.gouv.fr/v2/accessibilite</strong>
            </li>
            <li>
              Foire aux Questions{' '}
              <strong>https://www.pass.sports.gouv.fr/v2/une-question?displayType=benef</strong>
            </li>
            <li>
              Trouver un club <strong>https://www.pass.sports.gouv.fr/v2/trouver-un-club</strong>
            </li>
            <li>
              Détail du club{' '}
              <strong>
                https://www.pass.sports.gouv.fr/v2/trouver-un-club/ASSOCIATION%20SPORTIVE%20LILLE%20PETIT%20TERRAIN
              </strong>
            </li>
            <li>
              Test d&apos;éligibilité{' '}
              <strong>https://staging.pass-sport.incubateur.net/v2/test-eligibilite</strong>
            </li>
            <li>
              Structures sportives <strong>https://www.pass.sports.gouv.fr/v2/structures</strong>
            </li>
            <li>
              Jeunes et parents{' '}
              <strong>https://www.pass.sports.gouv.fr/v2/jeunes-et-parents</strong>
            </li>
          </ul>

          <h2>Retour d&apos;information et contact</h2>

          <p>
            Si vous n&apos;arrivez pas à accéder à un contenu ou à un service, vous pouvez contacter
            le responsable de Pass Sport pour être orienté vers une alternative accessible ou
            obtenir le contenu sous une autre forme.
          </p>

          <ul className="fr-mb-2w">
            <li>
              Contacter{' '}
              <strong>
                La direction des sports du Ministères des Sports, de la Jeunesse et de la Vie
                Associative&nbsp;: contact@pass-sport.beta.gouv.fr
              </strong>
            </li>
          </ul>

          <h2 className="fr-mb-1w">Voies de recours</h2>

          <p className="fr-mb-2w">
            Si vous constatez un défaut d&apos;accessibilité vous empêchant d&apos;accéder à un
            contenu ou une fonctionnalité du site, que vous nous le signalez et que vous ne parvenez
            pas à obtenir une réponse de notre part, vous êtes en droit de faire parvenir vos
            doléances ou une demande de saisine au Défenseur des droits.
          </p>

          <p>Plusieurs moyens sont à votre disposition&nbsp;:</p>

          <ul>
            <li>
              <a href="https://formulaire.defenseurdesdroits.fr/formulaire_saisine" target="_blank">
                Écrire un message au Défenseur des droits <span>nouvelle fenêtre</span>
              </a>
            </li>
            <li>
              <a href="https://www.defenseurdesdroits.fr/carte-des-delegues" target="_blank">
                Contacter le délégué du Défenseur des droits dans votre région{' '}
                <span>nouvelle fenêtre</span>
              </a>
            </li>
            <li>
              Envoyer un courrier par la poste (gratuit, ne pas mettre de timbre) à&nbsp;:
              <br />
              <span>
                Défenseur des droits
                <br /> Libre réponse 71120
                <br /> 75342 Paris CEDEX 07
              </span>
            </li>
          </ul>
        </div>
      </main>

      <SocialMediaPanel />
    </>
  );
}
