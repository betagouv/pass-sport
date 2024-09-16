import { LIST_LIMIT } from '@/utils/club-finder';
import Button from '@codegouvfr/react-dsfr/Button';
import { SportGouvJSONRecordsResponse } from 'types/Club';
import styles from './styles.module.scss';
import cn from 'classnames';

interface Props {
  onClick: () => void;
  clubs: SportGouvJSONRecordsResponse;
}
const MoreClubsButton: React.FC<Props> = ({ clubs, onClick }) => {
  const isLastPage = clubs.total_count === clubs.results.length;

  if (isLastPage) {
    return null;
  }

  const isPenultimatePage =
    clubs.total_count > clubs.results.length &&
    clubs.total_count - clubs.results.length <= LIST_LIMIT - 1;

  return (
    <div className={cn('fr-mt-9w', styles['more-clubs-wrapper'])}>
      <Button
        priority="primary"
        size="large"
        onClick={onClick}
        nativeButtonProps={{
          'aria-label': 'Voir plus de clubs. La liste des clubs sera augmentée des clubs suivants',
        }}
      >
        {`Afficher ${isPenultimatePage ? clubs.total_count - clubs.results.length : LIST_LIMIT} ${clubs.total_count - clubs.results.length === 1 ? 'club' : 'clubs'}`}
      </Button>
    </div>
  );
};

export default MoreClubsButton;
