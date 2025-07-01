'use client';

import Button from '@codegouvfr/react-dsfr/Button';
import styles from './styles.module.scss';
import Image from 'next/image';
import boysTeamImage from '@/images/homepage/boys-team.jpeg';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';

const FindClubCard = () => {
  return (
    <div className={`fr-mx-auto ${styles.sizer} `}>
      <div
        className={`fr-card fr-card--no-border fr-card--lg fr-card--horizontal fr-card--horizontal-half ${styles.background}`}
      >
        <div className={`fr-card__body fr-my-auto `}>
          <div className="fr-card__content ">
            <h2 className={`fr-card__title ${styles.title} fr-h4`}>Trouver un club partenaire</h2>
            <p className="fr-card__desc">
              Choisis le club de ton choix parmi plus de 85&nbsp;000 clubs et salles de sport
              partout en France !
            </p>
          </div>
          <div className="fr-card__footer">
            <Button
              id={SKIP_LINKS_ID.findClubButton}
              className={styles.button}
              priority="secondary"
              iconId="fr-icon-arrow-right-line"
              size="large"
              iconPosition="right"
              linkProps={{
                href: '/v2/trouver-un-club',
                'aria-label': 'Visiter la page pour trouver un club',
              }}
            >
              Trouver un club
            </Button>
          </div>
        </div>
        <div className={`fr-card__header ${styles['image-sizer']}`}>
          <div className="fr-card__img">
            <Image src={boysTeamImage} className="fr-responsive-img" alt="" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FindClubCard;
