'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

export default function AccordionsSocialMediasVisuals() {
  return (
    <>
      <Accordion label="Réseaux sociaux" onExpandedChange={() => {}} titleAs="h3">
        <p className="fr-text--lg">
          Téléchargez les visuels et vidéos pour les ajouter sur vos réseaux.
        </p>

        <p className="fr-text--bold fr-text--lg fr-mb-0">Visuels :</p>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel-club-1.jpg"
              label="Télécharger le visuel club - 1"
              details="jpg ~ 258.0 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel-club-2.jpg"
              label="Télécharger le visuel club - 2"
              details="jpg ~ 226.0 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel-club-2.jpg"
              label="Télécharger le visuel club - 3"
              details="jpg ~ 230.0 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel-6-17-ans.jpg"
              label="Télécharger le visuel à la destination des jeunes de 6-17 ans"
              details="jpg ~ 230.0 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel-aeeh.jpg"
              label="Télécharger le visuel à la destination des 6-19 ans bénéficiaires de l'AEEH"
              details="jpg ~ 264.0 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel-aah.jpg"
              label="Télécharger le visuel à la destination des 16-30 ans bénéficiaires de l'AAH"
              details="jpg ~ 255.69 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel-boursiers.jpg"
              label="Télécharger le visuel à la destination des étudiants boursiers"
              details="jpg ~ 231.93 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel-generique.jpg"
              label="Télécharger le visuel générique"
              details="jpg ~ 210.34 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel-pass-sport-reconduit.jpg"
              label="Télécharger le visuel pass Sport reconduit"
              details="jpg ~ 360.41 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/visuel-pass-sport-reconduit-story-banniere.jpg"
              label="Télécharger le visuel pass Sport reconduit - story"
              details="jpg ~ 214.51 kB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/reseaux-sociaux/pass-sport-video-generique.mp4"
              label="Télécharger la vidéo générique"
              details="mp4 ~ 1.28 MB"
            />
          </li>
        </ul>

        <p className="fr-text--bold fr-text--lg fr-mb-0">Whatsapp :</p>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              href="/assets/partenaires/whatsapp/whatsapp-club.jpg"
              label="Télécharger la bannière WhatsApp à destination des clubs"
              details="jpg ~ 258.0 kB"
            />
          </li>
        </ul>
      </Accordion>
    </>
  );
}
