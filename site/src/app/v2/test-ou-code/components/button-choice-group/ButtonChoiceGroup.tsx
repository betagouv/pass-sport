'use client';
import ButtonsGroup from '@codegouvfr/react-dsfr/ButtonsGroup';
import { useRouter } from 'next/navigation';
import React from 'react';
import { CODES_OBTAINABLE } from '@/app/constants/env';

const ButtonChoiceGroup = () => {
  const router = useRouter();
  return (
    <ButtonsGroup
      buttons={[
        {
          children: `Testez mon éligibilité en 1 min`,
          onClick: () => router.push('test-eligibilite-base'),
          priority: 'secondary',
        },
        ...(CODES_OBTAINABLE
          ? [
              {
                children: 'Récupérer mon code pass Sport',
                onClick: () => router.push('test-eligibilite'),
                priority: 'secondary' as const,
              },
            ]
          : []),
      ]}
      buttonsSize="large"
    />
  );
};

export default ButtonChoiceGroup;
