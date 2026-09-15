import { SportGouvJSONRecordsResponse } from '@/types/Club';
import styles from './styles.module.scss';
import cn from 'classnames';
import Card from '@codegouvfr/react-dsfr/Card';
import { usePathname } from 'next/navigation';
import ClubTags from '../club-tags/ClubTags';
import rootStyles from '@/app/utilities.module.scss';
import MoreClubsButton from './more-clubs-button/MoreClubsButton';
import { MATOMO_CATEGORY, trackEvent } from '@/utils/matomo';

interface Props {
  clubs: SportGouvJSONRecordsResponse;
  onSeeMoreClubsClicked: () => void;
}
const ClubListView = ({ clubs, onSeeMoreClubsClicked }: Props) => {
  const pathname = usePathname();

  return (
    <>
      <div className={cn('fr-mx-auto')}>
        <ul className={cn(styles.container, rootStyles['list--lean'])} id="club-list">
          {clubs.results.map((club) => (
            <li key={club.nom + club.adresse + club.commune} className={styles.item}>
              <Card
                background
                border
                detail={club.adresse ? `${club.adresse}, ${club.com_arm_name}` : club.com_arm_name}
                enlargeLink
                linkProps={{
                  href: `${pathname}/${encodeURIComponent(club.nom)}`,
                  onClick: () => trackEvent(MATOMO_CATEGORY.clubFinder, 'ouverture fiche', 'liste'),
                }}
                size="medium"
                start={<ClubTags club={club} />}
                title={`${club.nom}`}
                titleAs="h2"
                classes={{ root: styles.card }}
              />
            </li>
          ))}
        </ul>

        <MoreClubsButton clubs={clubs} onClick={onSeeMoreClubsClicked} />
      </div>
    </>
  );
};

export default ClubListView;
