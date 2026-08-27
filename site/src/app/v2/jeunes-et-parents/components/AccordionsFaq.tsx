'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import cn from 'classnames';
import Link from 'next/link';
import { CAF, CROUS, MSA } from '@/app/v2/accueil/components/acronymes/Acronymes';

export function AccordionsFaq() {
  return (
    <>
      <Accordion label="Où utiliser mon pass Sport ?" onExpandedChange={() => {}}>
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Le pass Sport peut être utilisé dans plus de 85 000 clubs et salles de sport partout en
            France. Vous pouvez consulter une{' '}
            <Link
              target="_blank"
              className="fr-link"
              title="Liste indicative des établissements - nouvelle fenêtre"
              href="/v2/trouver-un-club"
            >
              liste indicative des établissements.
            </Link>
          </p>

          <p className="fr-mb-2w">
            Si la structure qui vous intéresse ne figure pas dans la liste indicative, il est
            possible qu&apos;elle soit partenaire mais non référencée. Dans ce cas, veuillez
            contacter la structure choisie pour vérifier si elle accepte le pass Sport.
          </p>

          <p className="fr-mb-2w">
            Si vous êtes en situation de handicap, vous pouvez vous rendre sur les sites suivants et
            contacter directement les clubs pour savoir s&apos;ils acceptent le pass Sport :
          </p>

          <ul className="fr-pl-4w">
            <li>
              <Link className="fr-link" href="https://www.handisport.org" target="_blank">
                https://www.handisport.org
              </Link>{' '}
              : handicap physique, moteur, sensoriel
            </li>
            <li>
              <Link className="fr-link" href="https://sportadapte.fr" target="_blank">
                https://sportadapte.fr
              </Link>{' '}
              : handicap cognitif, psychique et/ou neurodéveloppemental
            </li>
            <li>
              <Link
                className="fr-link"
                href="https://www.handiguide.sports.gouv.fr"
                target="_blank"
              >
                https://www.handiguide.sports.gouv.fr
              </Link>{' '}
              : annuaire national du sport accessible
            </li>
            <li>
              <Link
                className="fr-link"
                href="https://trouvetonparasport.france-paralympique.fr"
                target="_blank"
              >
                https://trouvetonparasport.france-paralympique.fr
              </Link>{' '}
              : propose des disciplines qui correspondent le mieux au jeune
            </li>
          </ul>

          <p>Pour rappel, le pass Sport est utilisable jusqu&apos;au 31 décembre 2026.</p>
        </article>
      </Accordion>
      <Accordion
        label="Je suis parent de plusieurs enfants, comment ça fonctionne ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Si plusieurs de vos enfants mineurs sont éligibles au pass Sport, vous recevrez un
            courrier électronique distinct pour chacun d’eux, contenant leur code pass Sport
            l&apos;adresse transmise par les organismes partenaires (<CAF /> ou <MSA />
            ). Chaque code est unique et doit être présenté au club ou à la salle de sport lors de
            l&apos;inscription de l&apos;enfant concerné.
          </p>

          <p className="fr-mb-2w">
            Les étudiants majeurs éligibles recevront également leur code pass Sport par courrier
            électronique, à l&apos;adresse renseignée lors de leur demande de bourse.
          </p>

          <p>Pour rappel, le pass Sport est utilisable jusqu&apos;au 31 décembre 2026.</p>
        </article>
      </Accordion>
      <Accordion
        label="Je suis en situation de handicap. Où puis-je trouver une structure para-accueillante ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-0">Pour trouver une structure ou une discipline adaptée :</p>
          <ul className="fr-pl-4w fr-mb-2w">
            <li>
              <Link
                className="fr-link"
                href="https://www.handiguide.sports.gouv.fr/"
                target="_blank"
              >
                Handiguide
              </Link>{' '}
              : annuaire national du sport accessible
            </li>
            <li>
              <Link
                className="fr-link"
                href="https://trouvetonparasport.france-paralympique.fr/#/"
                target="_blank"
              >
                Trouve ton parasport
              </Link>{' '}
              : propose des disciplines qui correspondent le mieux au jeune
            </li>
          </ul>

          <p className="fr-mb-0">
            Avant l&apos;inscription, il est recommandé de contacter la structure choisie pour
            vérifier :
          </p>

          <ul className="fr-pl-4w fr-mb-2w">
            <li>Qu&apos;elle accepte le pass Sport ;</li>
            <li>
              Qu&apos;elle dispose du matériel et de l&apos;encadrement adaptés à votre handicap
              pour une pratique en toute sécurité.
            </li>
          </ul>

          <p className="fr-mb-0">
            Nous vous conseillons de prendre contact avec les ligues régionales. Elles pourront vous
            renseigner pour trouver votre sport :
          </p>

          <ul className="fr-pl-4w fr-mb-2w">
            <li>
              <Link className="fr-link" href="https://www.handisport.org/" target="_blank">
                Handisport
              </Link>{' '}
              : handicap physique, moteur, sensoriel
            </li>
            <li>
              <Link className="fr-link" href="https://sportadapte.fr/" target="_blank">
                Sport adapté
              </Link>{' '}
              : handicap cognitif, psychique et/ou neurodéveloppemental
            </li>
          </ul>
          <p className="fr-mb-0">
            Pour rappel, le pass Sport est utilisable jusqu&apos;au 31 décembre 2026.
          </p>
        </article>
      </Accordion>
      <Accordion label="Pourquoi n'ai-je plus le droit au pass Sport ?" onExpandedChange={() => {}}>
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            En 2026, les modalités d&apos;éligibilité au pass Sport sont étendues. Sont désormais
            concernés les jeunes de 6 à 17 ans révolus faisant partie d&apos;un foyer allocataire
            dont le quotient familial (<CAF /> ou <MSA />) est inférieur ou égal à 699 €. Si vous
            n&apos;avez plus droit au pass Sport, cela signifie que vous ne remplissez plus les
            critères d&apos;éligibilité, soit parce que vous n&apos;avez plus l&apos;âge pour
            bénéficier de l&apos;aide, soit parce que vous ne remplissez plus les critères sociaux
            permettant de l&apos;obtenir.
          </p>

          <p className="fr-mb-0">
            Rappel, pour la saison 2026-2027, le dispositif est ouvert aux :
          </p>

          <ul className="fr-pl-4w">
            <li>
              Jeunes de 6 à 17 ans révolus faisant partie d&apos;un foyer allocataire dont le
              quotient familial (<CAF /> ou <MSA />) est inférieur ou égal à 699 € ;
            </li>
            <li>
              Jeunes en situation de handicap :
              <ul className="fr-m-0">
                <li>
                  de 6 à 19 ans révolus bénéficiaires de l&apos;AEEH (Allocation d&apos;éducation de
                  l&apos;enfant handicapé) ;
                </li>
                <li>
                  de 16 à 30 ans révolus bénéficiaires de l&apos;AAH (Allocation aux adultes
                  handicapés)
                </li>
              </ul>
            </li>

            <li>
              Étudiants boursiers jusqu&apos;à 28 ans révolus, titulaires d&apos;une bourse
              attribuée avant le 15 octobre 2026 :
              <ul>
                <li>
                  Bourse du <CROUS /> {'  '}(y compris l&apos;aide annuelle) ;
                </li>
                <li>Bourse régionale pour une formation sanitaire et sociale.</li>
              </ul>
            </li>
          </ul>

          <p className="fr-mb-2w">
            D&apos;autres aides peuvent vous être proposées par différentes institutions.
            Renseignez-vous auprès de votre mairie, de votre centre communal d&apos;action social,
            de votre <CAF />, de votre conseil départemental, de votre conseil régional.
          </p>

          <p>
            AEEH = Allocation d&apos;Éducation de l’Enfant Handicapé, AAH = Allocation aux Adultes
            Handicapés
          </p>
        </article>
      </Accordion>
      <Accordion label="Que faire si mon club refuse le pass Sport ?" onExpandedChange={() => {}}>
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">Votre club n&apos;est pas obligé d&apos;adhérer au dispositif.</p>
          <p className="fr-mb-2w">
            Votre code peut être utilisé dans plus de 85 000 autres clubs et salles de sport à
            travers toute la France. Vous pouvez consulter la{' '}
            <Link
              target="_blank"
              className="fr-link"
              title="Liste indicative des établissements - nouvelle fenêtre"
              href="/v2/trouver-un-club"
            >
              liste indicative des établissements
            </Link>
            .
          </p>
          <p className="fr-mb-2w">
            Si une structure qui vous intéresse ne figure pas sur cette liste, il est possible
            qu&apos;elle soit partenaire mais non référencée. N&apos;hésitez pas à vérifier
            directement auprès d&apos;elle.
          </p>
        </article>
      </Accordion>
    </>
  );
}
