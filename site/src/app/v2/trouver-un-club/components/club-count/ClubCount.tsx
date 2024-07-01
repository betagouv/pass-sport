import cn from 'classnames';
import styles from './styles.module.scss';
import { LIMIT } from 'utils/map';

interface Props {
  displayedClubCount: number;
  totalClubCount: number;
  isPaginating: boolean;
}

const ClubCount: React.FC<Props> = ({ displayedClubCount, totalClubCount, isPaginating }) => {
  if (isPaginating) {
    return (
      <p className={cn('fr-text--lead', 'fr-mb-0', styles.paragraph)}>
        {displayedClubCount} {displayedClubCount > 1 ? 'clubs affichés' : 'club affiché'} sur{' '}
        {totalClubCount} {totalClubCount > 1 ? 'clubs référencés' : 'club référencé'}
      </p>
    );
  }

  if (displayedClubCount >= LIMIT) {
    return (
      <p className={cn('fr-text--lead', 'fr-mb-0', styles.paragraph)}>
        Les clubs trouvés sont trop nombreux. Seuls les {LIMIT} premiers sont affichés. Merci
        d&apos;affiner votre recherche.
      </p>
    );
  }

  return (
    <p className={cn('fr-text--lead', 'fr-mb-0', styles.paragraph)}>
      {displayedClubCount} {displayedClubCount > 1 ? 'clubs référencés' : 'club référencé'}
    </p>
  );
};

export default ClubCount;
