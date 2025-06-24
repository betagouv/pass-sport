import PageTitle from '@/components/PageTitle/PageTitle';
import styles from './styles.module.scss';
import About from './components/about';
import ObtainPassPort from './components/obtain-pass-sport';
import HowToUsePassSport from './components/how-to-use-pass-sport';
import WhereToUsePassSport from './components/where-to-use-pass-sport';
import LegalTextReference from './components/legal-text-reference';
import EligibilityTestBanner from '../../../../components/eligibility-test-banner/EligibilityTestBanner';
import SocialMediaPanel from '../../components/social-media-panel/SocialMediaPanel';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';

export const metadata: Metadata = {
  title: 'Particulier - Tout savoir sur le pass Sport - pass Sport',
};

export default function ToutSavoirSurLePassSport() {
  return (
    <>
      <main className={styles.container} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle title="Tout savoir sur le pass Sport" />
        <About />
        {/* todo: enable later */}
        {/*<div className={styles['section-container']}>*/}
        {/*  <ObtainPassPort />*/}
        {/*  <HowToUsePassSport />*/}
        {/*  <WhereToUsePassSport />*/}
        {/*  <LegalTextReference />*/}
        {/*</div>*/}
      </main>

      {/*<EligibilityTestBanner />*/}
      <SocialMediaPanel />
    </>
  );
}
