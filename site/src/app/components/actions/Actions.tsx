import ButtonsGroup from '@codegouvfr/react-dsfr/ButtonsGroup';
import { useContext } from 'react';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { ButtonProps } from '@codegouvfr/react-dsfr/Button';

type ActionsProps = {
  displayHomeBackBtn?: boolean;
  newTestBtnVariant?: ButtonProps['priority'];
};
const Actions = ({ displayHomeBackBtn = true, newTestBtnVariant = 'secondary' }: ActionsProps) => {
  const context = useContext(EligibilityTestContext);

  return (
    <ButtonsGroup
      buttons={[
        {
          children: 'Refaire le test',
          onClick: () => {
            context.performNewTest();
            // window.scrollTo({ top: 0, behavior: 'smooth' });
          },
          priority: 'tertiary no outline',
          iconId: 'fr-icon-arrow-left-line',
        },
        ...(displayHomeBackBtn
          ? [
              {
                children: `Retour à l'accueil`,
                priority: newTestBtnVariant,
                linkProps: {
                  href: '/v2/accueil',
                },
              },
            ]
          : []),
      ]}
      inlineLayoutWhen="sm and up"
      buttonsSize="large"
    />
  );
};

export default Actions;
