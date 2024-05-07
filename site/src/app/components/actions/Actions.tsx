import ButtonsGroup from '@codegouvfr/react-dsfr/ButtonsGroup';

import { useRouter } from 'next/navigation';
import { useContext } from 'react';
import EligibilityTestContext from '@/store/eligibilityTestContext';

const Actions = () => {
  const router = useRouter();
  const context = useContext(EligibilityTestContext);

  return (
    <ButtonsGroup
      buttons={[
        {
          children: `Retour à l'accueil`,
          onClick: () => router.push('accueil'),
          priority: 'secondary',
        },
        {
          children: 'Refaire le test',
          onClick: () => {
            context.performNewTest();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          },
          priority: 'tertiary no outline',
          iconId: 'fr-icon-arrow-left-line',
        },
      ]}
      inlineLayoutWhen="sm and up"
      buttonsSize="large"
    />
  );
};

export default Actions;
