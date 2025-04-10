import PageTitle from '@/components/PageTitle/PageTitle';

import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import ClubFinder from '@/app/v2/trouver-un-club/components/club-finder/ClubFinder';
import { getAllClubActivities } from '@/app/v2/trouver-un-club/agent';
import styles from './styles.module.scss';
import { Metadata } from 'next';
import { Suspense } from 'react';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Geolocation from '../../trouver-un-club/components/geolocation/Geolocation';
import Loading from '@/app/components/loading/Loading';

export const metadata: Metadata = {
  title: 'Carte des structures partenaires - pass Sport',
};

const TrouverUnClub = async () => {
  const activities = await getAllClubActivities();

  const subtitle = (
    <div>
      <p>
        Attention tous les clubs existants ne sont pas éligibles, seules les structures suivantes le
        sont :
      </p>
      <ul>
        <li>
          les clubs ou structures sportives, quelque soit leur statut, affiliés à l’une des
          fédérations sportives agréées par le ministère des sports et des Jeux Olympiques et
          Paralympiques,
        </li>
        <li>
          les associations non affiliées à une fédération sportive mais disposant d’un agrément
          valide Sport (délivré après 2016) ou Jeunesse Education Populaire (JEP) (délivré après
          2019) sur l’ensemble du territoire.
        </li>

        <li>
          {/* todo: confirm if the chart ist still the one from 2024 */}
          les structures du loisir sportif marchand ayant signé la Charte d’engagement pass Sport
          2024.
        </li>
      </ul>
    </div>
  );
  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle
          title="Carte des structures partenaires"
          isProVersion
          subtitle={subtitle}
          classes={{
            container: styles['page-header'],
          }}
        />
        <Suspense fallback={<Loading />}>
          <Geolocation>
            <ClubFinder activities={activities} isProVersion />
          </Geolocation>
        </Suspense>
      </main>

      <SocialMediaPanel isProVersion />
    </>
  );
};

export default TrouverUnClub;
