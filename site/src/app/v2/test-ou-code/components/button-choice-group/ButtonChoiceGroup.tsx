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
          children: `Je souhaite savoir si j'ai le droit au pass Sport`,
          onClick: () => router.push('test-eligibilite-base'),
          priority: 'secondary',
        },
        ...(CODES_OBTAINABLE
          ? [
              {
                children: 'Je souhaite récupérer mon pass Sport',
                onClick: () => router.push('test-eligibilite'),
                priority: 'secondary' as const,
              },
            ]
          : []),
      ]}
      inlineLayoutWhen="sm and up"
      buttonsSize="large"
    />
  );
};

export default ButtonChoiceGroup;
