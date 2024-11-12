import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import styles from './style.module.scss';
import EligibilityTestBanner from '@/components/eligibility-test-banner/EligibilityTestBanner';
import { Metadata } from 'next';
import Link from 'next/link';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';

export const metadata: Metadata = {
  title: 'Règlement du jeu-concours pass Sport - Décathlon',
};

export default function Page() {
  return (
    <div>
      <PageTitle
        title="Règlement du jeu-concours pass Sport - Décathlon"
        subtitle=""
        classes={{
          container: styles['page-header'],
        }}
      />
      <main className={styles.wrapper} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 1 – Société organisatrice</h2>

          <p className="fr-mb-2w">Raison Sociale : Administration publique</p>
          <p className="fr-mb-2w">Ayant son siège social au 95 AVENUE DE FRANCE 75013 PARIS</p>
          <p className="fr-mb-2w">Numéro de SIRET : 13001658700011</p>
          <p className="fr-mb-2w">
            Ci-après dénommée « MINISTÈRE DES SPORTS, DE LA JEUNESSE ET DE LA VIE ASSOCIATIVE » ou «
            la Société Organisatrice ».
          </p>
          <p className="fr-mb-2w">
            Organise un jeu concours intitulé « Jeu-concours pass Sport», ci-après dénommé le « Jeu
            ».
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 2 – Conditions relatives aux participans</h2>

          <p className="fr-mb-2w">
            Le jeu est ouvert à toute personne physique majeure (État civil faisant foi) disposant
            d&apos;un accès internet et résidant en France métropolitaine (Corse incluse) et Monaco,
            à l&apos;exception des membres du personnel de la société organisatrice, de
            l&apos;agent, la société FOLLOW organisant le concours au côté de Ministère des sports
            et/ou des membres de leur famille en ligne directe, ainsi que toute personne ayant
            participé directement ou indirectement à la conception, à la réalisation ou à la gestion
            du jeu et/ou les membres de leur famille en ligne directe. La participation à ce Jeu est
            strictement personnelle et nominative.
          </p>

          <p className="fr-mb-2w">
            Il est rigoureusement interdit de jouer avec plusieurs adresses e-mails et comptes ainsi
            que de jouer à partir du compte d&apos;une autre personne. La Société Organisatrice se
            réserve le droit de procéder à toute vérification pour le respect du présent article
            comme de l&apos;ensemble du règlement, notamment pour écarter tout participant ayant
            commis un abus quelconque, sans toutefois qu&apos;elle ait l&apos;obligation de procéder
            à une vérification systématique de l&apos;ensemble des participants. Les participants
            autorisent la Société Organisatrice à procéder à toutes vérifications nécessaires
            concernant l&apos;identité et le domicile de ces derniers. Toute fausse déclaration
            entraîne automatiquement l&apos;élimination du participant.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 3 – Annonce du jeu</h2>

          <p className="fr-mb-2w">
            Le jeu est annoncé conjointement sur la page Instagram de{' '}
            <Link href="https://www.instagram.com/passsportofficiel/" target="_blank">
              @passsportofficiel
            </Link>{' '}
            et sur celle des influenceurs suivants :
          </p>
          <ul className="fr-mb-2w">
            <li>
              Sofiadun10 :{' '}
              <Link href="https://www.instagram.com/sofiadun10/" target="_blank">
                https://www.instagram.com/sofiadun10/
              </Link>
            </li>

            <li>
              Madamesantoro :{' '}
              <Link href="https://www.instagram.com/madame.santoro/" target="_blank">
                https://www.instagram.com/madame.santoro/
              </Link>
            </li>

            <li>
              Baby à tout prix :{' '}
              <Link href="https://www.instagram.com/babyatoutprix/" target="_blank">
                https://www.instagram.com/babyatoutprix/
              </Link>
            </li>

            <li>
              Poi.family :{' '}
              <Link href="https://www.instagram.com/poi.family/" target="_blank">
                https://www.instagram.com/poi.family/
              </Link>
            </li>

            <li>
              Nourhène :{' '}
              <Link href="https://www.instagram.com/nourhene/" target="_blank">
                https://www.instagram.com/nourhene/
              </Link>
            </li>
          </ul>

          <h3 className="fr-mb-2w">Jeux-concours influence</h3>
          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/sofiadun10/" target="_blank">
                  Sofiadun10 :
                </Link>
              </li>
            </ul>
            <p>Durée : 1 semaine</p>
            <p>Nombre de gagnants : 10 gagnants</p>
          </section>
          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/madame.santoro/" target="_blank">
                  Madamesantoro :
                </Link>
              </li>
            </ul>
            <p>Durée : 1 semaine</p>
            <p>Nombre de gagnants : 10 gagnants</p>
          </section>
          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/babyatoutprix/" target="_blank">
                  Baby à tout prix :
                </Link>
              </li>
            </ul>
            <p>Durée : 1 semaine</p>
            <p>Nombre de gagnants : 10 gagnants</p>
          </section>
          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/poi.family/" target="_blank">
                  Poi.family :
                </Link>
              </li>
            </ul>
            <p>Durée : 1 semaine</p>
            <p>Nombre de gagnants : 10 gagnants</p>
          </section>
          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/nourhene" target="_blank">
                  Nourhène :
                </Link>
              </li>
            </ul>
            <p>Durée : 1 semaine</p>
            <p>Nombre de gagnants : 100 gagnants</p>
          </section>

          <h3 className="fr-mb-2w">
            Jeux-concours sur le compte{' '}
            <Link href="https://www.instagram.com/passsportofficiel/" target="_blank">
              @passsportofficiel
            </Link>
          </h3>
          <section className="fr-mb-2w">
            <ul>
              <li>Concours 1</li>
            </ul>
            <p>Durée : 1 semaine</p>
            <p>Nombre de gagnants : 30 gagnants</p>
            <p>Gain : 250€ de bon d&apos;achat par gagnant soit 7500€ en tout</p>
          </section>

          <section className="fr-mb-2w">
            <ul>
              <li>Concours 2</li>
            </ul>
            <p>Durée : 1 semaine</p>
            <p>Nombre de gagnants : 30 gagnants</p>
            <p>Gain : 250€ de bon d&apos;achat par gagnant soit 7500€ en tout</p>
          </section>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 4 – Modalités et conditions de participation</h2>
          <h3 className="fr-mb-2w">4.1 Modalités de participation</h3>

          <p className="fr-mb-2w">
            Le jeu concours se déroule sur la période suivante : du 04/11/2024 au 15/11/2024 Pour
            participer à ce jeu, les participants doivent : suivre les instructions données sur les
            publications postées sur les pages INSTAGRAM suscitées
          </p>

          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/sofiadun10/" target="_blank">
                  Sofiadun10
                </Link>
              </li>
            </ul>
            <p>
              S&apos;abonner au compte{' '}
              <Link href="https://www.instagram.com/passsportofficiel/" target="_blank">
                @passsportofficiel
              </Link>{' '}
              ainsi qu&apos;au compte de{' '}
              <Link href="https://www.instagram.com/sofiadun10/" target="_blank">
                @sofiadun10
              </Link>
              , liker la publication, commenter la publication
            </p>
          </section>

          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/madame.santoro/" target="_blank">
                  Madamesantoro
                </Link>
              </li>
            </ul>

            <p>
              S&apos;abonner au compte{' '}
              <Link href="https://www.instagram.com/passsportofficiel/" target="_blank">
                @passsportofficiel
              </Link>{' '}
              ainsi qu&apos;au compte de{' '}
              <Link href="https://www.instagram.com/madame.santoro/" target="_blank">
                @madamesantoro
              </Link>
              , liker la publication, commenter la publication
            </p>
          </section>

          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/babyatoutprix/" target="_blank">
                  Baby à tout prix
                </Link>
              </li>
            </ul>
            <p>
              S&apos;abonner au compte{' '}
              <Link href="https://www.instagram.com/passsportofficiel/" target="_blank">
                @passsportofficiel
              </Link>{' '}
              ainsi qu&apos;au compte de{' '}
              <Link href="https://www.instagram.com/babyatoutprix/" target="_blank">
                @babyatoutprix
              </Link>
              , liker la publication, commenter la publication
            </p>
          </section>

          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/poi.family/" target="_blank">
                  Poi.family
                </Link>
              </li>
            </ul>
            <p>
              S&apos;abonner au compte{' '}
              <Link href="https://www.instagram.com/passsportofficiel/" target="_blank">
                @passsportofficiel
              </Link>{' '}
              ainsi qu&apos;au compte de{' '}
              <Link href="https://www.instagram.com/poi.family/" target="_blank">
                @poi.family
              </Link>
              , liker la publication, commenter la publication
            </p>
          </section>

          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/nourhene/" target="_blank">
                  Nourhène
                </Link>
              </li>
            </ul>
            <p>
              S&apos;abonner au compte{' '}
              <Link href="https://www.instagram.com/passsportofficiel/" target="_blank">
                @passsportofficiel
              </Link>{' '}
              ainsi qu&apos;au compte de{' '}
              <Link href="https://www.instagram.com/nourhene/" target="_blank">
                @nourhene
              </Link>
              , liker la publication, commenter la publication
            </p>
          </section>

          <h3 className="fr-mb-2w">
            Jeux-concours sur le compte{' '}
            <Link href="https://www.instagram.com/passsportofficiel/" target="_blank">
              @passsportofficiel
            </Link>
          </h3>
          <section className="fr-mb-2w">
            <ul>
              <li>Concours 1</li>
            </ul>
            <p>S&apos;abonner au compte, liker la publication, commenter la publication.</p>
          </section>

          <section className="fr-mb-2w">
            <ul>
              <li>Concours 2</li>
            </ul>
            <p>S&apos;abonner au compte, liker la publication, commenter la publication.</p>
          </section>

          <h3 className="fr-mb-2w">4.2. Conditions de participation au Jeu</h3>
          <p className="fr-mb-2w">
            Toute participation au jeu incomplète, non-conforme aux conditions exposées dans le
            présent règlement ne sera pas prise en compte et sera considérée comme nulle.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 5 – Désignation des gagnants</h2>

          <p className="fr-mb-2w">
            Le tirage au sort sera réalisé 1 semaine après les publications des jeux-concours. Les
            gagnants seront également contactés par message privé sur leur compte Instagram. Le
            tirage au sort sera effectué par un logiciel informatique tiers.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 6 – Lots mis en jeu</h2>
          <h3 className="fr-mb-2w">6.1. Dotations</h3>
          <p className="fr-mb-2w">
            Dotations mises en jeu : 50 000 euros de bon d&apos;achats DECATHLON, répartis comme
            suit :
          </p>

          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/sofiadun10/" target="_blank">
                  Sofiadun10
                </Link>
              </li>
            </ul>
            <p>Gain : 250€ de bon d&apos;achat par gagnant soit 2500€ en tout</p>
          </section>

          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/madame.santoro/" target="_blank">
                  Madamesantoro
                </Link>
              </li>
            </ul>
            <p>Gain : 250€ de bon d&apos;achat par gagnant soit 2500€ en tout</p>
          </section>

          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/babyatoutprix/" target="_blank">
                  Baby à tout prix
                </Link>
              </li>
            </ul>
            <p>Gain : 250€ de bon d&apos;achat par gagnant soit 2500€ en tout</p>
          </section>

          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/poi.family/" target="_blank">
                  Poi.family
                </Link>
              </li>
            </ul>
            <p>Gain : 250€ de bon d&apos;achat par gagnant soit 2500€ en tout</p>
          </section>

          <section className="fr-mb-2w">
            <ul>
              <li>
                <Link href="https://www.instagram.com/nourhene/" target="_blank">
                  Nourhène
                </Link>
              </li>
            </ul>
            <p>Gain : 250€ de bon d&apos;achat par gagnant soit 25 000€ en tout</p>
          </section>

          <h3 className="fr-mb-2w">
            Jeux-concours sur le compte{' '}
            <Link href="https://www.instagram.com/passsportofficiel/" target="_blank">
              @passsportofficiel
            </Link>
          </h3>
          <section className="fr-mb-2w">
            <ul>
              <li>Concours 1</li>
            </ul>
            <p>Gain : 250€ de bon d&apos;achat par gagnant soit 7500€ en tout</p>
          </section>

          <section className="fr-mb-2w">
            <ul>
              <li>Concours 2</li>
            </ul>
            <p>Gain : 250€ de bon d&apos;achat par gagnant soit 7500€ en tout</p>
          </section>

          <h3 className="fr-mb-2w">6.2. Remise des lots</h3>
          <p className="fr-mb-2w">
            Les lots sont envoyés par voie postale aux gagnants désignés sur les réseaux sociaux.
          </p>

          <h3 className="fr-mb-2w">6.3. Précisions relatives aux lots</h3>
          <p className="fr-mb-2w">
            Les lots sont nominatifs et ne peuvent être cédés à un tiers. Les lots ne pourront être
            attribués sous une autre forme que celle prévue par le présent règlement. Il ne sera
            attribué aucune contre-valeur en espèces, en échange des lots gagnés. Les dotations qui
            n&apos;auraient pu pour quelque raison que ce soit, être remises aux gagnants, ne seront
            pas réattribuées.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 7 – Limite de responsabilité</h2>

          <ul>
            <li>
              La société organisatrice ne saurait être tenue pour responsable si pour cause de force
              majeure ou d&apos;événement indépendant de sa volonté ce jeu devait être annulé,
              prolongé, écourté, modifié ou reporté. Tout changement fera l&apos;objet
              d&apos;informations préalables par tout moyen approprié. Des additifs et modifications
              de règlement peuvent alors éventuellement être publiés pendant le jeu. Ils seront
              considérés comme des annexes au présent règlement.
            </li>
            <li>
              La société organisatrice ne saurait être tenue responsable de tout dysfonctionnement
              du réseau « Internet » empêchant le bon déroulement du Jeu notamment dû à des actes de
              malveillance extérieurs. La connexion de toute personne au site et la participation au
              Jeu se fait sous son entière responsabilité. Il appartient donc à tout participant de
              prendre toutes les mesures appropriées de façon à protéger ses propres données et/ou
              logiciels stockés sur son équipement informatique contre toute atteinte due à des
              actes de malveillance extérieurs, et notamment les virus.
            </li>
            <li>
              La société organisatrice ne saurait davantage être tenue pour responsable au cas où un
              ou plusieurs participants ne pourraient se connecter au site du Jeu du fait de tout
              défaut technique ou de tout problème lié notamment à l&apos;encombrement du réseau.
            </li>
            <li>
              Les modalités du jeu de même que les prix offerts aux gagnants ne peuvent donner lieu
              à aucune contestation d&apos;aucune sorte.
            </li>
            <li>
              La société organisatrice pourra annuler ou suspendre tout ou partie du Jeu s&apos;il
              apparaît que des fraudes sont intervenues sous quelque forme que ce soit, notamment de
              manière informatique dans le cadre de la participation au Jeu, et/ou en cas de
              communication d&apos;informations erronées. Elle se réserve, dans cette hypothèse, le
              droit de ne pas attribuer les dotations aux fraudeurs et/ou de poursuivre devant les
              juridictions compétentes les auteurs de ces fraudes.
            </li>
            <li>
              Dans tous les cas, si le bon déroulement administratif et/ou technique du Jeu est
              perturbé par un virus, bug informatique, intervention humaine non autorisée ou toute
              autre cause échappant à la société organisatrice, celle-ci se réserve le droit
              d&apos;interrompre le Jeu.
            </li>
            <li>
              La société organisatrice décline toute responsabilité pour tous les incidents et/ou
              accidents qui pourraient survenir pendant la durée de jouissance du lot attribué et/ou
              du fait de son utilisation.
            </li>
            <li>
              La responsabilité du réseau social Facebook ou Instagram ne pourra être recherchée au
              titre de l&apos;organisation dudit Jeu et de ses conséquences. Le Jeu n&apos;est pas
              géré ni sponsorisé par ces réseaux.
            </li>
          </ul>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 8 – Informatique et libertés</h2>

          <p className="fr-mb-2w">
            Les données à caractère personnel recueillies par le ministère des sports dans le cadre
            du Jeu sont collectées et traitées en conformité avec la Loi Informatique et Libertés n°
            78-17 du 6 janvier 1978 telle que modifiée par la loi n° 2004-801 du 6 août 2004.
          </p>

          <p className="fr-mb-2w">
            Tous les Participants au Jeu, justifiant de leur identité, disposent en application de
            l&apos;article 40 de cette loi, du droit de demander que les données à caractère
            personnel les concernant qui sont inexactes, incomplètes, équivoques ou périmées soient,
            selon les cas, rectifiées, complétées, mises à jour, verrouillées ou effacées.
          </p>

          <p className="fr-mb-2w">
            Par le présent règlement, et conformément aux dispositions de l&apos;article 32 de la
            Loi Informatique et Libertés, les Participants sont informés que les données à caractère
            personnel les concernant pourront faire l&apos;objet d&apos;une transmission éventuelle
            aux partenaires commerciaux du ministère des sports, à moins qu&apos;ils ne
            s&apos;opposent, sans frais, à cette communication.
          </p>

          <p className="fr-mb-2w">
            Toute demande d&apos;accès, de rectification ou d&apos;opposition doit être adressée par
            écrit, à :
          </p>

          <p className="fr-mb-2w">
            Ministère des Sports, de la Jeunesse et de la vie associative au 95 AVENUE DE FRANCE
            75013 PARIS.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 9 - Dépôt du règlement et mise à disposition</h2>

          <p className="fr-mb-2w">
            Le présent règlement est déposé en l&apos;étude de KEVIN TOUATI – HUISSIER DE JUSTICE,
            36 RUE MONTGRAND 13006 MARSEILLE. Le présent règlement est adressé, à titre gratuit, à
            toute personne qui en fait la demande à l&apos;adresse :
          </p>

          <p className="fr-mb-2w">CCI AIX MARSEILLE PROVENCE</p>

          <p className="fr-mb-2w">
            Palais de la Bourse, 9 la Canebière - CS 21856 - 13221 Marseille Cedex 01
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 10 – Modification du Jeu</h2>

          <p className="fr-mb-2w">
            L&apos;organisateur se réserve le droit d&apos;écourter, de prolonger, de modifier ou
            d&apos;annuler le Jeu, en cas de survenance d&apos;un évènement constitutif de force
            majeure, de cause étrangère ou de cas fortuit. Aucune indemnisation ou dédommagement ne
            serait alors dû aux Participants. Sa responsabilité ne saurait être engagée de ce fait.
          </p>

          <p className="fr-mb-2w">
            Toute modification des conditions de déroulement du Jeu interviendra par avenant, qui
            sera porté à la connaissance des Participants par le biais du site internet et de
            l&apos;étude de KEVIN TOUATI – HUISSIER DE JUSTICE, 36 RUE MONTGRAND 13006 MARSEILLE.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 11 - Contestation des participants</h2>

          <p className="fr-mb-2w">
            Il ne sera répondu à aucune demande téléphonique ou écrite concernant
            l&apos;interprétation ou l&apos;application du présent règlement, les mécanismes ou les
            modalités du Jeu ainsi que sur la liste des Gagnants. L&apos;organisateur tranchera
            souverainement tout litige et toute contestation relative au Jeu et à son règlement en
            accord avec KEVIN TOUATI – HUISSIER DE JUSTICE, 36 RUE MONTGRAND 13006 MARSEILLE.
          </p>

          <p className="fr-mb-2w">
            Les contestations ne seront recevables que dans un délai de 20 jours à compter de la
            date de la clôture du Jeu, le cachet de la poste faisant foi. Cette lettre de
            contestation devra indiquer la date précise de participation au Jeu, les coordonnées
            complètes du Participant et le motif exact de la contestation pour être prise en compte.
          </p>

          <p className="fr-mb-2w">
            Toute contestation relative aux conditions et modalités de déroulement du Jeu, aux
            modalités de son fonctionnement ou d&apos;attribution des dotations ou toute
            contestation relative à la validité, à l&apos;exécution ou à l&apos;interprétation du
            présent règlement sera soumise à l&apos;arbitrage - sans recours - de la Direction
            Générale de la CCIAMP qui tranchera souverainement tout litige.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 12 - Acceptation du règlement</h2>

          <p className="fr-mb-2w">
            La participation au jeu-concours implique l&apos;acceptation pleine et entière des
            modalités énoncées dans le présent règlement.
          </p>

          <p className="fr-mb-2w">
            Tout litige ou toute contestation qui viendraient à naître de l&apos;application ou de
            l&apos;interprétation du présent règlement et qui ne se seraient pas prévus par celui-ci
            seront tranchés souverainement et en dernier ressort par l&apos;organisateur. En outre,
            toutes contestations relatives à ce concours ne pourront être prises en compte au-delà
            d&apos;un délai de 30 jours à compter de la date de fin du Jeu.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Article 13 - Loi applicable et règlement des litiges</h2>

          <p className="fr-mb-2w">
            Les Participants sont soumis à la réglementation française applicable aux jeux et
            concours. Tout litige qui ne pourra être réglé à l&apos;amiable sera soumis aux
            tribunaux compétents de Marseille.
          </p>
        </section>
      </main>

      <EligibilityTestBanner />
      <SocialMediaPanel />
    </div>
  );
}
