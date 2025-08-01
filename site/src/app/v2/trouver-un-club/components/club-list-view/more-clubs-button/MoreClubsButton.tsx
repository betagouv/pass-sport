import Button from '@codegouvfr/react-dsfr/Button';
import { SportGouvJSONRecordsResponse } from 'types/Club';
import styles from './styles.module.scss';
import cn from 'classnames';
import { useIsProVersion } from '@/app/hooks/use-is-pro-version';

interface Props {
  onClick: () => void;
  clubs: SportGouvJSONRecordsResponse;
}
const MoreClubsButton: React.FC<Props> = ({ clubs, onClick }) => {
  const isLastPage = clubs.total_count === clubs.results.length;
  const isProVersion = useIsProVersion();

  if (isLastPage) {
    return null;
  }

  return (
    <div className={cn('fr-mt-9w', isProVersion ? 'fr-mb-4w' : '', styles['more-clubs-wrapper'])}>
      <Button
        priority="primary"
        size="large"
        onClick={onClick}
        nativeButtonProps={{
          'aria-label': 'La liste des clubs sera augmentée des clubs suivants',
        }}
      >
        Voir plus de clubs
      </Button>
    </div>
  );
};

export default MoreClubsButton;
