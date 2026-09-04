'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import AccordionsSocialMediasVisuals from '@/app/v2/structures/components/AccordionsSocialMediasVisuals';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

export function AccordionsKitCommunication() {
  return (
    <>
      <AccordionsSocialMediasVisuals />

      <Accordion label="Vidéos" onExpandedChange={() => {}} titleAs="h3">
        <p className="fr-text--bold fr-text--lg fr-mb-0">Vidéos de présentation du pass Sport :</p>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              label="Télécharger la vidéo de présentation destiné aux personnes en situation de handicap"
              details="MP4 ~ 45.2 MB"
              href="/assets/partenaires/videos/capsule-handicap.mp4"
            />
          </li>
          <li>
            <DownloadLink
              label="Télécharger la vidéo de présentation destiné aux étudiants boursiers"
              details="MP4 ~ 56.9 MB"
              href="/assets/partenaires/videos/capsule-boursiers.mp4"
            />
          </li>
          <li>
            <DownloadLink
              label="Télécharger la vidéo de présentation destiné aux salles de sport"
              details="MP4 ~ 35.7 MB"
              href="/assets/partenaires/videos/capsule-salles-de-sport.mp4"
            />
          </li>
        </ul>

        <p className="fr-text--bold fr-text--lg fr-mb-0">Vidéos animées 16/9 et 9/16 :</p>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              label="Télécharger la vidéo animée 16/9"
              details="mp4 ~ 34.84 kB"
              href="/assets/partenaires/videos/video-anime-16-9.mp4"
            />
          </li>
          <li>
            <DownloadLink
              label="Télécharger la vidéo animée 9/16"
              details="mp4 ~ 34.81 kB"
              href="/assets/partenaires/videos/video-anime-9-16.mp4"
            />
          </li>
        </ul>
      </Accordion>

      <Accordion label="Affiches" titleAs="h3">
        <p className="fr-text--bold fr-text--lg fr-mb-0">Affichage et impression :</p>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              href="/assets/partenaires/affiches/affiche-clubs.pdf"
              label="Télécharger l'affiche à destination des clubs - A3"
              details="PDF ~ 96.0 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/affiches/affiche-generique.pdf"
              label="Télécharger l'affiche générique - A3"
              details="PDF ~ 86.0 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/affiches/affiche-situation-handicap.pdf"
              label="Télécharger l'affiche à destination des personnes en situation de handicap - A3"
              details="PDF ~ 92.0 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/affiches/affiche-boursiers.pdf"
              label="Télécharger l'affiche à destination des boursiers - A3"
              details="PDF ~ 90.0 kB"
            />
          </li>
        </ul>
      </Accordion>

      <Accordion label="Texte prêt à l'emploi" onExpandedChange={() => {}} titleAs="h3">
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              label="Télécharger le texte prêt à l'emploi pour accompagner les visuels et vidéos"
              details="docx ~ 27.0 kB"
              href="/assets/partenaires/reseaux-sociaux/texte-pret-a-l-emploi-accompagnement-visuels-et-video.docx"
            />
          </li>
        </ul>
      </Accordion>
    </>
  );
}
