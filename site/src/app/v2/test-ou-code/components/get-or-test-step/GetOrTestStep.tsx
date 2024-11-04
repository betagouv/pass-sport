import MissionCards from '../../../../components/mission-cards/MissionCards';

import ButtonChoiceGroup from '../button-choice-group/ButtonChoiceGroup';
import Legend from '@/app/v2/test-eligibilite-base/components/customRadioButtons/legend/Legend';

interface Props {}
const GetOrTestChoice = ({}: Props) => {
  return (
    <>
      <Legend line1="Bonjour," line2="Que souhaitez-vous faire ?" wrapInParagraph />
      <div className="fr-pb-7w fr-pt-2w">
        <ButtonChoiceGroup />
      </div>

      <MissionCards isUsingSuccessUrls />
    </>
  );
};

export default GetOrTestChoice;
