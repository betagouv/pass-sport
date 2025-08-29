'use client';

import { createModal } from '@codegouvfr/react-dsfr/Modal';
import { useIsModalOpen } from '@codegouvfr/react-dsfr/Modal/useIsModalOpen';
import { useCallback, useEffect, useState } from 'react';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Button from '@codegouvfr/react-dsfr/Button';
import { JEUNES_PARENTS_PAGE_AEEH_PARAMS } from '@/app/constants/search-query-params';
import { useSearchParams } from 'next/navigation';
import ContactFormAeeh from '@/app/v2/jeunes-et-parents/components/ContactFormAeeh/ContactFormAeeh';
import { push } from '@socialgouv/matomo-next';

const formModal = createModal({
  id: 'aeeh-contact-form-modal',
  isOpenedByDefault: false,
});

type ContactAeehSectionProps = {
  onOpenBtnClick?: () => void;
};

const ContactAeehSection = ({ onOpenBtnClick = () => {} }: ContactAeehSectionProps) => {
  const searchParams = useSearchParams();
  const [modalIsClosed, setModalIsClosed] = useState(true);

  const onAeehFormClick = useCallback(
    () =>
      onOpenBtnClick
        ? onOpenBtnClick()
        : push(['trackEvent', 'Jeunes et parents', 'Click', 'Button to open AEEH form']),
    [onOpenBtnClick],
  );

  // Open contact modal if query parameter is present
  useEffect(() => {
    if (
      searchParams?.get(JEUNES_PARENTS_PAGE_AEEH_PARAMS.aeehModalOpened) === '1' &&
      formModal?.open
    ) {
      setTimeout(() => {
        formModal.open();
        setModalIsClosed(false);
      }, 100);
    }
  }, [searchParams]);

  useIsModalOpen(formModal, {
    onConceal: () => {
      setModalIsClosed(true);
    },
    onDisclose: () => {
      setModalIsClosed(false);
    },
  });

  return (
    <>
      <section>
        <Button
          id={SKIP_LINKS_ID.contactUsByMail}
          priority="secondary"
          onClick={() => {
            onAeehFormClick();
            formModal.open();
          }}
        >
          Remplir le formulaire
        </Button>
      </section>
      <formModal.Component
        title="Demande d’un code pass Sport pour mon enfant bénéficiant de l'Allocation d'Éducation de l'Enfant Handicapé (AEEH)"
        className="fr-mb-0"
        size="large"
      >
        <ContactFormAeeh closeFn={formModal.close} />
      </formModal.Component>
    </>
  );
};

export default ContactAeehSection;
