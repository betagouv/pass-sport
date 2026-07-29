'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import cn from 'classnames';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';
import { AAH, AEEH, ARS, CROUS } from '@/app/v2/accueil/components/acronymes/Acronymes';

// old
// export function AccordionsFaq() {
//   return (
//     <>
//       <Accordion label="Quel est le format du pass Sport cette année ?" onExpandedChange={() => {}}>
//         <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
//           <p className="fr-mb-2w">
//             Pour appliquer la réduction de 70€, le bénéficiaire doit vous fournir le pass Sport
//             qu&apos;il a reçu par e-mail ou via démarches-simplifiées.
//           </p>
//           <p className="fr-mb-2w">
//             Le code alphanumérique commençant par 25 est à enregistrer sur votre Compte Asso.
//           </p>
//           <p className="fr-mb-4w">
//             Le pass Sport peut se présenter sous la forme du code seul OU du modèle ci-dessous :
//           </p>
//           <Image
//             src={code}
//             className={cn('fr-responsive-img', styles['activate-code-section__image'])}
//             alt="Modèle pass Sport 2026"
//           />
//         </article>
//       </Accordion>
//       <Accordion
//         label="Comment s'assurer que le pass Sport est valide ?"
//         onExpandedChange={() => {}}
//       >
//         <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
//           <p className="fr-mb-2w">
//             Lors de la saisie du code, le nom du jeune bénéficiaire s&apos;affiche. Vous devez
//             vérifier qu&apos;il s&apos;agit bien de votre adhérent et non d&apos;une autre personne
//             (comme un membre de la fratrie). Le pass Sport est une aide individuelle, non
//             transférable.
//           </p>
//
//           <p className="fr-mb-2w">
//             Si un message affiche que le code n&apos;existe pas, il s&apos;agit probablement
//             d&apos;une erreur de saisie ou d&apos;un faux pass. Demandez au bénéficiaire de vous le
//             redonner.
//           </p>
//
//           <div className="text-align--center fr-my-1w">
//             <Image
//               src="/images/structures/pass_sport_not_existing_error.png"
//               width={700}
//               height={72}
//               alt="Message d'erreur: le n° pass Sport saisi n'existe pas. Veuillez SVP vérifier le n° et corriger la saisie"
//             />
//           </div>
//
//           <p className="fr-mb-2w">
//             Si un message affiche que le bénéficiaire est déjà inscrit, deux situations sont
//             possibles :
//           </p>
//           <ul className="fr-ml-2w">
//             <li>Soit le code a déjà été enregistré sur votre Compte Asso. Pensez à vérifier.</li>
//             <li>Soit le code a déjà été saisi par une autre structure.</li>
//           </ul>
//
//           <p>Le code ne peut en effet être utilisé qu’une seule fois dans Le Compte Asso.</p>
//
//           <div className="text-align--center fr-my-1w">
//             <Image
//               src="/images/structures/pass_sport_can_only_be_used_once_error_message.png"
//               width={700}
//               height={72}
//               alt="Message d'erreur : ce bénéficiaire est déjà inscrit au sein de la même structure ou d'une autre structure. Il ne peut pas être inscrit deux fois."
//             />
//           </div>
//         </article>
//       </Accordion>
//       <Accordion
//         label="Comment obtenir le remboursement des pass Sport ?"
//         onExpandedChange={() => {}}
//       >
//         <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
//           <p className="fr-mb-2w">
//             Pour obtenir le remboursement des pass Sport, suivez ces étapes :
//           </p>
//           <ol className="fr-ml-2w">
//             <li>
//               Saisie du pass Sport : sur{' '}
//               <Link
//                 className="fr-link"
//                 href="https://lecompteasso.associations.gouv.fr"
//                 target="_blank"
//                 title="Le Compte Asso - Nouvelle fenêtre"
//               >
//                 Le Compte Asso
//               </Link>{' '}
//               saisissez le pass Sport de votre adhérent entre le 1er septembre et le 31 décembre
//               2026.
//             </li>
//             <li>
//               Ouverture du dossier de remboursement : au premier pass Sport saisi, un dossier de
//               remboursement est ouvert pour votre structure.
//             </li>
//             <li>
//               Vérification des justificatifs : le service instructeur vérifiera votre justificatif
//               d’éligibilité (attestation d’affiliation ou agrément ou charte d&apos;engagement) et
//               votre RIB.
//             </li>
//             <li>
//               Virement bancaire : votre structure sera remboursée par virement bancaire de l’Agence
//               de Services et de Paiement (ASP), tiers payeur de l&apos;État.
//             </li>
//           </ol>
//         </article>
//       </Accordion>
//       <Accordion
//         label="Un jeune n’a pas encore reçu son code pass Sport. Que faire ?"
//         onExpandedChange={() => {}}
//       >
//         <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
//           <p className="fr-mb-2w">
//             Si un jeune n&apos;a pas encore reçu son code pass Sport vous pouvez, si vous le
//             souhaitez, proposer la solution suivante :
//           </p>
//           <ul className="fr-ml-2w">
//             <li>Inscrire le jeune en appliquant immédiatement la réduction de 70€ ;</li>
//             <li>
//               Demander au jeune (ou à sa famille) un chèque de caution de 70€, qui leur sera
//               restitué dès réception du code pass Sport.
//             </li>
//           </ul>
//           <p className="fr-mb-2w">
//             Si le jeune n&apos;est finalement pas éligible, vous êtes en droit d&apos;encaisser le
//             chèque.
//           </p>
//         </article>
//       </Accordion>
//       <Accordion
//         label="Comment ajouter un bénéficiaire sur le Compte Asso ?"
//         onExpandedChange={() => {}}
//       >
//         <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
//           <p className="fr-mb-2w">
//             Si le bénéficiaire vous a présenté son code alphanumérique (25-XXXX-XXXX) et que votre
//             structure a accordé une déduction immédiate de 70€ sur l&apos;inscription :
//           </p>
//
//           <ul className="fr-ml-2w">
//             <li>
//               Vous devez avoir un compte sur{' '}
//               <Link
//                 className="fr-link"
//                 href="https://lecompteasso.associations.gouv.fr"
//                 target="_blank"
//                 title="Le Compte Asso - Nouvelle fenêtre"
//               >
//                 Le compte Asso (LCA)
//               </Link>
//               . Si vous en avez déjà un, il vous suffit de le mettre à jour. Cela vous permettra
//               d&apos;apparaître sur la cartographie en ligne sur le site.
//             </li>
//             <li>
//               Veuillez ensuite compléter votre profil en téléversant votre justificatif
//               d&apos;éligibilité au dispositif (un des trois suivants) dans la rubrique
//               &ldquo;affiliations et adhérents personnes morales&rdquo; :
//               <ul className="fr-ml-2w">
//                 <li>
//                   Association : attestation d&apos;affiliation à une fédération sportive agréée par
//                   le ministère chargé des Sports ;
//                 </li>
//                 <li>Association : agrément JEP ou Sport valide ;</li>
//                 <li>
//                   Structures à but lucratif (Loisirs Sportifs Marchands) : charte d&apos;engagement
//                   2026.
//                 </li>
//               </ul>
//             </li>
//           </ul>
//
//           <p className="fr-mb-2w">
//             Pour obtenir de l&apos;aide, vous pouvez également contacter votre Délégation Régionale
//             Académique à la Jeunesse, à l’Engagement et aux Sports (DRAJES) ou nous{' '}
//             <Link
//               className="fr-link"
//               href={`/v2/une-question?${FAQ_PAGE_QUERY_PARAMS.displayType}=pro&${CONTACT_PAGE_QUERYPARAMS.modalOpened}=1`}
//               title="Ouvrir le formulaire de contact"
//             >
//               contacter via le formulaire
//             </Link>
//             .
//           </p>
//
//           <p className="fr-mb-2w">Comment ajouter un nouveau bénéficiaire ?</p>
//           <p className="fr-mb-2w">
//             Allez dans la rubrique{' '}
//             <span className="fr-text--bold">&ldquo;Gérer les inscriptions pass Sport&rdquo;</span>{' '}
//             (voir copie d&apos;écran ci-jointe). Vous devez impérativement saisir tous les codes
//             avant le 31 décembre 2026.
//           </p>
//
//           <div className="text-align--center fr-my-1w">
//             <Image
//               src="/images/structures/lca_gerer_les_pass_sports.png"
//               width={700}
//               height={155}
//               alt="Gérer les pass Sport"
//             />
//           </div>
//
//           <div className="text-align--center fr-my-1w">
//             <Image
//               src="/images/structures/lca_ajouter_benef.png"
//               width={700}
//               height={271}
//               alt="Ajouter un bénéficiaire sur Le Compte Asso"
//             />
//           </div>
//         </article>
//       </Accordion>
//     </>
//   );
// }

export function AccordionsFaq() {
  return (
    <>
      <Accordion
        label="Inscriptions avant septembre : comment procéder ?"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Si vous procédez aux inscriptions avant le 1er septembre, plusieurs cas peuvent se
            présenter :
          </p>

          <ol>
            <li>
              <span className="fr-text--bold">Si vous avez déjà encaissé le règlement :</span> à
              partir du 1er septembre, vous pourrez rembourser 50 € à la famille sur présentation du
              code pass Sport.
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
                  restituerez dès réception du code pass Sport (à partir du 1er septembre).
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
                details="PDF ~ 466 kB"
                label="Télécharger le tableau des fédérations sportives agréées"
                href="/assets/partenaires/tableau-des-119-f-d-rations-sportives-et-22-groupements-nationaux-5951.pdf"
              />
            </li>
            <li>
              Agrément : votre structure doit disposer d’un agrément Sport (délivré après 2016) ou
              Jeunesse Éducation Populaire – JEP (délivré après 2021) ET proposer une activité
              physique et sportive tout au long de l&apos;année.
            </li>
            <li>
              Loisir sportif marchand : si vous êtes une structure à but lucratif du loisir sportif
              marchand, vous devez signer la charte d’engagement du ministère chargé des Sports et
              relever d&apos;un des codes NAF suivants :
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
                details="PDF ~ 163 kB"
                label="Télécharger la charte d'engagement 2025"
                href="/assets/partenaires/charte-lsm-2025.pdf"
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
      <Accordion
        label="Enregistrement des pass Sport sur Le Compte Asso"
        onExpandedChange={() => {}}
      >
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-0">
            L&apos;enregistrement des codes pass Sport sera ouvert à partir du 1er septembre.
          </p>
        </article>
      </Accordion>
      <Accordion label="Qui sont les bénéficiaires du pass Sport ?" onExpandedChange={() => {}}>
        <article className={cn('fr-px-6w fr-py-2w background-contrast--grey')}>
          <p className="fr-mb-2w">
            Pour la saison 2026-2027, le dispositif est ouvert aux jeunes remplissant les conditions
            suivantes :
          </p>

          <ul className="fr-pl-0">
            <li>
              Jeunes de 12 à 17 ans révolus bénéficiaires de l&apos;
              <ARS /> (Allocation de rentrée scolaire) ;
            </li>
            <li>
              Jeunes en situation de handicap :
              <ul>
                <li>
                  de 6 à 19 ans révolus bénéficiaires de l&apos; <AEEH /> (Allocation d’éducation de
                  l’enfant handicapé) ;
                </li>
                <li>
                  de 16 à 30 ans révolus bénéficiaires de l&apos;
                  <AAH /> (Allocation aux adultes handicapés).
                </li>
              </ul>
            </li>
            <li>
              Boursiers au plus de 28 ans révolus, titulaires d’une bourse attribuée avant le 15
              octobre 2026 :
              <ul>
                <li>
                  bourse du <CROUS /> (y compris l’aide annuelle) ;
                </li>
                <li>bourse régionale pour une formation sanitaire et sociale.</li>
              </ul>
            </li>
          </ul>
        </article>
      </Accordion>
    </>
  );
}
