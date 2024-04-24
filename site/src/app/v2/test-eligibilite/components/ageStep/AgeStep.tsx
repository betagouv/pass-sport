import { useState } from 'react';
import Question from '../Question/Question';
import AgeStep2 from '../ageStep2/AgeStep2';
import RadioButtonsGroup from '../radioButtonsGroup/RadioButtonsGroup';
import { AGE_RANGE } from '../types/types';
import VerdictPanel from '../verdictPanel/VerdictPanel';
import styles from '../../styles.module.scss';

const AgeStep = () => {
  const [ageRange, setAgeRange] = useState<AGE_RANGE | null>(null);

  return (
    <div>
      <Question question="Quel âge avez-vous ?">
        <RadioButtonsGroup
          fieldsetId="ageStep"
          options={[
            {
              label: 'Entre 6 et 19 ans',
              onChange: () => setAgeRange(AGE_RANGE.BETWEEN_6_19),
            },
            {
              label: 'Entre 19 et 30 ans',
              onChange: () => setAgeRange(AGE_RANGE.BETWEEN_19_30),
            },
            {
              label: 'Plus de 30 ans',
              onChange: () => setAgeRange(AGE_RANGE.GREATER_THAN_30),
            },
          ]}
        />
      </Question>

      {ageRange === AGE_RANGE.GREATER_THAN_30 && (
        <VerdictPanel
          title="Nous sommes désolés, d'après les informations que vous nous avez transmises, vous n'êtes
        pas éligible au pass Sport"
          isSuccess={false}
        >
          En effet, ce dispositif est ouvert aux:
          <ul className="fr-ml-2w">
            <li>Personnes nées entre le 16 septembre 1993 et le 31 décembre 2018.</li>
          </ul>
          <span className={styles['text--medium']}>
            Pour autant, vous avez peut-être droit à d&apos;autres aides. N&apos;hésitez pas à vous
            rapprocher de votre région, département ou commune de résidence.
          </span>
        </VerdictPanel>
      )}

      {/* "key" property here is crucial, it allows to "reset" the subsequent components */}
      {/* more info at https://react.dev/learn/preserving-and-resetting-state */}
      {ageRange !== null && <AgeStep2 ageRange={ageRange} key={ageRange} />}
    </div>
  );
};

export default AgeStep;
