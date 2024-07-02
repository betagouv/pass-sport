import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import PageHeader from '../../../../components/PageHeader/PageHeader';
import styles from './style.module.scss';
import EligibilityTestBanner from '@/components/eligibility-test-banner/EligibilityTestBanner';
import { Metadata } from 'next';
import Link from 'next/link';
import cn from 'classnames';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';

export const metadata: Metadata = {
  title: 'Règlement du jeu concours numéro 2 - pass Sport',
};

export default function Page() {
  return (
    <div>
      <PageHeader
        title="Règlement du jeu-concours numéro 2 - pass Sport"
        subtitle=""
        classes={{
          container: styles['page-header'],
        }}
      />
      <main
        className={cn(styles.main, styles.wrapper)}
        tabIndex={-1}
        id={SKIP_LINKS_ID.mainContent}
      >
        <section className="fr-mb-6w">
          <h4 className="fr-mb-2w">Présentation du jeu-concours pass Sport</h4>

          <p>
            Le pass Sport est un dispositif porté par l&apos;État et déployé par le ministère des
            Sports et des Jeux Olympiques et Paralympiques permettant de soutenir la pratique
            sportive de jeunes.
          </p>
          <p>
            Il s&apos;agit ainsi d&apos;une aide de 50 euros qui permet de financer une partie de
            l&apos;inscription sportive, à plus de 6,5 millions de jeunes, valable dans plus de 85
            000 clubs et salles de sport partenaires.
          </p>
          <p>
            La présente opération vise à promouvoir le pass Sport et la pratique sportive en France
            en la rendant plus accessible par le biais de Créateurs de Contenus.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h4 className="fr-mb-2w">
            Article 1<sup>er</sup> - Définitions
          </h4>

          <p>
            Le ministère des Sports et des Jeux Olympiques et Paralympiques, sis 95 avenue de
            France, 75013 – Paris est désigné ci-après comme : « l&apos;Organisateur »
          </p>
          <p>
            Les participants au jeu-concours sont désignés ci-après comme « le/les Participant(s) »
          </p>
          <p>
            Le présent règlement définit les règles juridiques applicables au jeu-concours « pass
            Sport ».
          </p>
        </section>

        <section className="fr-mb-6w">
          <h4 className="fr-mb-2w">Article 2 – Conditions de participation</h4>
          <p>
            Le présent jeu-concours est ouvert à toute personne physique, majeure résidant en France
            à l&apos;exclusion des membres du personnel de l&apos;Organisateur, et d&apos;une façon
            générale des sociétés participant à la mise en œuvre de ce jeu-concours.
          </p>
          <p>
            L&apos;Organisateur se réserve le droit de demander la justification écrite de
            l&apos;âge du Participant à tout moment, a fortiori lors de l&apos;attribution des lots.
          </p>
          <p>
            L&apos;Organisateur serait contraint de disqualifier toute personne qui serait dans
            l&apos;incapacité de fournir ce justificatif dans les délais qui lui seraient impartis.
            Dans ce cas, tout gain potentiellement obtenu durant le jeu-concours serait
            immédiatement annulé.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h4 className="fr-mb-2w">Article 3 – Dates du concours</h4>

          <p>Le jeu-concours se déroulera selon le calendrier suivant:</p>

          <ul>
            <li>Date de début: 20 juin 2024</li>
            <li>Date de fin: 5 août 2024</li>
          </ul>
        </section>

        <section className="fr-mb-6w">
          <h4 className="fr-mb-2w">Article 4 – Modalités de participation</h4>
          <h5 className="fr-mb-2w">4.1 Conditions de participation</h5>

          <p>
            Afin de participer au présent jeu-concours, le Participant devra se rendre sur la
            plateforme Instagram (www.instagram.com), à compter des dates indiquées pour le début du
            concours conformément à l&apos;article 3 du présent règlement.
          </p>

          <p className={styles.underline}>
            Le Concours sera accessible via le compte de l&apos;un des Créateur de Contenus suivants
            :
          </p>

          <ul className="fr-mb-2w">
            <li>
              <Link href="https://www.instagram.com/natoogram/" target="_blank">
                @natoogram
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/allonsrider/" target="_blank">
                @allonsrider
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/joanahanna/" target="_blank">
                @joanahanna
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/charlespoujade/" target="_blank">
                @charlespoujade
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/melaniebuffetaud/" target="_blank">
                @melaniebuffetaud
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/iliasblankaa/" target="_blank">
                @iliasblankaa
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/vincent.pourchot/" target="_blank">
                @vincentpourchot
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/coursptitetomate/" target="_blank">
                @coursptitetomate
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/brisco_s3/" target="_blank">
                @brisco_s3
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/antoine.mamie/" target="_blank">
                @antoine.mamie
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/elisabeth_loncke/" target="_blank">
                @elisabeth_loncke
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/nathsimofficiel/" target="_blank">
                @nathsimofficiel
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/arthurbaucheron/" target="_blank">
                @arthurbaucheron
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/roro_le_costaud/" target="_blank">
                @roro_le_costaud
              </Link>
            </li>
            <li>
              <Link href="https://www.instagram.com/emelinefranque/" target="_blank">
                @emelinefranque
              </Link>
            </li>
          </ul>

          <p>
            Le Participant devra s&apos;abonner au compte Instagram @passsportofficiel, commenter la
            publication du créateur suivi en lien avec le présent concours et identifier (@) un ami
            avec qui ce dernier souhaiterait pratiquer un sport.
          </p>

          <p>
            Le Participant a la possibilité d&apos;augmenter ses chances par deux de remporter le
            lot en postant une photo ou une vidéo (story ou publication) de sa séance de sport en
            identifiant (@) le compte Instagram @passsportofficiel ainsi que le @ du compte créateur
            par le biais duquel il aura participé.
          </p>

          <p>
            La participation est limitée à un post par Participant. Toute participation multiple de
            la part d&apos;un Participant sera considérée comme une seule et unique participation.
          </p>

          <h5 className="fr-mb-2w">
            4.2) Garantie et responsabilité sur la validité des candidatures
          </h5>

          <p>
            L&apos;Organisateur se réserve le droit d&apos;annuler, de mettre fin ou modifier cette
            opération en cas de violation des présentes, par fraude ou par tout autre cause hors de
            son contrôle.
          </p>
          <p>
            De façon générale, les Participants garantissent l&apos;Organisateur du présent concours
            contre tous recours, actions ou réclamations que pourraient former, à un titre
            quelconque, tous tiers, au titre de toutes les garanties et engagements pris.
          </p>
          <p>
            Toute participation incomplète ou erronée sera rejetée sans que la responsabilité de
            l&apos;Organisateur ne puisse être engagée.
          </p>
          <p>
            Ainsi, l&apos;Organisateur se réserve le droit, sans réserve, de modérer à postériori et
            de ne pas valider, d&apos;exclure, ou de supprimer du concours, tout participant qui ne
            respecterait pas une des conditions du présent règlement.
          </p>

          <h5 className="fr-mb-2w">4.3) Détermination des Gagnants et attribution du lot</h5>

          <p>
            Dans le cadre du présent jeu-concours « pass Sport », l&apos;Organisateur met à
            disposition des Gagnants tirés au sort un bon d&apos;achat valable au sein de
            l&apos;enseigne DECATHLON (d&apos;un montant de 300€ TTC) ainsi qu&apos;un abonnement ou
            une licence d&apos;une année dans un club ou une salle de sport du choix du Gagnant
            (dans la limite de 500 € TTC).
          </p>
          <p>
            L&apos;Organisateur désignera par tirage au sort effectué par chaque Créateurs, les
            Gagnants du jeu-concours et ce, pour chaque Créateur.
          </p>
          <p>
            Les Gagnants seront directement contactés par le Créateur par message privé sur le
            compte Instagram avec lequel ils auront participé au jeu-concours afin de prévoir les
            modalités d&apos;utilisation des lots dans les 15 jours suivants la fin du jeu-concours.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h4 className="fr-mb-2w">Article 5 – Lots</h4>
          <h5 className="fr-mb-2w">5.1) Valeur commerciale des dotations</h5>

          <p>
            La valeur commerciale du lot correspond à la valeur de marché sur le territoire
            métropolitain au jour du tirage au sort, d&apos;un bon d&apos;achat chez DECATHLON
            d&apos;une valeur de 300 euros TTC ainsi qu&apos;un abonnement ou une licence d&apos;un
            an dans un club de sport ou une salle de sport, d&apos;une valeur maximale de 500 euros
            TTC.
          </p>
          <p>
            Le lot offert ne peut donner lieu à aucune contestation sur sa nature ni à la remise
            d&apos;une contrepartie de quelque nature que ce soit.
          </p>
          <p>
            L&apos;Organisateur se réserve le droit de changer la dotation sans préavis. Si tel
            était le cas, la valeur du lot serait équivalente ou supérieure aux produits remplacés.
            La contrepartie en chèque, en numéraire ou en chèque cadeau ne peut être proposée.
          </p>

          <h5 className="fr-mb-2w">5.2) Modalités de délivrance et d&apos;utilisation du lot</h5>
          <p>
            Tel que le prévoit l&apos;article 4, le Gagnant sera contacté par l&apos;Organisateur
            via le compte Instagram avec lequel le Participant à participer au jeu-concours et ce,
            dans un délai de trois semaines à compter de la publication du jeu-concours par le
            créateur sur son compte Instagram.
          </p>
          <p>
            Si les informations communiquées par le Gagnant sont incomplètes et/ou ne permettent pas
            de l&apos;informer de son gain, il perdra la qualité de Gagnant et ne pourra effectuer
            aucune réclamation.
          </p>
          <p>
            L&apos;Organisateur ne pourra par ailleurs être tenu responsable dans le cas de
            défiances techniques quant à cette notification de gain.
          </p>
          <p>
            La notification officielle et personnalisée d&apos;attribution des dotations au Gagnant
            avec le descriptif et les modalités de retrait lui seront communiquées par email suite à
            un premier échange via la Plateforme Instagram.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h4 className="fr-mb-2w">Article 6 - Données nominatives et personnelles</h4>

          <p>
            Pour la prise en compte de la participation au présent jeu-concours, la détermination
            des Gagnants et l&apos;attribution des lots, les Participants doivent obligatoirement
            fournir certaines données personnelles les concernant, traitées de manière automatisée
            sous la responsabilité l&apos;Organisateur.
          </p>
          <p>
            Dans le cadre de leur traitement, les données des Participants pourront être transmises
            à des sous-traitants situes hors de l&apos;Union Européenne conformément aux
            réglementations et aux recommandations de la Commission Européenne et ce, sous la
            responsabilité de l&apos;Organisateur, responsable de traitement.
          </p>
          <p>
            Les données seront conservées pendant toute la durée du présent jeu-concours et dans un
            délai maximum de six (6) mois à l&apos;issue de la remise de la dotation aux Gagnants.
          </p>
          <p>
            Les Participants disposent d&apos;un droit d&apos;accès, d&apos;opposition, de
            modification, de rectification, d&apos;effacement, de limitation, de portabilité et de
            suppression des données qui les concernent, ainsi que du droit de définir des directives
            relatives au sort de leurs données à caractère personnel dans le cas où les Participants
            ne pourraient plus exercer les droits précités en s&apos;adressant par courrier à
            l&apos;Organisateur dont l&apos;adresse est mentionnée à l&apos;article 1.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h4 className="fr-mb-2w">Article 7 - Responsabilités et droits</h4>

          <p>L&apos;Organisateur :</p>

          <ul className="fr-mb-2w">
            <li>
              a) Se réserve le droit de modifier, de proroger, d&apos;écourter, de limiter les gains
              ou d&apos;annuler ce jeu-concours en cas de force majeure. En conséquence, sa
              responsabilité ne saurait être engagée de ce fait.
            </li>
            <li>
              b) Dégage toute responsabilité en cas de problèmes d&apos;acheminement ou de perte de
              courrier électronique ou postal empêchant le bon déroulement du jeu-concours.
            </li>
          </ul>
        </section>

        <section className="fr-mb-6w">
          <h4 className="fr-mb-2w">Article 8 - Conditions d&apos;exclusion</h4>
          <p>
            La participation à ce jeu-concours implique l&apos;acceptation pleine et entière des
            modalités énoncées dans le présent règlement sans aucune réserve ni condition préalable
            des Participants, le non-respect dudit règlement, entraînant l&apos;exclusion du
            concours, la nullité pure et simple de la participation et de l&apos;attribution du lot.
          </p>

          <p>
            Ainsi, tout Participant s&apos;engage à être abonné aux comptes Instagram du Créateur
            par le biais duquel il aurait participé ainsi qu&apos;au compte Instagram pass Sport.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h4 className="fr-mb-2w">Article 9 – Règlement du jeu</h4>

          <p>
            Le règlement sera tenu à la libre disposition de tout Participant via l&apos;URL suivant
            :
            <Link
              href="https://pass.sports.gouv.fr/v2/reglement-du-jeu-concours-numero-2-pass-sport"
              target="_blank"
            >
              https://pass.sports.gouv.fr/v2/reglement-du-jeu-concours-numero-2-pass-sport
            </Link>
            <p>
              Le présent règlement pourra également être adressé gratuitement sur simple demande de
              tout participant, formulée à l&apos;adresse indiqué dans l&apos;article 1<sup>er</sup>
              .
            </p>
          </p>
        </section>

        <section className="fr-mb-6w">
          <h4 className="fr-mb-2w">Article 10 - Juridictions compétentes</h4>

          <p>
            Le présent règlement est soumis à la loi française. Les parties s&apos;efforcent de
            résoudre à l&apos;amiable tout différend né de l&apos;interprétation ou de
            l&apos;exécution du présent règlement.
          </p>
          <p>
            L&apos;Organisateur se réserve le droit de trancher sans appel toute difficulté pouvant
            survenir quant à l&apos;interprétation ou à l&apos;application du présent règlement,
            étant entendu qu&apos;aucune contestation ne sera admise notamment portant sur les
            modalités du jeu, sur la détermination du Gagnant, sur les conditions d&apos;octroi ou
            d&apos;utilisation des gains, un mois après la fin du jeu.
          </p>
          <p>Si le désaccord persiste, il sera soumis au Tribunal Judiciaire de Paris.</p>
          <p>
            Le Participant reconnaît avoir pris connaissance du présent règlement, l&apos;accepter
            sans réserve et s&apos;y conformer.
          </p>
        </section>
      </main>

      <EligibilityTestBanner />
      <SocialMediaPanel />
    </div>
  );
}
