import ClubDetails from '@/app/v2/trouver-un-club/[club-name]/components/clubDetails/ClubDetails';
import SocialMediaPanel from '../../../components/social-media-panel/SocialMediaPanel';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';

interface Props {
  params: { 'club-name': string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { 'club-name': clubSlug } = await params;

  return {
    title: `Trouver un club partenaire - ${decodeURIComponent(clubSlug)} - pass Sport`,
  };
}

export default async function ClubPage({ params }: { params: Promise<{ 'club-name': string }> }) {
  const { 'club-name': clubSlug } = await params;
  const clubName = decodeURIComponent(clubSlug);

  console.log({ clubName, params });

  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <ClubDetails clubName={clubName} />
      </main>

      <SocialMediaPanel />
    </>
  );
}
