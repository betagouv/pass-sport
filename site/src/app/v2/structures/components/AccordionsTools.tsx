'use client';
import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

export function AccordionsTools() {
  return (
    <>
      <Accordion
        label="Outils pour les structures affiliées à l’une des fédérations sportives agréées par le ministère chargé des Sports"
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
            <DownloadLink
              details="PDF ~ 252 kB"
              label="Télécharger la notice pass Sport 2025"
              href="/assets/partenaires/notice-pass-sport-2025.pdf"
            />
          </li>
        </ul>
      </Accordion>

      <Accordion
        label="Outils pour les associations ayant un agrément Sport ou Jeunesse Education Populaire et proposant une activité sportive tout au long de l'année"
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
              Consulter le tutoriel pour les structures Loisirs Sportifs Marchands
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
