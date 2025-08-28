'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Image from 'next/image';
import code from '@/images/code.svg';
import cn from 'classnames';
import styles from '@/app/v2/jeunes-et-parents/styles.module.scss';
import Link from 'next/link';
import {
  CONTACT_PAGE_QUERYPARAMS,
  FAQ_PAGE_QUERY_PARAMS,
} from '@/app/constants/search-query-params';

export function AccordionsFaq() {
  return (
    <>
      <Accordion label="Quel est le format du pass Sport cette année ?" onExpandedChange={() => {}}>
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Pour appliquer la réduction de 70€, le bénéficiaire doit vous fournir le pass Sport
            qu&apos;il a reçu par e-mail.
          </p>

          <p className="fr-mb-2w">
            Le code alphanumérique commençant par 25 est à saisir sur votre Compte Asso.
          </p>

          <p className="fr-mb-4w">Voici à quoi ressemble un pass Sport :</p>
          <Image
            src={code}
            className={cn('fr-responsive-img', styles['activate-code-section__image'])}
            alt="Modèle pass Sport 2025"
          />
        </article>
      </Accordion>
      <Accordion
        label="Comment s'assurer que le pass Sport est valide ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Lors de la saisie du code, le nom du jeune bénéficiaire s&apos;affiche. Vous devez
            vérifier qu&apos;il s&apos;agit bien de votre adhérent et non d&apos;une autre personne
            (comme un membre de la fratrie). Le pass Sport est une aide individuelle, non
            transférable.
          </p>

          <p className="fr-mb-2w">
            Si un message affiche que le code n&apos;existe pas, il s&apos;agit probablement
            d&apos;une erreur de saisie ou d&apos;un faux pass. Demandez au bénéficiaire de vous le
            redonner.
          </p>

          <div className="text-align--center fr-my-1w">
            <Image
              src="/images/structures/pass_sport_not_existing_error.png"
              width={700}
              height={72}
              alt={
                "Message d'erreur: le n° pass Sport saisi n'existe pas. Veuillez SVP vérifier le n° et corriger la saisie"
              }
            />
          </div>

          <p className="fr-mb-2w">
            Si un message affiche que le bénéficiaire est déjà inscrit, deux situations sont
            possibles :
          </p>
          <ul className="fr-ml-2w">
            <li>Soit le code a déjà été enregistré sur votre Compte Asso. Pensez à vérifier.</li>
            <li>Soit le code a déjà été saisi par une autre structure.</li>
          </ul>

          <p>Le code ne peut en effet être utilisé qu’une seule fois dans Le Compte Asso.</p>

          <div className="text-align--center fr-my-1w">
            <Image
              src="/images/structures/pass_sport_can_only_be_used_once_error_message.png"
              width={700}
              height={72}
              alt={
                "Message d'erreur : ce bénéficiaire est déjà inscrit au sein de la même structure ou d'une autre structure. Il ne peut pas être inscrit deux fois."
              }
            />
          </div>
        </article>
      </Accordion>
      <Accordion
        label="Comment obtenir le remboursement des pass Sport ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Pour obtenir le remboursement des pass Sport, suivez ces étapes :
          </p>
          <ul className="fr-ml-2w">
            <li>
              Saisie du pass Sport : saisissez le pass Sport de votre adhérent sur &ldquo;
              <Link
                className="fr-link"
                href="https://lecompteasso.associations.gouv.fr"
                target="_blank"
                title="Le Compte Asso - Nouvelle fenêtre"
              >
                Le compte Asso&rdquo; (LCA)
              </Link>{' '}
              entre le 1er septembre et le 31 décembre 2025.
            </li>
            <li>
              Ouverture du dossier de remboursement : au premier pass Sport saisi, un dossier de
              remboursement est ouvert pour votre structure.
            </li>
            <li>
              Vérification des justificatifs : le service instructeur vérifiera votre justificatif
              d’éligibilité (attestation d’affiliation ou agrément ou charte d&apos;engagement) et
              votre RIB.
            </li>
            <li>
              Les premiers remboursements auront lieu à partir du mois d&apos;octobre, à condition
              que votre RIB soit correctement renseigné. Ensuite, chaque 15 du mois, le service
              récupère tous les pass saisis au cours des 30 derniers jours pour effectuer les
              paiements en fin de mois.
            </li>
            <li>
              Virement bancaire : votre structure sera remboursée par virement bancaire de l’Agence
              de Services et de Paiement (ASP), tiers payeur de l&apos;État.
            </li>
          </ul>
        </article>
      </Accordion>
      <Accordion
        label="Un jeune n’a pas encore reçu son code pass Sport. Que faire ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Si un jeune n&apos;a pas encore reçu son code pass Sport vous pouvez, si vous le
            souhaitez, proposer la solution suivante :
          </p>
          <ul className="fr-ml-2w">
            <li>Inscrire le jeune en appliquant immédiatement la réduction de 70€ ;</li>
            <li>
              Demander au jeune (ou à sa famille) un chèque de caution de 70€, qui leur sera
              restitué dès réception du code pass Sport.
            </li>
          </ul>
          <p className="fr-mb-2w">
            Si le jeune n&apos;est finalement pas éligible, vous êtes en droit d&apos;encaisser le
            chèque.
          </p>
        </article>
      </Accordion>
      <Accordion
        label="Comment ajouter un bénéficiaire sur le Compte Asso ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Si le bénéficiaire vous a présenté son code alphanumérique (25-XXXX-XXXX) et que votre
            structure a accordé une déduction immédiate de 70€ sur l&apos;inscription :
          </p>

          <ul className="fr-ml-2w">
            <li>
              Vous devez avoir un compte sur{' '}
              <Link
                className="fr-link"
                href="https://lecompteasso.associations.gouv.fr"
                target="_blank"
                title="Le Compte Asso - Nouvelle fenêtre"
              >
                Le compte Asso (LCA)
              </Link>
              . Si vous en avez déjà un, il vous suffit de le mettre à jour. Cela vous permettra
              d&apos;apparaître sur la cartographie en ligne sur le site.
            </li>
            <li>
              Veuillez ensuite compléter votre profil en téléversant votre justificatif
              d&apos;éligibilité au dispositif (un des trois suivants) dans la rubrique
              &ldquo;affiliations et adhérents personnes morales&rdquo; :
              <ul className="fr-ml-2w">
                <li>
                  Association : attestation d&apos;affiliation à une fédération sportive agréée par
                  le ministère des Sports, de la Jeunesse et de la Vie associative ;
                </li>
                <li>Association : agrément JEP ou Sport valide ;</li>
                <li>
                  Structures à but lucratif (Loisirs Sportifs Marchands) : charte d&apos;engagement
                  2025.
                </li>
              </ul>
            </li>
          </ul>

          <p className="fr-mb-2w">
            Pour obtenir de l&apos;aide, vous pouvez également contacter votre Délégation Régionale
            Académique à la Jeunesse, à l’Engagement et aux Sports (DRAJES) ou nous{' '}
            <Link
              className="fr-link"
              href={`/v2/une-question?${FAQ_PAGE_QUERY_PARAMS.displayType}=pro&${CONTACT_PAGE_QUERYPARAMS.modalOpened}=1`}
              title="Ouvrir le formulaire de contact"
            >
              contacter via le formulaire
            </Link>
            .
          </p>

          <p className="fr-mb-2w">Comment ajouter un nouveau bénéficiaire ?</p>
          <p className="fr-mb-2w">
            Allez dans la rubrique{' '}
            <span className="fr-text--bold">&ldquo;Gérer les inscriptions pass Sport&rdquo;</span>{' '}
            (voir copie d&apos;écran ci-jointe). Vous devez impérativement saisir tous les codes
            avant le 31 décembre 2025.
          </p>

          <div className="text-align--center fr-my-1w">
            <Image
              src="/images/structures/lca_gerer_les_pass_sports.png"
              width={700}
              height={155}
              alt="Gérer les pass Sport"
            />
          </div>

          <div className="text-align--center fr-my-1w">
            <Image
              src="/images/structures/lca_ajouter_benef.png"
              width={700}
              height={271}
              alt="Ajouter un bénéficiaire sur Le Compte Asso"
            />
          </div>
        </article>
      </Accordion>
    </>
  );
}
