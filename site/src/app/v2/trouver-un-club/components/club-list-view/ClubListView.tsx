import { SportGouvJSONRecordsResponse } from 'types/Club';
import ClubCount from '../club-count/ClubCount';
import styles from './styles.module.scss';
import cn from 'classnames';
import Card from '@codegouvfr/react-dsfr/Card';
import Badge from '@codegouvfr/react-dsfr/Badge';
import Tag from '@codegouvfr/react-dsfr/Tag';
import { DisabilityTag } from '../disability-tag/DisabilityTag';
import Button from '@codegouvfr/react-dsfr/Button';
import { usePathname } from 'next/navigation';

interface Props {
  clubs: SportGouvJSONRecordsResponse;
  onSeeMoreClubsClicked: () => void;
}
const ClubListView = ({ clubs, onSeeMoreClubsClicked }: Props) => {
  const pathname = usePathname();
  const isLastPage = clubs.total_count === clubs.results.length;

  return (
    <div>
      <div className={cn('fr-mx-auto', 'fr-mt-6w', 'fr-mb-10w', styles.sizer)}>
        <div className={cn('fr-mt-6w', styles.container)}>
          {clubs.results.map((club) => (
            /** @ts-ignore */
            <Card
              key={club.nom + club.adresse + club.commune}
              className={styles.item}
              background
              badge={
                !!club.activites &&
                club.activites.slice(0, 1).map((a) => (
                  <Badge key={a} severity="new">
                    {a}
                  </Badge>
                ))
              }
              imageAlt=""
              border
              detail={club.adresse ? `${club.adresse}, ${club.com_arm_name}` : club.com_arm_name}
              enlargeLink
              linkProps={{
                href: `${pathname}/${encodeURIComponent(club.nom)}`,
              }}
              size="medium"
              start={
                <ul className="fr-tags-group">
                  {!!club.activites && club.activites.length > 0 && (
                    <li>
                      <Tag>
                        {club.activites.length}{' '}
                        {club.activites.length > 1 ? 'activités' : 'activité'}
                      </Tag>
                    </li>
                  )}

                  {club.handicap === 'Oui' && (
                    <li>
                      <DisabilityTag club={club} />
                    </li>
                  )}
                </ul>
              }
              title={`${club.nom}`}
              titleAs="h3"
            />
          ))}
        </div>

        {!isLastPage && (
          <div className={cn('fr-mt-9w', styles['more-clubs-wrapper'])}>
            <Button priority="primary" size="large" onClick={onSeeMoreClubsClicked}>
              Voir plus de clubs
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClubListView;
