'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

export default function AccordionsSocialMediasVisuals() {
  return (
    <>
      <Accordion label="Pour les réseaux sociaux" onExpandedChange={() => {}} titleAs="h3">
        <p className="fr-text--bold fr-text--lg fr-mb-0">Visuels (format publication) :</p>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              label="Télécharger la vidéo de présentation 50 secondes"
              details="MP4 ~ 99.1 MB"
              href="/assets/partenaires/videos/video-presentation-50-secondes.mp4"
            />
          </li>
          <li>
            <DownloadLink
              label="Télécharger la vidéo de présentation 30 secondes"
              details="MP4 ~ 2.5 MB"
              href="/assets/partenaires/videos/video-presentation-30-secondes.mp4"
            />
          </li>
          <li>
            <DownloadLink
              label="Télécharger la vidéo à destination des salles de sport"
              details="MP4 ~ 30.5 MB"
              href="/assets/partenaires/videos/video-salles-de-sport.mp4"
            />
          </li>
          <li>
            <DownloadLink
              label="Télécharger la vidéo à destination des étudiants boursiers"
              details="MP4 ~ 2.7 MB"
              href="/assets/partenaires/videos/video-etudiants-boursiers.mp4"
            />
          </li>
          <li>
            <DownloadLink
              label="Télécharger la vidéo à destination des 14-17 ans bénéficiaires de l’ARS"
              details="MP4 ~ 29.7 MB"
              href="/assets/partenaires/videos/video-14-17-ans-ars.mp4"
            />
          </li>
          <li>
            <DownloadLink
              label="Télécharger la vidéo à destination des 6-30 ans en situation de handicap"
              details="MP4 ~ 38.1 MB"
              href="/assets/partenaires/videos/video-aah.mp4"
            />
          </li>
        </ul>
        <p className="fr-text--bold fr-text--lg fr-mb-0">
          Vidéos de présentation du pass Sport standard (format story ou reel) :
        </p>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              label="Télécharger la vidéo de présentation standard"
              details="MP4 ~ 2.4 MB"
              href="/assets/partenaires/videos/video-presentation-standard.mp4"
            />
          </li>
        </ul>

        <p className="fr-text--bold fr-text--lg fr-mb-0">
          Texte prêt à l&apos;emploi pour accompagner les visuels et vidéos :
        </p>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              details="PDF ~ 145 KB"
              label={"Télécharger le texte prêt à l'emploi pour les réseaux sociaux"}
              href="/assets/partenaires/publications-pretes-a-l-emploi-pour-accompagner-les-visuels-pass-sport.pdf"
            />
          </li>
        </ul>
      </Accordion>
    </>
  );
}
