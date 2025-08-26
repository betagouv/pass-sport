'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';

export function AccordionsFaq() {
  return (
    <>
      <Accordion label="Quel est le format du pass Sport cette année ?" onExpandedChange={() => {}}>
        <p></p>
      </Accordion>
      <Accordion
        label="Inscription entre juin et fin août, comment procéder ?"
        onExpandedChange={() => {}}
      >
        <p></p>
      </Accordion>
      <Accordion label="Qui sont les bénéficiaires du pass Sport ?" onExpandedChange={() => {}}>
        <p></p>
      </Accordion>
      <Accordion
        label="Comment obtenir et suivre le remboursement des pass Sport ?"
        onExpandedChange={() => {}}
      >
        <p></p>
      </Accordion>
      <Accordion
        label="Comment faire apparaître mon club sur la carte des structures éligibles au Pass Sport ?"
        onExpandedChange={() => {}}
      >
        <p></p>
      </Accordion>
    </>
  );
}
