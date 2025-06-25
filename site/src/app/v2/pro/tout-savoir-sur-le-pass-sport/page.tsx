import styles from './styles.module.scss';
import SocialMediaPanel from '../../../components/social-media-panel/SocialMediaPanel';
import Link from 'next/link';
import Button from '@codegouvfr/react-dsfr/Button';
import Accordion from '@codegouvfr/react-dsfr/Accordion';
import {
  multisportsAndaffinitaires,
  olympiquesAndparalympiques,
  unisport,
} from '@/app/v2/pro/tout-savoir-sur-le-pass-sport/constants/federations';
import { Metadata } from 'next';
import Video from '@/app/v2/pro/tout-savoir-sur-le-pass-sport/components/Video';
import TranscriptionVisibilityClub from '@/app/v2/pro/tout-savoir-sur-le-pass-sport/components/TranscriptionVisibilityClub';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import TranscriptionRefundPassSport from '@/app/v2/pro/tout-savoir-sur-le-pass-sport/components/TranscriptionRefundPassSport';
import PageTitle from '@/components/PageTitle/PageTitle';
import { headers } from 'next/headers';
import CustomHighlight from '@/app/components/custom-highlight/CustomHighlight';
import rootStyles from '@/app/utilities.module.scss';
import cn from 'classnames';
export const metadata: Metadata = {
  title: 'Structure partenaire - Tout savoir sur le pass Sport - pass Sport',
};

export default function ToutSavoirSurLePassSport() {
  const nonce = headers().get('X-Nonce') ?? undefined;
  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle
          title="Tout savoir sur le pass Sport"
          subtitle=""
          isProVersion
          classes={{
            container: styles['page-header'],
          }}
        />

        <div className={styles['main-container']}>
          <section className={styles['section-container']}>
            {/*<h2 className="fr-h4">*/}
            {/*  Quelles sont les conditions pour devenir partenaire du dispositif pass Sport ?*/}
            {/*</h2>*/}
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
            {/*<p>*/}
            {/*  Pour être à la fois plus ciblé à l&apos;âge où la pratique sportive des jeunes*/}
            {/*  décroche, autour de 14 ans, et plus incitatif, le pass Sport évolue en 2025.*/}
            {/*</p>*/}

            {/*<ol>*/}
            {/*  <li className="fr-mb-3w">*/}
            {/*    Affiliation : Être affiliée, quel que soit son statut, pour la saison 2024-2025 à*/}
            {/*    l&apos;une des 114 fédérations sportives agréées par le ministère des Sports, de la*/}
            {/*    Jeunesse et de la Vie associative.*/}
            {/*  </li>*/}
            {/*  <li className="fr-mb-3w">*/}
            {/*    Agrément : Être une association ayant un agrément Sport ou Jeunesse Éducation*/}
            {/*    Populaire délivré par le préfet du département, en cours de validité.*/}
            {/*  </li>*/}
            {/*  <li>*/}
            {/*    Loisir sportif marchand : Être une structure de loisir sportif marchand éligible*/}
            {/*    ayant signé la charte d&apos;engagement proposée par le ministère des Sports, de la*/}
            {/*    Jeunesse et de la Vie associative. Les entités doivent proposer ou organiser une*/}
            {/*    activité sportive, de loisir ou non, ayant un but lucratif et relevant de l&apos;un*/}
            {/*    des codes de la nomenclature des activités françaises (NAF) suivants :*/}
            {/*    <ol>*/}
            {/*      <li>9311Z : gestion d&apos;installations sportives</li>*/}
            {/*      <li>9312Z : activités des clubs de sports</li>*/}
            {/*      <li>9329Z : autres activités récréatives et de loisirs</li>*/}
            {/*      <li>9313Z : activités des centres de culture physique</li>*/}
            {/*      <li>*/}
            {/*        8551Z : enseignement de disciplines sportives et d&apos;activités de loisirs*/}
            {/*      </li>*/}
            {/*      <li>6420Z : activités des sociétés holding</li>*/}
            {/*    </ol>*/}
            {/*    <span className={rootStyles['span--with-linebreak']}>*/}
            {/*      <Link*/}
            {/*        href="/assets/ressources/charte-lsm-pour-non-adherents-2024.docx"*/}
            {/*        target="_blank"*/}
            {/*        aria-label="Ouvrir une nouvelle fenêtre pour télécharger la charte LSM pour non adhérents de l'année 2024"*/}
            {/*      >*/}
            {/*        Télécharger la charte d’engagement loisir sportif marchand non adhérent*/}
            {/*      </Link>*/}
            {/*    </span>*/}
            {/*    <Link*/}
            {/*      href="/assets/ressources/charte-lsm-pour-adherents-2024.docx"*/}
            {/*      target="_blank"*/}
            {/*      aria-label="Ouvrir une nouvelle fenêtre pour télécharger la charte LSM pour adhérents de l'année 2024"*/}
            {/*    >*/}
            {/*      Télécharger la charte d’engagement loisir sportif marchand adhérent*/}
            {/*    </Link>*/}
            {/*  </li>*/}
            {/*</ol>*/}
          </section>

          {/*<section className={styles['section-container']}>*/}
          {/*  <h2 className="fr-h4">Qui se mobilise pour vous accompagner ?</h2>*/}
          {/*  <p className="fr-text--bold">*/}
          {/*    Plusieurs interlocuteurs peuvent vous accompagner dans votre département en fonction*/}
          {/*    de votre statut :*/}
          {/*  </p>*/}
          {/*  <ul>*/}
          {/*    <li className="fr-mb-3w">*/}
          {/*      Si vous êtes un club affilié à une fédération sportive agréée éligible au*/}
          {/*      dispositif, le Comité Départemental Olympique et Sportif (CDOS) de votre département*/}
          {/*      est là pour vous accompagner à la création de votre espace sur Le Compte Asso (LCA)*/}
          {/*      et la saisie des pass Sport.*/}
          {/*    </li>*/}
          {/*    <li className="fr-mb-3w">*/}
          {/*      Si vous êtes bien une association agréée Sport ou JEP (agrément valide), contactez*/}
          {/*      l&apos;assistance via{' '}*/}
          {/*      <Link*/}
          {/*        href="/v2/pro/une-question"*/}
          {/*        target="_blank"*/}
          {/*        aria-label="Ouvrir une nouvelle fenêtre vers la foire aux questions"*/}
          {/*      >*/}
          {/*        le formulaire en bas de la Foire aux questions*/}
          {/*      </Link>*/}
          {/*    </li>*/}
          {/*    <li>*/}
          {/*      Pour toute question sur le dispositif, la FAQ sur ce portail devrait vous apporter*/}
          {/*      toutes les réponses aux questions que vous vous posez.*/}
          {/*    </li>*/}
          {/*  </ul>*/}

          {/*  <CustomHighlight size="lg">*/}
          {/*    <p className="display--block">*/}
          {/*      Les pass Sport sont valables du 1er juin au 31 décembre 2024. Après cette date,*/}
          {/*      aucun pass Sport saisi ne pourra faire l&apos;objet d&apos;un remboursement.*/}
          {/*    </p>*/}
          {/*    <p className="display--block">Anticipez vos saisis !</p>*/}
          {/*  </CustomHighlight>*/}
          {/*</section>*/}

          {/*<section className={styles['section-container']}>*/}
          {/*  <h2 className="fr-h4">Comment me faire rembourser un pass Sport ?</h2>*/}

          {/*  <p className="fr-text--bold">*/}
          {/*    Les bénéficiaires du dispositif recevront fin mai (80% des bénéficiaires) ou fin août*/}
          {/*    (les bénéficiaires nouvellement éligibles ainsi que l&apos;intégralité des étudiants*/}
          {/*    boursiers) leur pass Sport individuel qui prend la forme d&apos;un code composé de 10*/}
          {/*    caractères différents de ceux de 2022-2023.*/}
          {/*  </p>*/}
          {/*  <p>*/}
          {/*    Sur présentation du QR code et d&apos;un code, votre structure a consenti une*/}
          {/*    déduction immédiate de 50€ sur l&apos;inscription que vous devez vous faire rembourser*/}
          {/*    le plus rapidement possible via votre espace sur :*/}
          {/*  </p>*/}

          {/*  <div className="fr-grid-row fr-grid-row--center">*/}
          {/*    <Button*/}
          {/*      priority="secondary"*/}
          {/*      iconPosition="right"*/}
          {/*      iconId="fr-icon-external-link-line"*/}
          {/*      linkProps={{*/}
          {/*        className: 'fr-btn--icon-right',*/}
          {/*        href: 'https://lecompteasso.associations.gouv.fr/',*/}
          {/*        'aria-label': 'Ouvrir une nouvelle fenêtre vers Compte Asso',*/}
          {/*      }}*/}
          {/*    >*/}
          {/*      Le Compte Asso*/}
          {/*    </Button>*/}
          {/*  </div>*/}

          {/*  <p>*/}
          {/*    Pour cela,{' '}*/}
          {/*    <Link*/}
          {/*      href="https://lecompteasso.associations.gouv.fr/"*/}
          {/*      title="Ouvrir une nouvelle fenêtre vers Compte Asso"*/}
          {/*      target="_blank"*/}
          {/*    >*/}
          {/*      connectez vous au Compte Asso*/}
          {/*    </Link>{' '}*/}
          {/*    (si vous n&apos;avez pas encore de compte, vous pouvez le créer en 10 minutes*/}
          {/*    environ), cliquez sur « demander les remboursements pass Sport » puis saisissez les*/}
          {/*    codes individuels un à un au fil de l&apos;eau.*/}
          {/*  </p>*/}

          {/*  <p>*/}
          {/*    La saisie du code individuel empêche le jeune d&apos;utiliser son pass Sport dans une*/}
          {/*    autre structure.*/}
          {/*  </p>*/}

          {/*  <ul>*/}
          {/*    <li>*/}
          {/*      si le code a déjà été utilisé par le jeune vous aurez un message qui vous*/}
          {/*      l&apos;indiquera.*/}
          {/*    </li>*/}
          {/*    <li>si le code n&apos;existe pas, vous aurez un message le précisant.</li>*/}
          {/*    <li>*/}
          {/*      Si lors de la saisie du code, le nom du jeune qui apparait n&apos;est pas celui de*/}
          {/*      votre adhérent, ne poursuivez pas la saisie et prévenez le jeune que ce code ne lui*/}
          {/*      correspond pas (vérifier si ce n&apos;est pas une inversion avec un autre membre*/}
          {/*      d&apos;une fratrie par exemple) qu&apos;il doit vous présenter le pass Sport à son*/}
          {/*      nom.{' '}*/}
          {/*    </li>*/}
          {/*  </ul>*/}

          {/*  <p>*/}
          {/*    Les remboursements des pass Sport saisis commenceront à partir de fin septembre. En*/}
          {/*    moyenne, les pass vous sont remboursés mensuellement, de 30 à 45 jours à partir du*/}
          {/*    moment de leur saisi.*/}
          {/*  </p>*/}

          {/*  <p>*/}
          {/*    Vous pouvez consulter notre tutoriel d&apos;accompagnement qui vous guide pour*/}
          {/*    l&apos;ensemble de la démarche sur LCA :*/}
          {/*  </p>*/}

          {/*  <Video*/}
          {/*    videoId="video-956954295"*/}
          {/*    videoPathUrl="956954295?h=c830d2877e&amp;badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479"*/}
          {/*    videoFullUrl="https://vimeo.com/956954295/c830d2877e"*/}
          {/*    title="Tutoriel : se faire rembourser un pass Sport"*/}
          {/*    transcriptionContent={<TranscriptionRefundPassSport />}*/}
          {/*    nonce={nonce}*/}
          {/*  />*/}

          {/*  <p>*/}
          {/*    <Link*/}
          {/*      href="https://docs.google.com/presentation/d/1ZudiQdP1HmKc_sA1cCsokFPyV3BWEyJV/edit?usp=sharing&ouid=108110003985475869656&rtpof=true&sd=true"*/}
          {/*      target="_blank"*/}
          {/*      aria-label="Ouvrir une nouvelle fenêtre vers le fichier PDF spécifiant comment se faire rembourser un pass Sport quand je suis un club de sport"*/}
          {/*    >*/}
          {/*      Tutoriel PDF : Comment se faire rembourser un pass Sport quand je suis un club de*/}
          {/*      sport*/}
          {/*    </Link>*/}
          {/*  </p>*/}
          {/*  <p>*/}
          {/*    <Link*/}
          {/*      href="https://docs.google.com/presentation/d/1uN1xvqmH95oYDY156sMC4Z4rxUyuNGA8/edit?usp=sharing&ouid=108110003985475869656&rtpof=true&sd=true"*/}
          {/*      target="_blank"*/}
          {/*      aria-label="Ouvrir une nouvelle fenêtre vers le fichier PDF spécifiant comment se faire rembourser un pass Sport quand je suis une structure*/}
          {/*    relevant du Loisir Sportif Marchand"*/}
          {/*    >*/}
          {/*      Tutoriel PDF : Comment se faire rembourser un pass Sport quand je suis une structure*/}
          {/*      relevant du Loisir Sportif Marchand*/}
          {/*    </Link>*/}
          {/*  </p>*/}
          {/*</section>*/}

          {/*<section id="tuto-carto" className={styles['section-container']}>*/}
          {/*  <h2 className="fr-h4">*/}
          {/*    Comment faire apparaître mon club sur la carte des structures éligibles au pass Sport*/}
          {/*    ?*/}
          {/*  </h2>*/}

          {/*  <p className="fr-text--bold">*/}
          {/*    Pour donner de la visibilité à votre club et anticiper l&apos;accueil des jeunes à la*/}
          {/*    rentrée, vous pouvez créer votre espace sur LCA.*/}
          {/*  </p>*/}

          {/*  <p>*/}
          {/*    Retrouvez notre tutoriel d&apos;accompagnement à la création de votre espace sur le*/}
          {/*    Compte Asso qui sera ensuite le lieu de demande des remboursements pass Sport :*/}
          {/*  </p>*/}

          {/*  <p>*/}
          {/*    <Link*/}
          {/*      href="https://docs.google.com/presentation/d/1SIbTiEp1SjQ-cYRMDQlTAKuIO5agU-zZ/edit?usp=sharing&ouid=108110003985475869656&rtpof=true&sd=true"*/}
          {/*      target="_blank"*/}
          {/*      aria-label="Ouvrir une nouvelle fenêtre vers le fichier PDF spécifiant comment accepter le pass Sport dans mon club"*/}
          {/*    >*/}
          {/*      Tutoriel PDF : comment accepter le pass Sport dans mon club*/}
          {/*    </Link>*/}
          {/*  </p>*/}

          {/*  <Video*/}
          {/*    videoId="video-949861035"*/}
          {/*    videoPathUrl="949861035"*/}
          {/*    videoFullUrl="https://vimeo.com/949861035"*/}
          {/*    title="Tutoriel : devenez partenaire du pass Sport"*/}
          {/*    transcriptionContent={<TranscriptionVisibilityClub />}*/}
          {/*    nonce={nonce}*/}
          {/*  />*/}
          {/*</section>*/}

          {/*<section className={styles['section-container']}>*/}
          {/*  <h2 className="fr-h4">*/}
          {/*    Liste des fédérations agréées par le ministère des Sports, de la Jeunesse et de la Vie*/}
          {/*    associative*/}
          {/*  </h2>*/}

          {/*  <p className="fr-text--bold">*/}
          {/*    Si votre club est affilié à l&apos;une des fédérations suivantes pour la saison*/}
          {/*    2024/2025 ou l&apos;année 2024 alors vous pouvez accepter des pass Sport qui vous*/}
          {/*    seront intégralement remboursés par l&apos;État !*/}
          {/*  </p>*/}

          {/*  <section>*/}
          {/*    <Accordion label="Fédérations olympiques et paralympiques">*/}
          {/*      <FederationList federations={olympiquesAndparalympiques} />*/}
          {/*    </Accordion>*/}
          {/*    <Accordion label="Fédérations unisport">*/}
          {/*      <FederationList federations={unisport} />*/}
          {/*    </Accordion>*/}
          {/*    <Accordion label="Fédérations multisports et affinitaires">*/}
          {/*      <p className="fr-mb-2w">*/}
          {/*        <Link*/}
          {/*          href="/assets/ressources/charte-lsm-pour-non-adherents-2024.docx"*/}
          {/*          target="_blank"*/}
          {/*          aria-label="Ouvrir une nouvelle fenêtre vers la charte d'engagement"*/}
          {/*        >*/}
          {/*          Charte d&apos;engagement*/}
          {/*        </Link>*/}
          {/*      </p>*/}
          {/*      <FederationList federations={multisportsAndaffinitaires} />*/}
          {/*    </Accordion>*/}
          {/*  </section>*/}
          {/*</section>*/}

          {/*<section className={styles['section-container']}>*/}
          {/*  <h2 className="fr-h4">Texte de référence</h2>*/}
          {/*  <Link*/}
          {/*    href="https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000049643030"*/}
          {/*    target="_blank"*/}
          {/*    className="align-self--baseline"*/}
          {/*  >*/}
          {/*    Décret n° 2024-500 du 31 mai 2024 relatif au « pass Sport » 2024*/}
          {/*  </Link>*/}
          {/*</section>*/}
        </div>
      </main>
      <SocialMediaPanel isProVersion />
    </>
  );
}

interface FederationListProps {
  federations: string[];
}

function FederationList({ federations }: FederationListProps) {
  return (
    <ul>
      {federations.map((fed) => (
        <li key={fed}>{fed}</li>
      ))}
    </ul>
  );
}
