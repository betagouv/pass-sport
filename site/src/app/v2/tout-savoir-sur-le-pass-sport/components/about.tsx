import styles from '../styles.module.scss';
import Image from 'next/image';
import aboutImage from '@/images/tout-savoir-sur-le-pass-sport/about.webp';
import cn from 'classnames';
import CustomHighlight from '@/app/components/custom-highlight/CustomHighlight';

export default function About() {
  return (
    <>
      <section className={styles['about-container']}>
        <div className={styles['about-container__highlight']}>
          <div>
            <Image
              src={aboutImage}
              alt=""
              className={styles['about-container__highlight-image']}
              width={300}
              height={300}
            />
          </div>

          <div id="découvrir">
            <h2 className={cn(styles['about-container__highlight-title'], 'fr-h3')}>
              Le pass Sport reconduit pour la saison 2025-2026
            </h2>

            <CustomHighlight classes={[styles['about-container__highlight-text']]}>
              <div>
                <p className="fr-mb-3w display--block">
                  Pour être à la fois plus ciblé à l’âge où la pratique sportive des jeunes
                  décroche, autour de 14 ans, et plus incitatif, le pass Sport évolue en 2025.
                </p>

                <p className="fr-mb-3w display--block">Il sera ouvert aux :</p>

                <ul>
                  <li>
                    Jeunes de 14 à 17 ans révolus bénéficiant de l’allocation de rentrée scolaire
                    (ARS) ;
                  </li>
                  <li>
                    Jeunes en situation de handicap jusqu’à 30 ans (6 à 19 ans{' '}
                    <abbr title="Allocation d’Education de l’Enfant Handicapé">AEEH</abbr>, 16 à 30
                    ans <abbr title="Allocation aux Adultes Handicapés">AAH</abbr>) ;
                  </li>
                  <li>
                    Étudiants boursiers ou bénéficiaires d’une aide annuelle du CROUS de moins de 28
                    ans, étudiants percevant une bourse régionale pour les formations sanitaires et
                    sociales pour l’année universitaire 2025- 2026.
                  </li>
                </ul>

                <p className="fr-mb-3w display--block">
                  Pour augmenter l’effet incitatif de cette aide, son montant passe de 50 à 70
                  euros.
                </p>

                <p className="fr-mb-3w display--block">
                  Le type d’établissements éligibles demeure inchangé. Pour rappel, le pass Sport
                  peut être utilisé dans un club affilié aux fédérations sportives agréées par le
                  ministère des Sports, de la Jeunesse et de la Vie associative ainsi que dans les
                  associations agréées Jeunesse Education Populaire (JEP) ou Sport, ou encore les
                  structures des loisirs sportifs marchands (salle d’escalade, salle de fitness,
                  etc.).
                </p>

                <p className="fr-mb-3w display--block">
                  Une campagne de communication à destination des bénéficiaires sera lancée à la fin
                  du mois d’août. Les parents des bénéficiaires du pass Sport et les jeunes
                  concernés recevront dans la seconde quinzaine d’août leur code unique, par voie
                  électronique, à présenter dès leur inscription dans la structure sportive de leur
                  choix.
                </p>

                <p>
                  <a
                    href="https://www.sports.gouv.fr/le-pass-sport-reconduit-pour-la-saison-2025-2026-9862"
                    target="_blank"
                  >
                    Lire le communiqué de presse
                  </a>
                </p>
              </div>
            </CustomHighlight>
          </div>
        </div>
      </section>

      {/*<section className={cn(styles['about-sub-container'], 'fr-mx-auto', 'fr-px-2w')}>*/}
      {/*  <div*/}
      {/*    className={cn(*/}
      {/*      styles['about-sub-container__highlight'],*/}
      {/*      'fr-mx-auto',*/}
      {/*      'fr-grid-row--center',*/}
      {/*      'fr-mb-9w',*/}
      {/*    )}*/}
      {/*  >*/}
      {/*    <CustomHighlight originalLeftBorder={false}>*/}
      {/*      <>*/}
      {/*        <p className="fr-mb-1w display--block">*/}
      {/*          Le pass Sport est ouvert du 1er juin au 31 décembre 2024.*/}
      {/*        </p>*/}

      {/*        <p className="display--block">*/}
      {/*          Pensez-bien à présenter votre pass à votre club avant la fin décembre 2024 !*/}
      {/*        </p>*/}
      {/*      </>*/}
      {/*    </CustomHighlight>*/}
      {/*  </div>*/}
      {/*</section>*/}
    </>
  );
}
