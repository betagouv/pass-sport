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

            <p className="fr-mt-2w">À cette fin, nous mettrons en œuvre les actions suivantes :</p>

            <ul>
              <li>
                Publication d&apos;un{' '}
                <span className="fr-text--bold">schéma pluriannuel de mise en accessibilité</span> ;
              </li>
              <li>
                Réalisation d&apos;un <span className="fr-text--bold">audit complet RGAA 4.1</span>{' '}
                d&apos;ici <span className="fr-text--bold">décembre 2025</span> ;
              </li>
              <li>
                Élaboration et suivi d&apos;un{' '}
                <span className="fr-text--bold">plan d&apos;actions annuel</span>.
              </li>
            </ul>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-1w">État de conformité</h2>
            <span className="fr-text--bold">Non conforme</span> – Aucun audit de conformité n&apos;a
            encore été réalisé depuis la refonte du site. Conformément aux définitions officielles,
            l&apos;absence de résultats d’audit en cours de validité entraîne une déclaration en
            non-conformité{' '}
            <Link href="https://www.design.numerique.gouv.fr" className="fr-link">
              (design.numerique.gouv.fr)
            </Link>
            .{/*<p>*/}
            {/*  <strong>*/}
            {/*    Audit de conformité pass Sport{' '}*/}
            {/*    <a target="_blank" href="https://www.pass.sports.gouv.fr">*/}
            {/*      https://www.pass.sports.gouv.fr*/}
            {/*    </a>*/}
            {/*  </strong>{' '}*/}
            {/*  est <strong>totalement</strong> conforme avec le référentiel général d’amélioration de*/}
            {/*  l’accessibilité (RGAA).*/}
            {/*</p>*/}
          </section>

          {/*<section className="fr-mb-6w">*/}
          {/*  <h2 className="fr-mb-1w">Résultats des tests</h2>*/}

          {/*  <p>*/}
          {/*    L’audit de conformité réalisé par <strong>DINUM (Brigade du Numérique)</strong> révèle*/}
          {/*    que <strong>100%</strong> des critères du RGAA version 4 sont respectés.*/}
          {/*  </p>*/}
          {/*</section>*/}

          <section className="fr-mb-6w">
            <h2 className="fr-mb-3w">Contenus non accessibles</h2>
            <p>
              En l’absence d’audit, la liste précise des non-conformités n’est pas encore établie.
            </p>
            <p>Les points suivants sont néanmoins présumés à risque :</p>
            <ul>
              <li>Contrastes de couleurs insuffisants ;</li>
              <li>Alternatives textuelles manquantes pour certains médias (images, vidéos) ;</li>
              <li>Structuration des titres et de la navigation incomplète ;</li>
              <li>
                formulaires susceptibles de contenir des erreurs de champs ou de captchas non
                accessibles.
              </li>
            </ul>
            <p>Cette section sera complétée à l’issue de l’audit.</p>
          </section>

          {/*<section className="fr-mb-6w">*/}
          {/*  <h3 className="fr-mb-3w"> Contenus non soumis à l’obligation d’accessibilité </h3>*/}

          {/*  <div>*/}
          {/*    <p>Lecteur vidéo (Vimeo), Carte interactive (Leaflet)</p>*/}
          {/*  </div>*/}
          {/*</section>*/}

          <section className="fr-mb-6w">
            <h3 className="fr-mb-3w">Contenus exemptés de l’obligation d’accessibilité</h3>

            <p>Les contenus suivants sont, par nature, exclus du champ du RGAA :</p>

            <ul>
              <li>Cartes interactives tierces ;</li>
              <li>
                Vidéos publiées avant le 23 septembre 2020 et dépourvues de transcription ou
                sous-titres.
              </li>
            </ul>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-3w"> Établissement de cette déclaration d’accessibilité </h2>
            <p className="text--italic">Version 1 – rédigée le 7 août 2025 (UTC+02:00).</p>
            <p>
              Cette déclaration a été élaborée sur la base du modèle officiel RGAA et en se référant
              à la précédente page d’accessibilité du site. (
              <Link href="/v2/accessibilite" className="fr-link">
                pass Sport
              </Link>
              )
            </p>

            {/*<p>*/}
            {/*  Cette déclaration a été établie le <strong>25 septembre 2024</strong>. Elle a été mise*/}
            {/*  à jour le <strong>30 septembre 2024</strong>.*/}
            {/*</p>*/}
          </section>

          <section className="fr-mb-6w">
            <h3 className="fr-mb-3w">Technologies utilisées pour le site (Hébergement Scalingo)</h3>
            <ul>
              <li>HTML</li>
              <li>CSS</li>
              <li>React</li>
              <li>Javascript</li>
              <li>NextJS</li>
            </ul>
          </section>

          <section className="fr-mb-6w">
            <h3 className="fr-mb-3w">Plan d&apos;amélioration et calendrier</h3>
            <div className="fr-table">
              <table>
                <thead>
                  <tr>
                    <th>Étape</th>
                    <th>Période prévue</th>
                    <th>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Commande de l&apos;audit RGAA 4.1</td>
                    <td>Septembre 2025</td>
                    <td>Équipe pass Sport</td>
                  </tr>
                  <tr>
                    <td>Réalisation de l’audit</td>
                    <td>Octobre-novembre 2025</td>
                    <td>Prestataire spécialisé</td>
                  </tr>
                  <tr>
                    <td>Publication des résultats et mise à jour de la déclaration</td>
                    <td>Décembre 2025</td>
                    <td>Équipe pass Sport</td>
                  </tr>
                  <tr>
                    <td>Lancement du plan d’actions correctives</td>
                    <td>Janvier 2026</td>
                    <td>Direction des Sports</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/*<section className="fr-mb-6w">*/}
          {/*  <h3 className="fr-mb-3w">Environnement de test</h3>*/}

          {/*  <p>*/}
          {/*    Les vérifications de restitution de contenus ont été réalisées sur la base de la*/}
          {/*    combinaison fournie par la base de référence du RGAA, avec les versions suivantes :*/}
          {/*  </p>*/}

          {/*  <ul>*/}
          {/*    <li> Sur Mobile iOS avec Safari et VoiceOver</li>*/}
          {/*    <li> Sur Ordinateur MacOS avec Safari et VoiceOver</li>*/}
          {/*    <li> Sur Ordinateur Windows avec Firefox et JAWS</li>*/}
          {/*    <li> Sur Ordinateur Windows avec Firefox et NVDA</li>*/}
          {/*  </ul>*/}
          {/*</section>*/}

          {/*<section className="fr-mb-6w">*/}
          {/*  <h3 className="fr-mb-3w">Outils pour évaluer l’accessibilité</h3>*/}

          {/*  <ul>*/}
          {/*    <li>Validateur HTML du W3C</li>*/}
          {/*    <li>Inspecteur de composants</li>*/}
          {/*    <li>ArcToolkit</li>*/}
          {/*    <li>HeadingsMap</li>*/}
          {/*    <li>Colour Contrast Analyser</li>*/}
          {/*    <li>Web Developer Toolbar</li>*/}
          {/*    <li>WCAG Contrast checker</li>*/}
          {/*  </ul>*/}
          {/*</section>*/}

          {/*<section className="fr-mb-6w">*/}
          {/*  <h3 className="fr-mb-3w">*/}
          {/*    Pages du site ayant fait l’objet de la vérification de conformité{' '}*/}
          {/*  </h3>*/}

          {/*  <ul>*/}
          {/*    <li>*/}
          {/*      Foire aux Questions{' '}*/}
          {/*      <Link href="https://www.pass.sports.gouv.fr/v2/une-question">*/}
          {/*        <strong>https://www.pass.sports.gouv.fr/v2/une-question</strong>*/}
          {/*      </Link>*/}
          {/*    </li>*/}
          {/*    <li>*/}
          {/*      Test d&apos;éligibilité{' '}*/}
          {/*      <Link href="https://www.pass.sports.gouv.fr/v2/test-eligibilite-base">*/}
          {/*        <strong>https://www.pass.sports.gouv.fr/v2/test-eligibilite-base</strong>*/}
          {/*      </Link>*/}
          {/*    </li>*/}
          {/*    <li>*/}
          {/*      Trouver un club{' '}*/}
          {/*      <Link href="https://www.pass.sports.gouv.fr/v2/trouver-un-club">*/}
          {/*        <strong>https://www.pass.sports.gouv.fr/v2/trouver-un-club</strong>*/}
          {/*      </Link>*/}
          {/*    </li>*/}
          {/*    <li>*/}
          {/*      Tout savoir sur le pass Sport - Pro{' '}*/}
          {/*      <Link href="https://www.pass.sports.gouv.fr/v2/pro/tout-savoir-sur-le-pass-sport">*/}
          {/*        <strong>*/}
          {/*          https://www.pass.sports.gouv.fr/v2/pro/tout-savoir-sur-le-pass-sport*/}
          {/*        </strong>*/}
          {/*      </Link>*/}
          {/*    </li>*/}
          {/*    /!*<li>*!/*/}
          {/*    /!*  Ressources{' '}*!/*/}
          {/*    /!*  <Link href="https://www.pass.sports.gouv.fr/v2/pro/ressources">*!/*/}
          {/*    /!*    <strong>https://www.pass.sports.gouv.fr/v2/pro/ressources</strong>*!/*/}
          {/*    /!*  </Link>*!/*/}
          {/*    /!*</li>*!/*/}
          {/*    <li>*/}
          {/*      Accueil{' '}*/}
          {/*      <Link href="https://www.pass.sports.gouv.fr">*/}
          {/*        <strong>https://www.pass.sports.gouv.fr</strong>*/}
          {/*      </Link>*/}
          {/*    </li>*/}
          {/*    <li>*/}
          {/*      Mentions légales{' '}*/}
          {/*      <Link href="https://www.pass.sports.gouv.fr/v2/mentions-legales">*/}
          {/*        <strong>https://www.pass.sports.gouv.fr/v2/mentions-legales</strong>*/}
          {/*      </Link>*/}
          {/*    </li>*/}
          {/*    <li>*/}
          {/*      Plan du site{' '}*/}
          {/*      <Link href="https://www.pass.sports.gouv.fr/v2/plan-du-site">*/}
          {/*        <strong>https://www.pass.sports.gouv.fr/v2/plan-du-site</strong>*/}
          {/*      </Link>*/}
          {/*    </li>*/}
          {/*    <li>*/}
          {/*      Page rubrique &ldquo;Tout savoir sur le pass Sport&rdquo;{' '}*/}
          {/*      <Link href="https://www.pass.sports.gouv.fr/v2/tout-savoir-sur-le-pass-sport">*/}
          {/*        <strong>https://www.pass.sports.gouv.fr/v2/tout-savoir-sur-le-pass-sport</strong>*/}
          {/*      </Link>*/}
          {/*    </li>*/}
          {/*    <li>*/}
          {/*      Page du pass Sport{' '}*/}
          {/*      <Link href="https://www.pass.sports.gouv.fr/v2/code/scan#S%2FnFnOd4tAmYWbSP0HVDP0PZ0ghnU0kyCniT3Xvgq7C%2Fpf6SGZemYoMybHzrA3AWi0PgM4cVstYazR%2BksyNspChNTBD%2BZBImK9y68pP2ERw%3D">*/}
          {/*        <strong>*/}
          {/*          https://www.pass.sports.gouv.fr/v2/code/scan#S%2FnFnOd4tAmYWbSP0HVDP0PZ0ghnU0kyCniT3Xvgq7C%2Fpf6SGZemYoMybHzrA3AWi0PgM4cVstYazR%2BksyNspChNTBD%2BZBImK9y68pP2ERw%3D*/}
          {/*        </strong>*/}
          {/*      </Link>*/}
          {/*    </li>*/}
          {/*    <li>*/}
          {/*      Détail du club{' '}*/}
          {/*      <Link href="https://www.pass.sports.gouv.fr/v2/trouver-un-club/CLUB%20DES%20SPORTS%20DE%20CHAMONIX">*/}
          {/*        <strong>*/}
          {/*          https://www.pass.sports.gouv.fr/v2/trouver-un-club/CLUB%20DES%20SPORTS%20DE%20CHAMONIX*/}
          {/*        </strong>*/}
          {/*      </Link>*/}
          {/*    </li>*/}
          {/*  </ul>*/}
          {/*</section>*/}

          {/*<section className="fr-mb-6w">*/}
          {/*  <h2 className="fr-mb-3w">Schéma pluriannuel</h2>*/}

          {/*  <p>*/}
          {/*    <Link href="https://beta.gouv.fr/accessibilite/schema-pluriannuel">*/}
          {/*      https://beta.gouv.fr/accessibilite/schema-pluriannuel*/}
          {/*    </Link>*/}
          {/*  </p>*/}
          {/*</section>*/}

          <section className="fr-mb-6w">
            <h2 className="fr-mb-3w">Retour d’information et contact</h2>

            <p>
              Si vous ne parvenez pas à accéder à un contenu ou à un service, vous pouvez nous
              contacter :
            </p>

            <ul>
              <li>
                <span className="fr-text--bold">Courriel</span> :{' '}
                <Link href="contact@pass-sport.beta.gouv.fr" className="fr-link">
                  contact@pass-sport.beta.gouv.fr
                </Link>
              </li>
              <li>
                <span className="fr-text--bold">Téléphone (standard ministère)</span> : 01 40 45 90
                00 (de 9 h à 18 h les jours ouvrés)
              </li>
            </ul>

            <p>
              Nous mettrons tout en œuvre pour vous orienter vers une alternative accessible ou vous
              fournir le contenu sous une autre forme dans les meilleurs délais.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-3w">Voies de recours</h2>

            <p>
              Si vous constatez un défaut d’accessibilité qui vous empêche d’accéder à un contenu et
              que vous ne parvenez pas à obtenir une réponse satisfaisante, vous pouvez :
            </p>

            <p>Plusieurs moyens sont à votre disposition :</p>

            <ul>
              <li>Écrire un message au Défenseur des droits ;</li>
              <li>
                <Link
                  href="https://www.defenseurdesdroits.fr/carte-des-delegues"
                  className="fr-link"
                >
                  Contacter le délégué du Défenseur des droits dans votre région
                </Link>{' '}
                ;
              </li>
              <li>
                Envoyer un courrier gratuit (sans affranchissement) à :{' '}
                <address>
                  Défenseur des droits
                  <br /> Libre Réponse 71120 <br />
                  75342 Paris CEDEX 07
                </address>
              </li>
            </ul>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-3w">Suivi et mise à jour</h2>
            <p>
              La présente déclaration sera révisée après chaque étape majeure de mise en conformité
              ou au plus tard douze mois après la dernière mise à jour.
            </p>
          </section>
        </div>
      </main>

      <SocialMediaPanel />
    </>
  );
}
