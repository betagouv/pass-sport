import { Metadata } from 'next';
import styles from './styles.module.scss';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import Image from 'next/image';
import athletism from '@/images/structures/athletism.webp';
import cn from 'classnames';
import CommunicationKitAccordions from '@/app/v2/ressources/components/CommunicationKitAccordions';
import SocialMediasVisualsAccordions from '@/app/v2/ressources/components/SocialMediasVisualsAccordions';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Ressources',
  };
}

export default function Page() {
  return (
    <main className={styles['container']} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
      <PageTitle title="Ressources" />

      <div className="fr-container">
        <section className={styles['resources__main-section']}>
          <Image
            src={athletism}
            className={cn('fr-responsive-img', styles['resources__main-section-image'])}
            alt=""
          />
          <p
            className={cn(['fr-text--xl text--title-grey', styles['resources__main-section-text']])}
          >
            Fédération, collectivité locale, établissement scolaire, journaliste..., contribuez à la
            promotion du pass Sport.
          </p>
        </section>

        <section className={styles['resources__description-section']}>
          <h2 className="fr-h3">
            Les outils de communication mis à disposition par le ministère des Sports, de la
            Jeunesse et de la Vie associative
          </h2>
          <p className="fr-text--lg">
            Le ministère des Sports, de la Jeunesse et de la Vie associative a élaboré un ensemble
            d&apos;outils et supports de communication qui sont mis à disposition des acteurs et
            peuvent être utilisés pour assurer la promotion du dispositif.
          </p>
        </section>

        <section className={styles['resources__accordions-section']}>
          <section className={styles['resources__accordions-item']}>
            <CommunicationKitAccordions />
          </section>
          <section className={styles['resources__accordions-item']}>
            <SocialMediasVisualsAccordions />
          </section>
        </section>
      </div>
    </main>
  );
}
