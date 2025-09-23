'use client';
import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

export function AccordionsTools() {
  return (
    <>
      <Accordion
        label="Outils pour les structures affiliées à l’une des fédérations sportives agréés par le ministère chargé des Sports"
        onExpandedChange={() => {}}
      >
        <ul className="fr-pl-4w">
          <li className="fr-mb-2w">
            <Link
              href="https://view.genially.com/68ca5c87e161eb800feb72cf/guide-clubs-affiliees-a-une-fede-agreee-ministere-charge-des-sports"
              target="_blank"
              className="fr-link"
              title="Consulter le tutoriel pour les structures affiliées - Nouvelle fenêtre"
            >
              Consulter le tutoriel pour les structures affiliées
            </Link>
          </li>
          <li className="fr-mb-2w">
            <Link
              href="https://www.sports.gouv.fr/les-118-federations-sportives-et-22-groupements-nationaux-530"
              className="fr-link"
              target="_blank"
              title="Consulter la liste des fédérations sportives agréées par le Ministère chargé des Sports - Nouvelle fenêtre"
            >
              Consulter la liste des fédérations sportives agréées par le Ministère chargé des
              Sports
            </Link>
          </li>
          <li className="fr-mb-2w">
            <DownloadLink
              details="PDF ~ 252 kB"
              label="Télécharger la notice pass Sport 2025"
              href="/assets/partenaires/notice-pass-sport-2025.pdf"
            />
          </li>
        </ul>
      </Accordion>

      <Accordion
        label="Outils pour les structures agrées Sport ou Jeunesse Éducation Populaire qui proposent une activité physique et sportive tout au long de l’année"
        onExpandedChange={() => {}}
      >
        <ul className="fr-pl-4w">
          <li className="fr-mb-2w">
            <Link
              href="https://view.genially.com/68c96700f88999c4be85cef4/guide-assos-avec-un-agrement-jep-ou-sport"
              className="fr-link"
              target="_blank"
              title="Consulter le tutoriel pour les structures agrémentées - Nouvelle fenêtre"
            >
              Consulter le tutoriel pour les structures agrémentées
            </Link>
          </li>
          <li className="fr-mb-2w">
            <Link
              href="https://www.associations.gouv.fr/la-procedure-de-demande-dagrement-jep"
              className="fr-link"
              target="_blank"
              title="Consulter la procédure d’agrément sur associations.gouv.fr - Nouvelle fenêtre"
            >
              Consulter la procédure d’agrément sur associations.gouv.fr
            </Link>
          </li>
          <li className="fr-mb-2w">
            <DownloadLink
              details="PDF ~ 252 kB"
              label="Télécharger la notice pass Sport 2025"
              href="/assets/partenaires/notice-pass-sport-2025.pdf"
            />
          </li>
        </ul>
      </Accordion>
      <Accordion
        label="Outils pour les structures à but lucratif du secteur Loisirs Sportifs Marchands"
        onExpandedChange={() => {}}
      >
        <ul className="fr-pl-4w">
          <li className="fr-mb-2w">
            <Link
              href="https://view.genially.com/68a832edc26eae6fb0633be1/guide-loisirs-sportifs-marchands-lsm"
              target="_blank"
              className="fr-link"
              title="Consulter le tutoriel pour les structures Loisir Sportif Marchand - Nouvelle fenêtre"
            >
              Consulter le tutoriel pour les structures Loisir Sportif Marchand
            </Link>
          </li>

          <li>
            <DownloadLink
              details="PDF ~ 252 kB"
              label="Télécharger la charte d’engagement 2025"
              href="/assets/partenaires/charte-lsm-2025.pdf"
            />
          </li>
          <li>
            <DownloadLink
              details="PDF ~ 252 kB"
              label="Télécharger la notice pass Sport 2025 dédiée aux Loisirs Sportifs Marchands"
              href="/assets/partenaires/notice-lsm-2025.pdf"
            />
          </li>
        </ul>
      </Accordion>
    </>
  );
}
