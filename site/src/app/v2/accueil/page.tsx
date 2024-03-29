import EmailForm from '@/components/homepage/EmailForm';
import passSportImage from '@/images/homepage/pass-sport.png';
import Image from 'next/image';
import { presentationTiles } from './page.messages';
import PresentationTile from '@/components/homepage/PresentationTile';
import Video from '@/components/homepage/Video';
import Callouts from '@/components/homepage/Callouts';
import News from '@/components/homepage/News';
import styles from './page.module.scss';
import Button from '@codegouvfr/react-dsfr/Button';
import NewsletterAndSocialMedia from '@/components/homepage/NewsletterAndSocialMedia';

export default function Accueil() {
  return (
    <main>
      <section className={styles.hero}>
        <div className={styles.hero_background}>
          <div className={styles.hero_background_blue}></div>
        </div>
        <div className={styles.hero_container}>
          <Image
            src="/images/homepage/pass-sport.png"
            width={229}
            height={97}
            alt="logo Pass'sport"
          />

          <h1 className={styles.hero_color}>Testez votre éligibilité</h1>
          <p className={styles.hero_color}>
            50€ pour aider les jeunes à faire du sport entre 6 et 30ans
          </p>
          {/* <EmailForm /> */}
          <div className={styles.hero_container_panel}>
            <Button
              priority="primary"
              size="large"
              iconId="fr-icon-arrow-right-line"
              iconPosition="right"
            >
              Obtenir mon code pass&apos;Sport
            </Button>
          </div>
        </div>
      </section>

      <section className={`fr-container ${styles.tiles}`}>
        <div className="fr-grid-row fr-grid-row--gutters">
          {presentationTiles.map((tile) => (
            <div key={tile.id} className="fr-col-12 fr-col-lg-3">
              <PresentationTile {...tile} />
            </div>
          ))}
        </div>
      </section>

      <section className="fr-container">
        <h2>Mieux comprendre le Pass&apos;Sport</h2>
        <div className={`${styles.sizer}`}>
          <Video />
        </div>

        <div className={` ${styles.sizer}`}>
          <Callouts />
        </div>
      </section>

      <section className={`fr-container ${styles.news}`}>
        <h2>Les actualités du pass&apos;Sport</h2>
        <div className={`${styles.sizer} ${styles.news_wrapper}`}>
          <News />
        </div>
      </section>

      <div className={styles.rectangle}>
        <div className={styles.rectangle_background}>
          <div className={styles.rectangle_background_blue}></div>
        </div>
      </div>

      <NewsletterAndSocialMedia />
    </main>
  );
}
