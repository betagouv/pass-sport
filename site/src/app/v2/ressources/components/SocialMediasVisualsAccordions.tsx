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
        <ul>
          <li>
            <Link
              href="/assets/ressources/logos/logo-principal.png"
              className="fr-link"
              target="_blank"
            >
              Logo Bleu (principal)
            </Link>
          </li>
          <li>
            <Link
              href="/assets/ressources/logos/logo-secondaire.png"
              className="fr-link"
              target="_blank"
            >
              Logo Blanc (secondaire)
            </Link>
          </li>
          <li>
            <Link
              href="/assets/ressources/logos/logo-charte.pdf"
              className="fr-link"
              target="_blank"
            >
              Charte d’utilisation du logo
            </Link>
          </li>
        </ul>
      </Accordion>

      <Accordion label="Visuels" expanded={false} onExpandedChange={() => {}}>
        <ul></ul>
      </Accordion>

      {/*<Accordion*/}
      {/*  label="Visuel pour communiquer auprès des parents des enfants bénéficiaires de l'AEEH"*/}
      {/*  expanded={false}*/}
      {/*  onExpandedChange={() => {}}*/}
      {/*>*/}
      {/*  <ul>*/}
      {/*    <li>*/}
      {/*      <Link*/}
      {/*        href="/assets/ressources/reseaux-sociaux/aeeh.jpg"*/}
      {/*        className="fr-link"*/}
      {/*        target="_blank"*/}
      {/*      >*/}
      {/*        Vignette pour les AEEH (Allocation d’éducation de l’enfant handicapé)*/}
      {/*      </Link>*/}
      {/*    </li>*/}
      {/*  </ul>*/}
      {/*</Accordion>*/}
      {/*<Accordion*/}
      {/*  label="Visuel pour communiquer auprès des bénéficiaires de l'AAH"*/}
      {/*  expanded={false}*/}
      {/*  onExpandedChange={() => {}}*/}
      {/*>*/}
      {/*  <ul>*/}
      {/*    <li>*/}
      {/*      <Link*/}
      {/*        href="/assets/ressources/reseaux-sociaux/aah.jpg"*/}
      {/*        className="fr-link"*/}
      {/*        target="_blank"*/}
      {/*      >*/}
      {/*        Vignette pour les AAH (Allocation aux adultes handicapés)*/}
      {/*      </Link>*/}
      {/*    </li>*/}
      {/*  </ul>*/}
      {/*</Accordion>*/}
      {/*<Accordion*/}
      {/*  label="Visuel pour communiquer auprès des 14-30 ans"*/}
      {/*  expanded={false}*/}
      {/*  onExpandedChange={() => {}}*/}
      {/*>*/}
      {/*  <ul>*/}
      {/*    <li>*/}
      {/*      <Link*/}
      {/*        href="/assets/ressources/reseaux-sociaux/parents_14ans_et_plus.jpg"*/}
      {/*        className="fr-link"*/}
      {/*        target="_blank"*/}
      {/*      >*/}
      {/*        Vignette pour les 14-30 ans*/}
      {/*      </Link>*/}
      {/*    </li>*/}
      {/*  </ul>*/}
      {/*</Accordion>*/}
      {/*<Accordion*/}
      {/*  label="Visuel pour communiquer auprès des étudiants boursiers"*/}
      {/*  expanded={false}*/}
      {/*  onExpandedChange={() => {}}*/}
      {/*>*/}
      {/*  <ul>*/}
      {/*    <li>*/}
      {/*      <Link*/}
      {/*        href="/assets/ressources/reseaux-sociaux/boursiers.jpg"*/}
      {/*        className="fr-link"*/}
      {/*        target="_blank"*/}
      {/*      >*/}
      {/*        Vignette pour les étudiants boursiers*/}
      {/*      </Link>*/}
      {/*    </li>*/}
      {/*  </ul>*/}
      {/*</Accordion>*/}
      {/*<Accordion*/}
      {/*  label="Visuel pour les structures sportives partenaires"*/}
      {/*  expanded={false}*/}
      {/*  onExpandedChange={() => {}}*/}
      {/*>*/}
      {/*  <ul>*/}
      {/*    <li>*/}
      {/*      <Link*/}
      {/*        href="/assets/ressources/¡reseaux-sociaux/structures_jeunes.jpg"*/}
      {/*        className="fr-link"*/}
      {/*        target="_blank"*/}
      {/*      >*/}
      {/*        Vignette pour les clubs prenant les jeunes*/}
      {/*      </Link>*/}
      {/*    </li>*/}
      {/*    <li>*/}
      {/*      <Link*/}
      {/*        href="/assets/ressources/reseaux-sociaux/structures_parents.jpg.jpg"*/}
      {/*        className="fr-link"*/}
      {/*        target="_blank"*/}
      {/*      >*/}
      {/*        Vignette pour les clubs prenant les enfants des parents*/}
      {/*      </Link>*/}
      {/*    </li>*/}
      {/*  </ul>*/}
      {/*</Accordion>*/}
    </>
  );
}
