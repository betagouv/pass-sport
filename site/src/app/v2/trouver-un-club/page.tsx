import PageTitle from '@/components/PageTitle/PageTitle';
import { getAllClubActivities } from './agent';

import ClubFinder from './components/club-finder/ClubFinder';
import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import { Metadata } from 'next';
import { Suspense } from 'react';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Geolocation from './components/geolocation/Geolocation';
import Loading from '@/app/components/loading/Loading';
import EligibilityTestBanner from '@/components/eligibility-test-banner/EligibilityTestBanner';

export const metadata: Metadata = {
  title: 'Trouver un club partenaire - pass Sport',
};

const TrouverUnClub = async () => {
  const activities = await getAllClubActivities();

  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle title="Trouver un club" />
        <Suspense fallback={<Loading />}>
          <Geolocation>
            <ClubFinder activities={activities} />
          </Geolocation>
        </Suspense>
      </main>

      <EligibilityTestBanner />
      <SocialMediaPanel />
    </>
  );
};

export default TrouverUnClub;
