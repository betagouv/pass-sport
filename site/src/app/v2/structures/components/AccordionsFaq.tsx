import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';

export function AccordionsFaq() {
  return (
    <>
      <Accordion label="Quel est le format du pass Sport cette année ?"></Accordion>
      <Accordion label="Inscription entre juin et fin août, comment procéder ?"></Accordion>
      <Accordion label="Qui sont les bénéficiaires du pass Sport ?"></Accordion>
      <Accordion label="Comment obtenir et suivre le remboursement des pass Sport ?"></Accordion>
      <Accordion label="Comment faire apparaître mon club sur la carte des structures éligibles au Pass Sport ?"></Accordion>
    </>
  );
}
