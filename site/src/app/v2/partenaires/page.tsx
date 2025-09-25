import { Metadata } from 'next';
import styles from './styles.module.scss';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import Image from 'next/image';
import athletism from '@/images/structures/athletism.webp';
import cn from 'classnames';
import AccordionsCommunicationKit from '@/app/v2/partenaires/components/AccordionsCommunicationKit';
import AccordionsSocialMediasVisuals from '@/app/v2/partenaires/components/AccordionsSocialMediasVisuals';
import WebsiteAccordions from '@/app/v2/partenaires/components/AccordionsWebsites';
import { AccordionsLogos } from '@/app/v2/partenaires/components/AccordionsLogos';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Partenaires',
  };
}

export default function Page() {
  return (
    <main className={styles['container']} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
      <PageTitle title="Partenaires" />

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
            Fédération, structure sportive, collectivité locale, acteur de l&apos;accompagnement des
            jeunes, établissement scolaire, journaliste..., vous pouvez contribuer à la promotion du
            pass Sport.
          </p>
        </section>

        <section className={styles['resources__description-section']}>
          <p className="fr-text--lg">
            Le ministère chargé des Sports a élaboré un ensemble d&apos;outils et supports de
            communication qui sont mis à disposition des acteurs et peuvent être utilisés pour
            assurer la promotion du dispositif.
          </p>
        </section>

        <section className={styles['resources__accordions-section']}>
          <section className={styles['resources__accordions-item']}>
            <AccordionsCommunicationKit />
          </section>
          <section className={styles['resources__accordions-item']}>
            <AccordionsSocialMediasVisuals />
          </section>
          <section className={styles['resources__accordions-item']}>
            <WebsiteAccordions titleAs="h3" />
          </section>
          <section className={styles['resources__accordions-item']}>
            <AccordionsLogos />
          </section>
        </section>
      </div>
    </main>
  );
}
