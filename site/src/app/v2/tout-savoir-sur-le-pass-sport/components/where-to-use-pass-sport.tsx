'use client';

import Button from '@codegouvfr/react-dsfr/Button';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';

export default function WhereToUsePassSport() {
  return (
    <section>
      <h2>Où l&apos;utiliser ?</h2>

      <p>
        <span className="display--block">
          Vous pouvez utiliser le pass Sport dans plus de 85 000 clubs et salles de sport, partout
          en en France.
        </span>
        <span className="display--block">Il est valable du 1er juin au 31 décembre 2025</span>
        <span className="display--block">
          La liste des établissements partenaires est disponible ici :
        </span>
      </p>

      <Button
        id={SKIP_LINKS_ID.findClubButton}
        priority="secondary"
        linkProps={{
          href: '/v2/trouver-un-club',
          'aria-label': 'Visiter la page pour trouver un club',
        }}
      >
        Trouver mon club partenaire
      </Button>
    </section>
  );
}
