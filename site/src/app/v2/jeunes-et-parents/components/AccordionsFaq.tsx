'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Image from 'next/image';
import code from '@/images/code.svg';
import cn from 'classnames';
import styles from '@/app/v2/jeunes-et-parents/styles.module.scss';
import Link from 'next/link';
import { AEEH } from '@/app/v2/accueil/components/acronymes/Acronymes';
import { DISPLAY_TYPE } from '@/app/constants/display-type';
import {
  CONTACT_PAGE_QUERYPARAMS,
  FAQ_PAGE_QUERY_PARAMS,
} from '@/app/constants/search-query-params';

export function AccordionsFaq() {
  return (
    <>
      <Accordion label="J'ai perdu ou supprimé mon pass Sport" onExpandedChange={() => {}}>
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Si vous avez perdu ou supprimé votre pass Sport, vous pouvez le récupérer directement
            sur le site en cliquant sur le lien suivant :{' '}
            <Link
              className="fr-link"
              href="/v2/test-eligibilite"
              title={"Aller vers le test d'éligibilité"}
            >
              récupérer mon pass Sport
            </Link>
            .
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
        label="Il manque le pass Sport d'un ou plusieurs de mes enfants"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Il est possible que les enfants d&apos;une même famille reçoivent leur code pass Sport à
            des dates différentes. Certains peuvent aussi ne pas être éligibles.
          </p>

          <p className="fr-mb-2w">
            La majorité des bénéficiaires ont reçu leur code par e-mail à la fin du mois
            d&apos;août, sauf dans les cas suivants :
          </p>

          <ul className="fr-ml-2w">
            <li>
              Les enfants de 6 à 13 ans ainsi que les jeunes de 18 et 19 ans bénéficiaires de
              l&apos;
              <AEEH />.
              <p className="fr-mb-2w">
                → La demande doit être faite en ligne, à partir du 1er septembre.{' '}
                <Link
                  href="/v2/test-eligibilite"
                  className="fr-link"
                  title={"Aller vers le formulaire d'obtention du pass Sport"}
                >
                  Cliquez ici
                </Link>
                .
              </p>
            </li>
          </ul>

          <ul className="fr-ml-2w">
            <li>
              Étudiants boursiers
              <p className="fr-mb-2w">
                → Les codes sont envoyés par e-mail entre mi-octobre et mi-novembre.
              </p>
            </li>
          </ul>

          <p className="fr-mb-2w">
            Si vous n&apos;avez rien reçu (y compris dans vos courriers indésirables), vous pouvez
            vérifier votre droit au pass Sport grâce à ce test rapide :{' '}
            <Link
              href="/v2/test-eligibilite-base"
              className="fr-link"
              title={"Aller vers le test d'éligibilité"}
            >
              tester mon éligibilité
            </Link>
            .
          </p>

          <p className="fr-mb-2w">
            Si le test confirme votre éligibilité, vous pouvez le récupérer en ligne sur le site du
            pass Sport :{' '}
            <Link
              href="/v2/test-eligibilite"
              className="fr-link"
              title={"Aller vers le formulaire d'obtention du pass Sport"}
            >
              récupérer mon pass Sport
            </Link>
            .
          </p>
        </article>
      </Accordion>
      <Accordion
        label="Je n'arrive pas à récupérer mon pass Sport en ligne"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Faites ce test rapide pour vérifier si vous avez droit au pass Sport :{' '}
            <Link
              href="/v2/test-eligibilite-base"
              className="fr-link"
              title={"Aller vers le test d'éligibilité"}
            >
              tester mon éligibilité
            </Link>
            .
          </p>

          <p className="fr-mb-2w">
            Si le test confirme que vous êtes éligible au pass Sport, vous pouvez le récupérer
            directement sur le site :{' '}
            <Link
              href="/v2/test-eligibilite"
              className="fr-link"
              title={"Aller vers le formulaire d'obtention du pass Sport"}
            >
              récupérer mon pass Sport
            </Link>
            .
          </p>

          <p className="fr-mb-2w">
            Si vous rencontrez encore des difficultés dans l&apos;obtention du pass Sport,
            l&apos;équipe support vous aidera à obtenir votre pass Sport :{' '}
            <Link
              className="fr-link"
              href={`/v2/une-question?${FAQ_PAGE_QUERY_PARAMS.displayType}=${DISPLAY_TYPE.BENEF}&${CONTACT_PAGE_QUERYPARAMS.modalOpened}=1`}
              title="Ouvrir le formulaire de contact"
            >
              Nous contacter par email
            </Link>
            .
          </p>
        </article>
      </Accordion>
      <Accordion
        label="Mon code pass Sport ne fonctionne pas. Que faire ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">Pour rappel, le bon format du code est : 25-XXXX-XXXX</p>
          <p className="fr-mb-2w">
            Si votre code ne fonctionne pas, voici plusieurs raisons possibles :
          </p>
          <ul className="fr-ml-2w">
            <li>
              Votre club a peut être déjà saisi votre code une fois. Nous vous invitons à lui
              demander de vérifier que votre code n&apos;est pas déjà enregistré dans la base.
            </li>
            <li>
              Vous l&apos;avez déjà utilisé dans un autre club. Le code est valable pour une seule
              inscription.
            </li>
            <li>
              Il peut s&apos;agir d&apos;une erreur de saisie. Le code alphanumérique doit être
              saisi en majuscule, en conservant les tirets et sans ajouter d&apos;espace.
            </li>
          </ul>
        </article>
      </Accordion>
      <Accordion
        label="Je dois payer mon inscription, mais je n'ai pas encore mon code. Que faire ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">Vous pouvez proposer cette solution à votre club :</p>
          <ul className="fr-ml-2w">
            <li>
              Régler l&apos;inscription{' '}
              <span className="fr-text--bold">avec la déduction immédiate de 70 €</span> ;
            </li>
            <li>
              Fournir un chèque de 70 € (non encaissé), restitué dès réception du code pass Sport.
            </li>
          </ul>

          <p className="fr-mb-2w">
            Si vous n&apos;êtes finalement <span className="fr-text--bold">pas éligible</span>, le
            club pourra <span className="fr-text--bold">encaisser le chèque</span>.
          </p>
          <p className="fr-text--bold">
            Chaque club reste libre d&apos;accepter ou non cette solution.
          </p>
        </article>
      </Accordion>
      <Accordion
        label="Que faire si mon club refuse d'accepter mon pass Sport ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Votre club n&apos;est pas obligé d&apos;adhérer au dispositif.{' '}
          </p>
          <p className="fr-mb-2w">
            Votre code peut être utilisé dans plus de 85 000 autres clubs et salles de sport à
            travers toute la France. Vous pouvez consulter ici{' '}
            <Link
              className="fr-link"
              href="/v2/trouver-un-club"
              title="Aller vers la liste et cartographie des clubs"
            >
              une liste indicative des établissements
            </Link>
            .
          </p>
          <p>
            Si une structure qui vous intéresse ne figure pas sur cette liste, il est possible
            qu&apos;elle soit partenaire mais non référencée. N&apos;hésitez pas à vérifier
            directement auprès d&apos;elle.
          </p>
        </article>
      </Accordion>
    </>
  );
}
