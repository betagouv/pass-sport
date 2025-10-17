'use server';

import PageTitle from '@/components/PageTitle/PageTitle';
import SocialMediaPanel from '../../components/social-media-panel/SocialMediaPanel';
import styles from './styles.module.scss';
import ContactSection from '@/app/v2/une-question/components/ContactSection/ContactSection';
import { headers } from 'next/headers';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import { CATEGORY_IDENTIFIERS } from '@/types/Faq';
import SegmentedFaq from '@/app/v2/une-question/components/SegmentedFaq/SegmentedFaq';
import { DISPLAY_TYPE } from '@/app/constants/display-type';
import { getCategoriesWithArticles } from '@/app/v2/une-question/server-agent';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Une question ? - pass Sport',
  };
}

export default async function Questions({
  searchParams,
}: {
  searchParams: Promise<{ [_: string]: string | undefined }>;
}) {
  headers();

  const benefArticles = await getCategoriesWithArticles({
    categoryIdentifier: CATEGORY_IDENTIFIERS.USER_CATEGORY_IDENTIFIER,
  });

  const proArticles = await getCategoriesWithArticles({
    categoryIdentifier: CATEGORY_IDENTIFIERS.PRO_CATEGORY_IDENTIFIER,
  });

  const displayTypeParams = (await searchParams).displayType || '';
  const displayType =
    displayTypeParams === DISPLAY_TYPE.PRO || displayTypeParams === DISPLAY_TYPE.BENEF
      ? displayTypeParams
      : DISPLAY_TYPE.BENEF;

  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle
          title="Vous avez une question ?"
          subtitle="Questions fréquemment posées"
          classes={{
            container: styles['page-header'],
          }}
        />
        <SegmentedFaq
          benefArticles={benefArticles}
          proArticles={proArticles}
          displayType={displayType}
        />
        <ContactSection isProVersion={displayType === DISPLAY_TYPE.PRO} />
      </main>

      <SocialMediaPanel titleAs="h2" />
    </>
  );
}
