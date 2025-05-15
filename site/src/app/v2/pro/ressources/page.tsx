import PageTitle from '@/components/PageTitle/PageTitle';
import styles from './styles.module.scss';
import About from './components/about';
import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import Link from 'next/link';
import Accordion from '@codegouvfr/react-dsfr/Accordion';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';

export const metadata: Metadata = {
  title: 'Ressources - pass Sport',
};

export default function ToutSavoirSurLePassSport() {
  return (
    <>
      <main className={styles.container} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle title="Ressources" subtitle="" isProVersion />
        <About />

        <div className={styles['section-container']}>
          <div>
            <h2 className="fr-mb-3w fr-h4">
              Vous portez des aides directes à la pratique pour l&apos;un des publics éligibles au
              pass Sport, référencez-les.
            </h2>

            <p className="fr-mb-3w">
              Le pass Sport est un dispositif de l&apos;État mis en place pour la 3ème année
              consécutive pour une aide directe à la pratique en permettant de bénéficier d&apos;une
              déduction de 50€ dès l&apos;inscription. Cependant, d&apos;autres aides de ce type
              existent, qu&apos;elles soient mises en place par votre collectivité, votre structure
              voire même par des acteurs privés qui soutiennent votre fédération.
            </p>

            <p className="fr-mb-3w">
              Pour donner de la visibilité à ces aides existantes et permettre aux bénéficiaires d’y
              recourir, le ministère des Sports, de la Jeunesse et de la Vie associative a lancé un
              recensement des aides possibles que vous retrouverez sur Aides-Territoires{' '}
              <Link
                href="https://aides-territoires.beta.gouv.fr/portails/pass-sport/"
                target="_blank"
              >
                en cliquant ici
              </Link>
              .
            </p>

            <p>
              Aidez-nous à enrichir cette cartographie en nous faisant remonter l’information via{' '}
              <Link
                href="/v2/pro/une-question"
                target="_blank"
                aria-label="Ouvrir une nouvelle fenêtre vers la foire aux questions"
              >
                le formulaire en bas de la Foire aux questions
              </Link>{' '}
              et partagez ainsi votre action en direction des bénéficiaires ou de leurs familles.
            </p>
          </div>

          <div>
            <h2 className="fr-mb-3w fr-h4">
              Les outils de communication mis à disposition par le ministère des Sports et des JOP
            </h2>

            <p className="fr-text--lg fr-text--bold fr-mb-0">
              Le ministère des Sports, de la Jeunesse et de la Vie associative a élaboré tout un
              ensemble d&apos;outils et supports de communication qui sont mis à dispositif de
              l&apos;ensemble des acteurs et peuvent être utilisés pour assurer la promotion du
              dispositif.
            </p>
          </div>

          <div>
            <h3 className="fr-h6">Nos outils de communications</h3>

            <div>
              <Accordion label="Logo">
                <div className={styles['accordion__expanded-container']}>
                  <div>
                    <h4 className="fr-mb-2w fr-h6">Logo</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/logo/principal.png"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers le logo principal"
                        >
                          Logo Bleu (principal)
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/logo/secondaire.png"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers le logo secondaire"
                        >
                          Logo Blanc (secondaire)
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/logo/charte.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers la charte d'utilisation du logo en version pdf"
                        >
                          Charte d’utilisation du logo
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </Accordion>

              <Accordion label="Affiches A4">
                <div className={styles['accordion__expanded-container']}>
                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches Génériques</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/generique-50-euros-economie.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 générique sur les 50 euros d'économie"
                        >
                          Affiche Générique 50€ d’économie
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/generique-plus-de-sport.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 générique plus de sport"
                        >
                          Affiche Générique plus de sport
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches écoliers / étudiants</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/primaire.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 primaire"
                        >
                          Affiche Primaire
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/college-lycee.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 college lycée"
                        >
                          Affiche Collège - Lycée
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/boursier.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 boursier"
                        >
                          Affiche Boursier
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches Handisport</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/handisport.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 handisport"
                        >
                          Affiche Handisport
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches Athlètes</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/estelle.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 Estelle"
                        >
                          Affiche print Estelle
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/gael.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 Gael"
                        >
                          Affiche print Gael
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/mariejo.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 Marie-Jo"
                        >
                          Affiche print Marie-Jo
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/teddy.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 Teddy"
                        >
                          Affiche print Teddy
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/tony.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 Tony"
                        >
                          Affiche print Tony
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a4/zinedine.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A4 Zinedine"
                        >
                          Affiche print Zinedine
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </Accordion>

              <Accordion label="Affiches A3">
                <div className={styles['accordion__expanded-container']}>
                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches Génériques</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/generique-50-euros-economie.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche générique sur les 50 euros d'économie"
                        >
                          Affiche Générique 50€ d’économie
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/generique-plus-de-sport.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche générique plus de sport"
                        >
                          Affiche Générique plus de sport
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches écoles</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/primaire.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A3 primaire"
                        >
                          Affiche Primaire
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/college-lycee.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A3 college lycée"
                        >
                          Affiche Collège - Lycée
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/boursier.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A3 boursier"
                        >
                          Affiche Boursier
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches Handisport</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/handisport.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A3 handisport"
                        >
                          Affiche Handi
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches Print</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/estelle.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A3 Estelle"
                        >
                          Affiche print Estelle
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/gael.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A3 Gael"
                        >
                          Affiche print Gael
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/mariejo.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A3 Marie-Jo"
                        >
                          Affiche print Marie-Jo
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/teddy.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A3 Teddy"
                        >
                          Affiche print Teddy
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/tony.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A3 Tony"
                        >
                          Affiche print Tony
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a3/zinedine.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A3 Zinedine"
                        >
                          Affiche print Zinedine
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </Accordion>

              <Accordion label="Affiches A2">
                <div className={styles['accordion__expanded-container']}>
                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches Génériques</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/generique-50-euros-economie.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche générique sur les 50 euros d'économie"
                        >
                          Affiche Générique 50€ d’économie
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/generique-plus-de-sport.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche générique plus de sport"
                        >
                          Affiche Générique plus de sport
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches écoles</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/primaire.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A2 primaire"
                        >
                          Affiche Primaire
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/college-lycee.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A2 college lycée"
                        >
                          Affiche Collège - Lycée
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/boursier.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A2 boursier"
                        >
                          Affiche Boursier
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches Handisport</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/handisport.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A2 handisport"
                        >
                          Affiche Handi
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="fr-mb-2w fr-h6">Affiches Print</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/estelle.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A2 Estelle"
                        >
                          Affiche print Estelle
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/gael.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A2 Gael"
                        >
                          Affiche print Gael
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/mariejo.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A2 Marie-Jo"
                        >
                          Affiche print Marie-Jo
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/teddy.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A2 Teddy"
                        >
                          Affiche print Teddy
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/tony.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A2 Tony"
                        >
                          Affiche print Tony
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/affiches-a2/zinedine.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers l'affiche A2 Zinedine"
                        >
                          Affiche print Zinedine
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </Accordion>

              <Accordion label="Flyers">
                <div className={styles['accordion__expanded-container']}>
                  <div>
                    <h4 className="fr-mb-2w fr-h6">Flyer Génériques</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/flyers/generique.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Flyer générique
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="fr-mb-2w fr-h6">Flyer écoles et clubs</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/flyers/primaire.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers le flyer primaire"
                        >
                          Flyer Primaire
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/flyers/club-1.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers le flyer club"
                        >
                          Flyer Club
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </Accordion>

              <Accordion label="Vignettes réseaux sociaux">
                <div className={styles['accordion__expanded-container']}>
                  <div>
                    <h4 className="fr-mb-2w fr-h6">Format 1080x1080</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/vignettes/coup-d-envoi.png"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers la vignette réseaux sociaux coup d'envoi"
                        >
                          Réseaux sociaux - Coup d’envoi
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/vignettes/club.png"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers la vignette réseaux sociaux club"
                        >
                          Réseaux sociaux - Club
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/vignettes/fitness.png"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers la vignette réseaux sociaux fitness"
                        >
                          Réseaux sociaux - Fitness
                        </Link>
                      </li>

                      <li>
                        <Link
                          href="/assets/ressources/vignettes/partenaire.png"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers la vignette réseaux sociaux partenaire"
                        >
                          Réseaux sociaux - Partenaire
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </Accordion>

              <Accordion label="Kakémono">
                <div className={styles['accordion__expanded-container']}>
                  <div>
                    <h4 className="fr-mb-2w fr-h6">Kakemono Générique</h4>
                    <ul className={styles['accordion__links-container']}>
                      <li>
                        <Link
                          href="/assets/ressources/kakemono.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Ouvrir une nouvelle fenêtre vers le kakemono pass Sport"
                        >
                          Kakemono pass Sport
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
              </Accordion>
            </div>
          </div>

          <div>
            <h2 className="fr-mb-3w fr-h4">Texte de référence</h2>

            <Link
              href="https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000049643030"
              target="_blank"
              aria-label="Ouvrir une nouvelle fenêtre vers le Décret n° 2023-741 du 8 août 2023 relatif au « pass Sport » 2023"
            >
              Décret n° 2024-500 du 31 mai 2024 relatif au « Pass&apos;Sport » 2024
            </Link>
          </div>
        </div>
      </main>

      <SocialMediaPanel isProVersion />
    </>
  );
}
