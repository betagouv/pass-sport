'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import cn from 'classnames';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';
import { CAF, CROUS, MSA } from '@/app/v2/accueil/components/acronymes/Acronymes';

export function AccordionsFaq() {
  return (
    <>
      <Accordion
        label="Un jeune n’a pas encore reçu son code pass Sport. Que faire ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">Deux cas peuvent se présenter :</p>
          <ol>
            <li>
              <span className="fr-text--bold">Si vous avez déjà encaissé le règlement</span>, vous
              pourrez rembourser 50 € à la famille sur présentation du code pass Sport.
            </li>

            <li>
              <span className="fr-text--bold">
                Si vous n&apos;avez pas encore encaissé le règlement
              </span>
              , vous pouvez proposer ce mode de régularisation :{' '}
              <ul>
                <li>Paiement de l&apos;inscription avec la déduction immédiate de 50 € ;</li>
                <li>
                  Dépôt d&apos;un chèque de caution de 50 € qui ne sera pas encaissé et que vous
                  restituerez dès réception du code pass Sport.
                </li>
              </ul>
            </li>
          </ol>
        </article>
      </Accordion>
      <Accordion
        label="Quelles structures sportives peuvent accepter le pass Sport ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Pour devenir partenaire du dispositif pass Sport, votre structure doit remplir au moins
            l&apos;une des trois conditions suivantes :
          </p>
          <ol className="fr-pl-4w fr-list fr-mb-2w">
            <li>
              Affiliation : vous devez être affilié pour la saison 2026-2027 à l&apos;une des
              fédérations sportives agréées par le ministère chargé des Sports, de la Jeunesse et de
              la Vie associative (à l&apos;exclusion des fédérations scolaires).
              <DownloadLink
                details="PDF ~ 455 kB"
                label="Télécharger le tableau des fédérations sportives agréées"
                href="/assets/partenaires/tableau-federations.pdf"
              />
            </li>
            <li>
              Agrément : votre structure doit disposer d’un agrément Sport (délivré après 2016) ou
              Jeunesse Éducation Populaire – JEP (délivré après 2021) ET proposer une activité
              physique et sportive tout au long de l&apos;année.
            </li>
            <li>
              Loisir sportif marchand : si vous êtes une structure à but lucratif du loisir sportif
              marchand, vous devez signer la charte d’engagement du ministère des Sports, de la
              Jeunesse et de la Vie associative et relever d&apos;un des codes NAF suivants :
              <ul>
                <li>9311Z : gestion d&apos;installations sportives ;</li>
                <li>9312Z : activités des clubs de sports ;</li>
                <li>9329Z : autres activités récréatives et de loisirs ;</li>
                <li>9313Z : activités des centres de culture physique ;</li>
                <li>
                  8551Z : enseignement de disciplines sportives et d&apos;activités de loisirs ;
                </li>
                <li>6420Z : activités des sociétés holding.</li>
              </ul>
              {/* todo: to update*/}
              <DownloadLink
                details="PDF ~ 121 kB"
                label="Télécharger la charte d'engagement 2026"
                href="/assets/partenaires/charte-lsm-2026.pdf"
              />
            </li>
          </ol>

          <p className="fr-mb-2w">
            Si vous ne remplissez pas l&apos;une de ces trois conditions, le dispositif ne vous est
            pas ouvert. Le justificatif d’éligibilité (attestation d&apos;affiliation ou agrément ou
            charte d’engagement) seront vérifiés. En cas de non-éligibilité, les pass Sport saisis
            ne vous seront pas remboursés.
          </p>

          <p>Pour rappel, vous devez enregistrer les codes pass Sport avant le 31 décembre 2026.</p>
        </article>
      </Accordion>
      {/*<Accordion*/}
      {/*  label="Enregistrement des pass Sport sur Le Compte Asso"*/}
      {/*  onExpandedChange={() => {}}*/}
      {/*>*/}
      {/*  <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>*/}
      {/*    <p className="fr-mb-0">*/}
      {/*      L&apos;enregistrement des codes pass Sport sera ouvert à partir du XX septembre 2026.*/}
      {/*    </p>*/}
      {/*  </article>*/}
      {/*</Accordion>*/}
      <Accordion label="Qui sont les bénéficiaires du pass Sport ?" onExpandedChange={() => {}}>
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-0">
            Pour la saison 2026-2027, le dispositif est ouvert aux jeunes remplissant les conditions
            suivantes :
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
                  Bourse du <CROUS />
                  {'  '} (y compris l&apos;aide annuelle) ;
                </li>
                <li>Bourse régionale pour une formation sanitaire et sociale.</li>
              </ul>
            </li>
          </ul>
        </article>
      </Accordion>
    </>
  );
}
