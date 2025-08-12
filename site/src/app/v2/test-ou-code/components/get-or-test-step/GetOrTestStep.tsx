import MissionCards from '../../../../components/mission-cards/MissionCards';

import ButtonChoiceGroup from '../button-choice-group/ButtonChoiceGroup';

interface Props {}
const GetOrTestChoice = ({}: Props) => {
  return (
    <>
      <div className="fr-pb-2w fr-pt-2w">
        <ButtonChoiceGroup />
      </div>
    </>
  );
};

export default GetOrTestChoice;
