'use client';

import Button from '@codegouvfr/react-dsfr/Button';
import styles from './styles.module.scss';
import { useRouter } from 'next/navigation';
import cn from 'classnames';

const HeroPanel = () => {
  const isUsingJuneEligibilityTest = new Date().valueOf() > 1717027200000; //2024-05-30T00:00:00.000Z

  const router = useRouter();

  const eligibilityTestOnClick = () => {
    isUsingJuneEligibilityTest
      ? router.push('/v2/test-eligibilite')
      : router.push('/v2/test-eligibilite-mai');
  };

  const getButtonText = () => {
    return isUsingJuneEligibilityTest ? 'Obtenir mon pass Sport' : 'Je fais le test';
  };

  return (
    <div className={cn('fr-px-3w', styles.background, styles.sizer, styles.padder)}>
      <div className={styles.container}>
        <h2 className={cn('fr-hidden-lg', styles.title)}>
          50 euros pour aider les 6-30 ans à faire du sport
        </h2>
        <h2 className={cn('fr-hidden', 'fr-unhidden-lg', styles.title)}>
          50 euros
          <br />
          pour aider
          <br />
          les 6-30 ans à faire
          <br />
          du sport
        </h2>
        <p className={cn('fr-text--lead', 'fr-mb-0', styles.paragraph)}>
          Vais-je recevoir le pass Sport ?
        </p>
      </div>
      <div className={styles['button-wrapper']}>
        <Button
          className="fr-mt-3w"
          priority="primary"
          size="large"
          iconId="fr-icon-arrow-right-line"
          iconPosition="right"
          onClick={eligibilityTestOnClick}
        >
          {getButtonText()}
        </Button>
      </div>
    </div>
  );
};

export default HeroPanel;
