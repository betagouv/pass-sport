import cn from 'classnames';
import styles from './styles.module.scss';

interface Props {
  displayedClubCount: number;
  totalClubCount: number;
}
const ClubCount: React.FC<Props> = ({ displayedClubCount, totalClubCount }) => {
  return (
    <p className={cn('fr-text--lead', 'fr-mb-0', styles.paragraph)}>
      {displayedClubCount} {displayedClubCount > 1 ? 'clubs affichés' : 'club affiché'} sur{' '}
      {totalClubCount} {totalClubCount > 1 ? 'clubs référencés' : 'club référencé'}
    </p>
  );
};

export default ClubCount;
