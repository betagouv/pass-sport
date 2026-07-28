import Tag from '@codegouvfr/react-dsfr/Tag';
import { Club } from '@/types/Club';
import { DisabilityTag } from '../disability-tag/DisabilityTag';

interface Props {
  club: Club;
  small?: boolean;
}

const ClubTags: React.FC<Props> = ({ club, small }) => {
  return (
    <ul className="fr-my-2w fr-tags-group">
      {Array.isArray(club.activites) && club.activites.length > 0 && (
        <li>
          <Tag small={small}>
            {club.activites.length} {club.activites.length > 1 ? 'activités' : 'activité'}
          </Tag>
        </li>
      )}

      {club.handicap === 'Oui' && (
        <li>
          <DisabilityTag club={club} small={small} />
        </li>
      )}
    </ul>
  );
};

export default ClubTags;
