import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import PageTitle from '../../../../components/PageTitle/PageTitle';
import styles from './style.module.scss';
import cn from 'classnames';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Politique de confidentialité - pass Sport',
};

export default function PolitiqueDeConfidentialite() {
  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle
          title="Politique de confidentialité"
          subtitle="Politique de confidentialité relative au traitement de données personnelles réalisé dans le cadre de la délivrance du pass Sport 2026"
          classes={{
            container: styles['page-header'],
          }}
        />
        <div className={styles.wrapper}>
          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">Article 1 - Définitions</h2>
            <p className="fr-mb-2w">
              Les définitions fournies à l&apos;article 4 du RGPD sont applicables aux présentes.
            </p>
            <p className="fr-mb-2w">
              <span className="fr-text--bold">« Données à caractère personnel »</span> ou{' '}
              <span className="fr-text--bold">« données personnelles »</span> : toute information se
              rapportant à une personne physique identifiée ou identifiable. La personne physique
              peut être identifiée directement ou indirectement.
            </p>
            <p className="fr-mb-2w">
              <span className="fr-text--bold">« Personne concernée »</span> : la personne concernée
              est la personne physique dont les données personnelles font l&apos;objet du
              traitement.
            </p>
            <p className="fr-mb-2w">
              <span className="fr-text--bold">« Traitement »</span> : toute opération ou tout
              ensemble d&apos;opérations effectués ou non à l&apos;aide de procédés automatisés et
              appliqués à des données ou des ensembles de données à caractère personnel (ex :
              collecte, enregistrement, conservation, extraction, utilisation, etc.).
            </p>
            <p className="fr-mb-2w">
              <span className="fr-text--bold">« Responsable de traitement »</span> : personne
              physique ou morale, autorité publique, service ou autre organisme qui, seul ou
              conjointement avec d&apos;autres, détermine les finalités et les moyens du traitement.
            </p>
            <p className="fr-mb-2w">
              <span className="fr-text--bold">« Destinataire »</span> : personne physique ou morale,
              autorité publique, service ou tout autre organisme qui reçoit communication de données
              à caractère personnel.
            </p>
            <p className="fr-mb-2w">
              <span className="fr-text--bold">« Sous-traitant »</span> : personne physique ou morale,
              autorité publique, service ou autre organisme qui traite des données à caractère
              personnel pour le compte du responsable de traitement.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">Article 2 - Qui est responsable ?</h2>
            <p className="fr-mb-2w">
              La Direction des sports du ministère des Sports, de la Jeunesse et de la Vie
              associative (ci-après{' '}
              <span className="fr-text--bold">« la Direction des sports »</span>) est le responsable
              de traitement de vos données personnelles. Elle collecte et traite vos données dans le
              cadre du traitement de données personnelles opéré pour la délivrance du pass Sport
              2026.
            </p>

            <p className="fr-mb-2w">
              <span className="fr-text--bold">Adresse postale :</span> <br /> <br />
              <span className="fr-text--bold">LA DIRECTION DES SPORTS,</span>
              <br />
              Située au 95 avenue de France 75013 PARIS
            </p>

            <p className="fr-mb-2w">
              <span className="fr-text--bold">Adresse mail :</span>
              <br />
              <Link href="mailto:ds-rgpd@sports.gouv.fr">ds-rgpd@sports.gouv.fr</Link>
            </p>

            <p>
              La Direction des sports s&apos;engage à ce que le traitement de vos données à
              caractère personnel effectué dans le cadre de l&apos;envoi du pass Sport 2026 respecte
              la réglementation en vigueur applicable au traitement de données à caractère personnel
              et, en particulier,{' '}
              <a
                href="https://www.cnil.fr/fr/reglement-europeen-protection-donnees"
                aria-label="Ouvrir une nouvelle fenêtre vers les dispositions du Règlement (UE) 2016/679 général sur la protection des données"
                target="_blank"
              >
                les dispositions du Règlement (UE) 2016/679 général sur la protection des données
              </a>{' '}
              (« RGPD »), de la{' '}
              <a
                href="https://www.cnil.fr/fr/la-loi-informatique-et-libertes"
                aria-label="Ouvrir une nouvelle fenêtre vers vers la loi n°78-17 informatique et Libertés du 6 janvier 1978 modifiée"
                target="_blank"
              >
                loi n°78-17 informatique et Libertés du 6 janvier 1978 modifiée
              </a>{' '}
              (« LIL ») et toute réglementation subséquente, ainsi que les dispositions prises par
              toute autorité de contrôle compétente, notamment en France la Commission Nationale
              Informatique & Libertés (CNIL).
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">
              Article 3 - Pourquoi traitons-nous des données à caractère personnel ?
            </h2>
            <p>
              Le présent traitement a pour finalité la délivrance du pass Sport 2026 aux
              bénéficiaires âgés de 6 à 30 ans éligibles sous certaines conditions définies par
              décret, dans le but de réduire le montant de l&apos;adhésion ou de la prise de licence
              proposée par les structures et associations sportives.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">
              Article 4 - Qu&apos;est-ce qui nous autorise à traiter vos données ?
            </h2>
            <p className="fr-mb-2w">
              Le traitement de vos données répond à une mission d&apos;intérêt public consistant à
              favoriser l&apos;accès du plus grand nombre à la pratique sportive, dans le cadre de la
              mise en œuvre des politiques publiques du sport.
            </p>
            <p>
              Le présent traitement se fonde sur l&apos;article 6. 1. e) du Règlement européen
              2016/679 (règlement général sur la protection des données - RGPD) relatif à
              l&apos;exécution d&apos;une mission d&apos;intérêt public dont est investie la
              Direction des sports au sens des articles L. 100-1 et L. 100-2 du code du sport.
              <br />
              <br />
              Cette mission d&apos;intérêt public se traduit en pratique par le décret n°2026-830 du
              28 août 2026.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">Article 5 - Quelles sont les données traitées ?</h2>
            <p>Pour les bénéficiaires éligibles au dispositif pass Sport</p>
            <ul className="fr-pl-4w">
              <li>
                Données relatives à l&apos;identité de l&apos;allocataire (responsable légal du
                bénéficiaire) : civilité, nom, prénom, date de naissance, lieu (pays et commune) de
                naissance, numéro d&apos;allocataire ;
              </li>
              <li>
                Données relatives à l&apos;identité du bénéficiaire (responsable légal ou mineur) :
                nom, prénom, sexe, date de naissance, commune de résidence ; prestation sociale (ARS
                / AAH / AEEH) ;
              </li>
              <li>Coordonnées : adresse de résidence, courriel, numéro de téléphone.</li>
            </ul>

            <p>Pour les exploitants de structures éligibles au dispositif pass Sport</p>
            <ul className="fr-pl-4w">
              <li>Données relatives à l&apos;identité : civilité, nom, prénom ;</li>
              <li>Coordonnées : courriel, numéro de téléphone ;</li>
              <li>Données relatives à la vie professionnelle : fonction dans la structure ;</li>
              <li>
                Données relatives au formulaire de contact : prénom, nom, adresse e-mail, champs
                libres.
              </li>
            </ul>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">Article 6 - Combien de temps sont conservées vos données ?</h2>
            <p className="fr-mb-2w">
              Les données à caractère personnel des bénéficiaires éligibles au dispositif pass Sport
              seront effacées au bout de 12 mois à compter de leur réception par la Direction des
              sports.
            </p>

            <p className="fr-mb-2w">
              Les données à caractère personnel des exploitants de structures éligibles au
              dispositif pass Sport seront effacées lorsque ces derniers quitteront leurs fonctions.
            </p>

            <p>
              Dans le cadre de ses obligations réglementaires, la Direction des Sports s&apos;engage
              à conserver les données en base production pendant un (1) an à compter de leur
              transmission. Les données sont ensuite conservées en base intermédiaire pour une durée
              de cinq (5) ans à compter de la date de leur transmission pour des finalités de
              contrôle et d&apos;évaluation de l&apos;action et des politiques publiques. Les données
              seront détruites à l&apos;issue de ce délai.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">
              Article 7 - Qui est concerné par le traitement des données ?
            </h2>
            <p className="fr-mb-2w">
              Sont concernées par le traitement mentionné à l&apos;article 3 les bénéficiaires de
              l&apos;allocation de rentrée scolaire (ARS), de l&apos;allocation aux adultes
              handicapés (AAH), de l&apos;allocation d&apos;éducation de l&apos;enfant handicapé
              (AEEH) ou d&apos;une bourse d&apos;enseignement supérieur sous conditions de ressources
              ou dans le cadre des formations sanitaires et sociales, âgés de 6 à 30 ans révolus,
              ainsi que leurs représentants légaux, le cas échéant.
            </p>
            <p>
              Sont également concernés les exploitants de structures éligibles au dispositif pass
              Sport, définies par décret.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">Article 8 - Où ont été collectées vos données ?</h2>
            <p className="fr-mb-2w">
              Vos données sont collectées directement lorsque vous souhaitez obtenir votre pass
              Sport ou lorsque vous remplissez le formulaire de contact sur le site
              www.pass.sports.gouv.fr.
            </p>
            <p className="fr-mb-2w">
              Vos données traitées ont également été collectées indirectement. Elles nous ont été
              communiquées par le Centre National des Œuvres Universitaires et Scolaires (CNOUS),
              établissement public national, La Caisse nationale des allocations familiales (CNAF)
              et la Caisse Centrale de la Mutualité Sociale Agricole (CCMSA). Ces échanges sont
              prévus par des conventions de transfert de données, signées dans le cadre de la
              mission de service public de la Direction des sports pour permettre aux personnes
              éligibles de bénéficier d&apos;une réduction immédiate sur l&apos;inscription dans une
              association, un club de sport ou une salle de sport et ainsi favoriser l&apos;accès à
              la pratique sportive.
            </p>
            <p>
              Compte tenu du volume important de données reçues dans ce cadre, nous ne sommes pas en
              mesure d&apos;informer individuellement chaque personne concernée de cette
              transmission. Conformément à l&apos;article 14.5 b) du RGPD, la présente politique de
              confidentialité constitue la source d&apos;information de ce traitement.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">
              Article 9 - Qui nous aide à traiter vos données à caractère personnel ?
            </h2>
            <p>
              Certaines données sont envoyées à des « sous-traitants » qui nous aident dans le
              traitement de vos données à caractère personnel. Le responsable de traitement
              s&apos;est assuré que les sous-traitants respectent notamment l&apos;article 28 du
              RGPD.
            </p>
            <div className="fr-table">
              <table>
                <thead>
                  <tr>
                    <th>Sous-traitant</th>
                    <th>Pays destinataire</th>
                    <th>Traitement réalisé</th>
                    <th>Garanties</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Scalingo</td>
                    <td>France</td>
                    <td>Hébergement du site vitrine</td>
                    <td>
                      <Link
                        href="https://scalingo.com/fr/contrat-gestion-traitements-donnees-personnelles"
                        target="_blank"
                        aria-label="Ouvrir une nouvelle fenêtre vers le site Scalingo sur le traitement des données personnelles"
                      >
                        https://scalingo.com/fr/contrat-gestion-traitements-donnees-personnelles
                      </Link>
                    </td>
                  </tr>
                  <tr>
                    <td>Crisp</td>
                    <td>France</td>
                    <td>API pour le support</td>
                    <td>
                      <Link
                        href="https://help.crisp.chat/en/article/how-to-sign-my-gdpr-data-processing-agreement-dpa-1wfmngo/"
                        target="_blank"
                        aria-label="Ouvrir une nouvelle fenêtre vers le site Crisp sur le traitement des données personnelles"
                      >
                        https://help.crisp.chat/en/article/how-to-sign-my-gdpr-data-processing-agreement-dpa-1wfmngo/
                      </Link>
                    </td>
                  </tr>
                  <tr>
                    <td>LinkMobility</td>
                    <td>France</td>
                    <td>Envoi d&apos;e-mails</td>
                    <td>
                      <Link
                        href="https://www.linkmobility.com/agreements-popd"
                        target="_blank"
                        aria-label="Ouvrir une nouvelle fenêtre vers le site Link Mobility sur le traitement des données personnelles"
                      >
                        https://www.linkmobility.com/agreements-popd
                      </Link>
                    </td>
                  </tr>
                  <tr>
                    <td>Vimeo</td>
                    <td>États-Unis</td>
                    <td>
                      Vidéo sur la page d&apos;accueil, vidéos sur la page tout savoir sur le pass
                      Sport
                    </td>
                    <td>
                      <Link
                        href="https://vimeo.com/enterpriseterms/dpa"
                        target="_blank"
                        aria-label="Ouvrir une nouvelle fenêtre vers le site Vimeo sur le traitement des données personnelles"
                      >
                        https://vimeo.com/enterpriseterms/dpa
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="fr-mb-2w">
              Des cookies et traceurs sont déposés si vous décidez de l&apos;accepter pour consulter
              les vidéos proposées par Vimeo sur la page d&apos;accueil du site ainsi que la page
              tout savoir sur le pass Sport.
            </p>

            <h3 className="fr-mb-2w">
              Quels sont les cookies et autres traceurs pouvant être utilisés ?
            </h3>

            <h4 className="fr-mb-2w">1. Les cookies déposés sur le site</h4>
            <p className="fr-mb-2w">
              Sous réserve du choix de l&apos;utilisateur, plusieurs cookies peuvent être utilisés
              sur le site internet pass.sports.gouv.fr. Les différentes finalités de ces cookies
              sont décrites ci-dessous.
            </p>

            <div className="fr-table">
              <table>
                <thead>
                  <tr>
                    <th>Cookies</th>
                    <th>Pays destinataire</th>
                    <th>Finalités</th>
                    <th>Durée de vie du cookie</th>
                    <th>Garanties</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>eligibility-form-support-data</td>
                    <td>France</td>
                    <td>
                      Conservation des tentatives infructueuses du formulaire pour le traitement du
                      support utilisateur
                    </td>
                    <td>1 heure</td>
                    <td>
                      Ne s&apos;agissant pas d&apos;un cookie tiers, les mesures de sécurité
                      mentionnées à l&apos;article 10 de la présente politique de confidentialité
                      s&apos;appliquent
                    </td>
                  </tr>

                  <tr>
                    <td>cfuvid</td>
                    <td>USA</td>
                    <td>Cookie de session</td>
                    <td>30 minutes</td>
                    <td>
                      <Link
                        href="https://vimeo.com/enterpriseterms/dpa"
                        target="_blank"
                        aria-label="Ouvrir une nouvelle fenêtre vers le site Vimeo sur la section des traitement de donneées"
                      >
                        https://vimeo.com/enterpriseterms/dpa
                      </Link>
                    </td>
                  </tr>

                  <tr>
                    <td>cf_bm</td>
                    <td>USA</td>
                    <td>
                      Cloudflare Bot Manager gère le trafic entrant qui correspond aux critères
                      associés aux bots.
                    </td>
                    <td>30 minutes</td>
                    <td>
                      <Link
                        href="https://vimeo.com/enterpriseterms/dpa"
                        target="_blank"
                        aria-label="Ouvrir une nouvelle fenêtre vers le site Vimeo sur la section des traitement de donneées"
                      >
                        https://vimeo.com/enterpriseterms/dpa
                      </Link>
                    </td>
                  </tr>

                  <tr>
                    <td>Player</td>
                    <td>USA</td>
                    <td>
                      Stocke les préférences pour les commandes du lecteur (c&apo;est-à-dire le
                      volume, la qualité du flux, les sous-titres)
                    </td>
                    <td>12 mois</td>
                    <td>
                      <Link
                        href="https://vimeo.com/enterpriseterms/dpa"
                        target="_blank"
                        aria-label="Ouvrir une nouvelle fenêtre vers le site Vimeo sur la section des traitement de donneées"
                      >
                        https://vimeo.com/enterpriseterms/dpa
                      </Link>
                    </td>
                  </tr>

                  <tr>
                    <td>vuid</td>
                    <td>USA</td>
                    <td>
                      ID généré par Vimeo utilisé pour générer des informations d&apo;analyse pour
                      le propriétaire de la vidéo.
                    </td>
                    <td>13 mois</td>
                    <td>
                      <Link
                        href="https://vimeo.com/enterpriseterms/dpa"
                        target="_blank"
                        aria-label="Ouvrir une nouvelle fenêtre vers le site Vimeo sur la section des traitement de donneées"
                      >
                        https://vimeo.com/enterpriseterms/dpa
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4 className="fr-mb-2w">2. Autres traceurs pouvant être utilisés</h4>
            <p className="fr-mb-2w">
              Nous utilisons un pixel de suivi dans les courriels que nous vous transmettons dans le
              cadre de la campagne pass Sport.
            </p>
            <p className="fr-mb-2w">
              Les pixels de suivi permettent de vérifier que nos communications vous parviennent
              correctement.
            </p>
            <p>
              En aucun cas, ces pixels ne sont utilisés à des fins publicitaires ou commerciales.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">
              Article 10 - Quelles mesures de sécurité mettons-nous en place ?
            </h2>

            <p className="fr-mb-2w">
              Nous mettons en place plusieurs mesures pour sécuriser les donneées :
            </p>

            <ul className="fr-pl-4w">
              <li className="fr-text--bold">
                Stockage des données en base de données : les fichiers sont déposés sur une
                infrastructure technique opérée par la Direction du Numérique pour l&apos;Education
                (DNE) pour le compte de la Direction des Sports, ce transfert réseau sécurisé a lieu
                par protocole SFTP ;
              </li>
              <li className="fr-text--bold">
                Minimisation des données : seules les données utiles sont collectées et traitées par
                la Direction des sports ;
              </li>
              <li className="fr-text--bold">Cloisonnement des donneées ;</li>
              <li className="fr-text--bold">Mesures de traçabilité ;</li>
              <li className="fr-text--bold">Chiffrement ;</li>
              <li className="fr-text--bold">Surveillance ;</li>
              <li className="fr-text--bold">Protection des réseaux ;</li>
              <li className="fr-text--bold">Sauvegarde ;</li>
              <li className="fr-text--bold">
                Mesures restrictives limitant l&apos;accès physique aux données à caractère
                personnel.
              </li>
            </ul>

            <p>
              Conformément à la réglementation applicable, à savoir l&apos;article 32 du RGPD et la
              loi Informatique et libertés dans sa version modifiée, vous disposez d&apos;un droit
              d&apos;information, d&apos;accès, de rectification, de limitation et d&apos;opposition
              des données qui vous concernent.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">Article 11 - Indications en cas de violation de données</h2>

            <p className="fr-mb-2w">
              La Direction des sports s&apos;engage à mettre en œuvre toutes les mesures techniques
              et organisationnelles appropriées grâce à des moyens de sécurisation physiques et
              logistiques permettant de garantir un niveau de sécurité adapté au regard des risques
              d&apos;accès accidentels, non autorisés ou illégaux, de divulgation,
              d&apos;altération, de perte ou encore de destruction des données personnelles vous
              concernant, au sens de l&apos;article 121 de la Loi informatiques et Libertés de 1978
              modifiée.
            </p>

            <p className="fr-mb-2w">
              Dans l&apos;éventualité où la Direction des sports prendrait connaissance d&apos;un
              accès illégal aux données personnelles vous concernant, stockées sur nos serveurs ou
              ceux de nos prestataires, ou d&apos;un accès non autorisé ayant pour conséquence la
              réalisation des risques identifiés ci-dessus, elle s&apos;engage à :
            </p>

            <ul className="fr-pl-4w">
              <li>
                Vous notifier l&apos;incident et en informer la CNIL dans les plus brefs délais, si
                cela est susceptible d&apos;engendrer un risque élevé pour vos droits et libertés ;
              </li>
              <li>Examiner les causes de l&apos;incident ;</li>
              <li>
                Prendre les mesures nécessaires dans la limite du raisonnable afin d&apos;amoindrir
                les effets négatifs et préjudices pouvant résulter dudit incident.
              </li>
            </ul>

            <p>
              En aucun cas les engagements définis au point ci-dessus ne peuvent être assimilés à
              une quelconque reconnaissance de faute ou de responsabilité quant à la survenance de
              l&apos;incident en question.
            </p>
          </section>

          <section className="fr-mb-6w">
            <h2 className="fr-mb-2w">Article 12 - Quels sont vos droits ? Comment les exercer ?</h2>
            <p className="fr-mb-2w">
              Conformément à la réglementation applicable, à savoir le RGPD et la loi Informatique
              et libertés, vous disposez d&apos;un droit d&apos;information, d&apos;accès, de
              rectification, de limitation, d&apos;un droit à l&apos;effacement, d&apos;un droit à
              la portabilité et d&apos;un droit d&apos;opposition des données qui vous concernent.
            </p>

            <ul className="fr-pl-4w">
              <li>Exercice de vos droits</li>
            </ul>

            <p className="fr-mb-2w">
              Vous pouvez exercer ces droits en vous adressant aux responsables de traitement : Par
              voie postale, à l&apos;adresse suivante :
            </p>

            <p className={cn(styles['wrapper__text--center'], 'fr-mb-2w')}>
              LA DIRECTION DES SPORTS <br /> 95 avenue de France 75013 PARIS
            </p>

            <p className="fr-mb-2w">
              Par voie électronique à l&apos;adresse suivante : ds-rgpd@sports.gouv.fr ou via le
              formulaire de saisine en ligne :{' '}
              <Link
                href="http://www.education.gouv.fr/pid33441/nous-contacter.html#RGPD"
                target="_blank"
                aria-label="Ouvrir une nouvelle fenêtre vers le site education.gouv.fr section RGPD"
              >
                http://www.education.gouv.fr/pid33441/nous-contacter.html#RGPD
              </Link>
            </p>

            <ul className="fr-pl-4w">
              <li>Réclamation auprès de la CNIL</li>
            </ul>

            <p className="fr-mb-2w">
              Si vous estimez après nous avoir contactés que les droits sur vos données n&apos;ont
              pas été respectés, vous pouvez introduire une réclamation auprès de la CNIL.{' '}
              <Link
                href="https://www.cnil.fr/fr/mes-demarches/les-droits-pour-maitriser-vos-donnees-personnelles"
                target="_blank"
                aria-label="Ouvrir une nouvelle fenêtre vers le site de la CNIL pour plus d'informations sur vos droits"
              >
                Voir le site de la CNIL pour plus d&apos;informations sur vos droits.
              </Link>
            </p>
          </section>
        </div>
      </main>

      <SocialMediaPanel titleAs="h2" />
    </>
  );
}
