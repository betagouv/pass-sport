'use client';

import { useCallback } from 'react';
import Link from 'next/link';

type ContactAeehSectionProps = {
  onOpenBtnClick: () => void;
};

const ContactAeehSection = ({ onOpenBtnClick = () => {} }: ContactAeehSectionProps) => {
  const onAeehFormClick = useCallback(() => onOpenBtnClick(), [onOpenBtnClick]);

  return (
    <>
      <section>
        <Link
          className="fr-link"
          href="https://www.demarches-simplifiees.fr/commencer/code-pass-sport-aeeh"
          target="_blank"
          title="Faites-en la demande sur démarches-simplifiées - Nouvelle fenêtre"
          onClick={() => {
            onAeehFormClick();
          }}
        >
          Faites-en la demande sur démarches-simplifiées
        </Link>
      </section>
    </>
  );
};

export default ContactAeehSection;
