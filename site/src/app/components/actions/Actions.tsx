import ButtonsGroup from '@codegouvfr/react-dsfr/ButtonsGroup';
import { useContext } from 'react';
import EligibilityTestContext from '@/store/eligibilityTestContext';

const Actions = () => {
  const context = useContext(EligibilityTestContext);

  return (
    <ButtonsGroup
      buttons={[
        {
          children: `Retour à l'accueil`,
          priority: 'secondary',
          linkProps: {
            href: '/v2/accueil',
          },
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
