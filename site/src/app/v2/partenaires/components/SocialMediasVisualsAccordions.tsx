'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';

export default function SocialMediasVisualsAccordions() {
  return (
    <>
      <h2 className="fr-mb-2w">Outils digitaux</h2>

      <p className="fr-mb-2w text--italic">
        Logos et visuels pour communiquer sur les réseaux sociaux auprès de vos différents publics
      </p>

      <Accordion label="Logos" expanded={false} onExpandedChange={() => {}}>
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/logos/charte_utilisation_des_logos_pass_sport.pdf"
              className="fr-link"
              target="_blank"
            >
              Charte d’utilisation
            </Link>
          </li>
          <li>
            <Link
              href="/assets/partenaires/logos/logo_bleu_principal.png"
              className="fr-link"
              target="_blank"
            >
              Logo bleu (principal)
            </Link>
          </li>
          <li>
            <Link
              href="/assets/partenaires/logos/logo_blanc_secondaire.png"
              className="fr-link"
              target="_blank"
            >
              Logo blanc (secondaire)
            </Link>
          </li>
        </ul>
      </Accordion>

      <Accordion label="Visuels" expanded={false} onExpandedChange={() => {}}>
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/reseaux-sociaux/structures_sportives_visuel_pour_communiquer_aupres_des_jeunes.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication des structures sportives en direction des jeunes
            </Link>
          </li>
          <li>
            <Link
              href="/assets/partenaires/reseaux-sociaux/structures_sportives_visuel_pour_communiquer_aupres_des_parents.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication des structures sportives en direction des parents
            </Link>
          </li>
          <li>
            <Link
              href="/assets/partenaires/reseaux-sociaux/visuel_pour_communiquer_aupres_des_jeunes.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication pour les jeunes
            </Link>
          </li>
          <li>
            <Link
              href="/assets/partenaires/reseaux-sociaux/visuel_pour_communiquer_aupres_des_parents.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication générique pour les parents
            </Link>
          </li>
          <li>
            <Link
              href="/assets/partenaires/reseaux-sociaux/visuel_pour_communiquer_aupres_des_etudiants_boursiers.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication pour les étudiants boursiers
            </Link>
          </li>
          <li>
            <Link
              href="/assets/partenaires/reseaux-sociaux/visuel_pour les beneficiaires_aah.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication pour les bénéficiaires de l’AAH
            </Link>
          </li>
          <li>
            <Link
              href="/assets/partenaires/reseaux-sociaux/visuel_pour_les_parents_de_beneficiaires_aeeh.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication pour les parents des bénéficiaires de l’AEEH
            </Link>
          </li>
        </ul>
      </Accordion>
    </>
  );
}
