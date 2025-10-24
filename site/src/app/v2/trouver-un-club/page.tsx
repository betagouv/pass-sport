import PageTitle from '@/components/PageTitle/PageTitle';
import { getAllClubActivities } from './agent';

import ClubFinder from './components/club-finder/ClubFinder';
import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import { Metadata } from 'next';
import { Suspense } from 'react';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Geolocation from './components/geolocation/Geolocation';
import Loading from '@/app/components/loading/Loading';
import styles from './styles.module.scss';

export const metadata: Metadata = {
  title: 'Trouver un club partenaire - pass Sport',
};

const TrouverUnClub = async () => {
  const activities = await getAllClubActivities();

  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle
          title="Trouver un club"
          classes={{
            container: styles['page-header'],
          }}
        />
        <Suspense fallback={<Loading />}>
          <Geolocation>
            <ClubFinder activities={activities} />
          </Geolocation>
        </Suspense>
      </main>

      <SocialMediaPanel />
    </>
  );
};

export default TrouverUnClub;
