'use client';

import { useCallback } from 'react';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
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
          id={SKIP_LINKS_ID.contactUsByMail}
          href="https://www.demarches-simplifiees.fr/commencer/code-pass-sport-aeeh"
          onClick={() => {
            onAeehFormClick();
          }}
        >
          Remplir le formulaire sur démarches simplifiées
        </Link>
      </section>
    </>
  );
};

export default ContactAeehSection;
