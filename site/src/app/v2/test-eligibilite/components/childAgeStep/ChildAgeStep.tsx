import { useState } from 'react';
import Question from '../Question/Question';
import VerdictPanel from '../../../../components/verdictPanel/VerdictPanel';
import AllowancesStep from '../allowancesStep/AllowancesStep';
import RadioButtonsGroup from '../radioButtonsGroup/RadioButtonsGroup';
import { CHILD_AGE } from '../types/types';
import rootStyles from '@/app/styles.module.scss';
import cn from 'classnames';

const ChildAgeStep = () => {
  const [childAge, setChildAge] = useState<CHILD_AGE | null>(null);

  const failureCallOut = (
    <VerdictPanel
      title="Nous sommes désolés, d'après les informations que vous nous avez transmises, vous n'êtes pas éligible au pass Sport"
      isSuccess={false}
    >
      <p className={cn('fr-text--lg', rootStyles['text--black'], rootStyles['text--medium'])}>
        En effet, ce dispositif est ouvert aux:
      </p>

      <ul
        className={cn(
          'fr-ml-2w',
          'fr-text--lg',
          rootStyles['text--black'],
          rootStyles['text--medium'],
        )}
      >
        <li className="fr-my-2w">
          Personnes nées entre le 16 septembre 1993 et le 31 décembre 2018.
        </li>
      </ul>

      <p className={cn('fr-text--lg', 'fr-text--bold', rootStyles['text--black'])}>
        Pour autant, vous avez peut-être droit à d&apos;autres aides. N&apos;hésitez pas à vous
        rapprocher de votre région, département ou commune de résidence.
      </p>
    </VerdictPanel>
  );

  return (
    <>
      <Question question="Quel âge a votre enfant ?">
        <div>
          <RadioButtonsGroup
            fieldsetId="childAgeStep"
            options={[
              {
                label: 'Moins de 6 ans',
                onChange: () => setChildAge(CHILD_AGE.LESS_THAN_SIX),
              },
              {
                label: 'Entre 6 et 30 ans',
                onChange: () => setChildAge(CHILD_AGE.BTW_SIX_AND_THIRTY),
              },
              {
                label: 'Plus de 30 ans',
                onChange: () => setChildAge(CHILD_AGE.MORE_THAN_THIRTY),
              },
            ]}
          />
        </div>
      </Question>

      {childAge === CHILD_AGE.LESS_THAN_SIX && failureCallOut}
      {childAge === CHILD_AGE.BTW_SIX_AND_THIRTY && <AllowancesStep isForChild />}
      {childAge === CHILD_AGE.MORE_THAN_THIRTY && failureCallOut}
    </>
  );
};

export default ChildAgeStep;
