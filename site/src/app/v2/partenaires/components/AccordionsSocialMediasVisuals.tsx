'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

export default function AccordionsSocialMediasVisuals() {
  return (
    <>
      <h2 className="fr-mb-2w fr-h6">Réseaux sociaux</h2>

      <Accordion label="Visuels (format publication)" onExpandedChange={() => {}}>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel_pour_communiquer_aupres_des_jeunes.jpg"
              label="Télécharger le visuel à destination des jeunes"
              details="jpg ~ 258 KB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel_pour_communiquer_aupres_des_parents.jpg"
              label="Télécharger le visuel à destination des parents"
              details="jpg ~ 265 KB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel_pour_communiquer_aupres_des_etudiants_boursiers.jpg"
              label="Télécharger le visuel à destination des étudiants boursiers"
              details="jpg ~ 226 KB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel_pour_communiquer_aupres_des_jeunes.jpg"
              label="Télécharger le visuel à destination des 14-17 ans bénéficiaires de l'ARS"
              details="jpg ~ 260 KB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel_pour_les_beneficiaires_aah.jpg"
              label="Télécharger le visuel à destination des 16-30 ans en situation de handicap"
              details="jpg ~ 249 KB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel_pour_les_parents_de_beneficiaires_aeeh.jpg"
              label="Télécharger le visuel à destination des 6-19 ans en situation de handicap"
              details="jpg ~ 264 KB"
            />
          </li>
        </ul>
      </Accordion>

      <Accordion label="Vidéos de présentation du pass Sport" onExpandedChange={() => {}}>
        <p className="fr-text--bold fr-text--lg">
          Vidéos de présentation du pass Sport avec athlètes (format story ou reel) :
        </p>

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

        <p className="fr-text--bold fr-text--lg">
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
      </Accordion>

      <Accordion
        label="Texte prêt à l’emploi pour accompagner les visuels et vidéos"
        onExpandedChange={() => {}}
      >
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              details="PDF ~ 145 KB"
              label="Télécharger le texte prêt à l'emploi pour les réseaux sociaux"
              href="/assets/partenaires/publications-pretes-a-l-emploi-pour-accompagner-les-visuels-pass-sport.pdf"
            />
          </li>
        </ul>
      </Accordion>
    </>
  );
}
