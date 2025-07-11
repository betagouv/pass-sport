import PresentationTile from './components/PresentationTile';
import { presentationTiles } from './page.messages';
import styles from './styles.module.scss';
import Callouts from './components/callout/Callout';
import SocialMediaPanel from '../../components/social-media-panel/SocialMediaPanel';
import Video from './components/video/Video';
import FindClubCard from './components/find-club-card/FindClubCard';
import Hero from './components/hero/Hero';
import cn from 'classnames';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import SimplifiedEligibilityTest from '@/app/components/simplified-eligibility-test/SimplifiedEligibilityTest';

export const metadata: Metadata = {
  title: 'Accueil - pass Sport',
  description: "Page d'accueil du site pass.sports.gouv.fr pour les particuliers",
};

export default function Accueil() {
  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <section>
          <Hero />
        </section>

        <section className={cn(styles['eligibility-test__container'])}>
          <div className={cn(styles['eligibility-test__content'])}>
            <SimplifiedEligibilityTest buttonVariant="secondary" />
          </div>
        </section>

        <div className={cn('fr-px-2w', 'fr-pt-8w', styles['blue-background'])}>
          <section className="fr-pt-6w">
            <FindClubCard />
          </section>
        </div>

        <section className={cn('fr-pt-4w', 'fr-px-5w', styles['callout-section'])}>
          <div className={cn('fr-mx-auto', styles.sizer)}>
            <Callouts />
          </div>
        </section>
      </main>

      <SocialMediaPanel isHomePage />
    </>
  );
}
