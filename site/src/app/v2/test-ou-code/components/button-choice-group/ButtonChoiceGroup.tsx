'use client';
import ButtonsGroup from '@codegouvfr/react-dsfr/ButtonsGroup';
import { useRouter } from 'next/navigation';
import React from 'react';

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
        // todo: Enable later in august
        // {
        //   children: 'Je souhaite récupérer mon pass Sport',
        //   onClick: () => router.push('test-eligibilite'),
        //   priority: 'secondary',
        // },
      ]}
      inlineLayoutWhen="sm and up"
      buttonsSize="large"
    />
  );
};

export default ButtonChoiceGroup;
