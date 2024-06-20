import cn from 'classnames';
import { SEARCH_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { useSearchParams } from 'next/navigation';
import ToggleSwitch from '@codegouvfr/react-dsfr/ToggleSwitch';

interface Props {
  onDisabilityChanged: (isActivated: boolean) => void;
}

const HandicapFilter = ({ onDisabilityChanged }: Props) => {
  const searchParams = useSearchParams();
  const toggleActivated = searchParams && searchParams.get(SEARCH_QUERY_PARAMS.handicap) === 'Oui';

  return (
    <ToggleSwitch
      inputTitle="test"
      className={cn('fr-mx-0', 'fr-mb-0')}
      label="Accueil des personnes en situation de handicaps uniquement"
      name="disability"
      onChange={(isActivated) => {
        onDisabilityChanged(isActivated);
      }}
      {...(toggleActivated && {
        defaultChecked: true,
      })}
    />
  );
};

export default HandicapFilter;
