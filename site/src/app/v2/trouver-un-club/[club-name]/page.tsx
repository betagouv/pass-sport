import ClubDetails from '@/app/v2/trouver-un-club/[club-name]/components/clubDetails/ClubDetails';
import EligibilityTestBanner from '../../../../../components/eligibility-test-banner/EligibilityTestBanner';
import SocialMediaPanel from '../../../components/social-media-panel/SocialMediaPanel';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';

interface Props {
  params: { 'club-name': string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `Trouver un club partenaire - ${decodeURIComponent(params['club-name'])} - pass Sport`,
  };
}

const ClubPage = ({ params }: { params: { 'club-name': string } }) => {
  const clubName = decodeURIComponent(params['club-name']);

  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <ClubDetails clubName={clubName} />
      </main>

      {/*<EligibilityTestBanner />*/}
      <SocialMediaPanel />
    </>
  );
};

export default ClubPage;
