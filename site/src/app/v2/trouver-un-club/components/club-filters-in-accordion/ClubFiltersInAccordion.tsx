'use client';

import { useMediaQuery } from '@uidotdev/usehooks';
import Accordion from '@codegouvfr/react-dsfr/Accordion';
import ClubFilters, { ClubFiltersProps } from '../club-filters/ClubFilters';
import styles from './styles.module.scss';

const ClubFiltersInAccordion: React.FC<ClubFiltersProps> = (props) => {
  const isSmallDevice = useMediaQuery(`(max-width : sassVariables.$md)`);

  return (
    <div className={styles.box}>
      {isSmallDevice ? (
        <Accordion label="Afficher les filtres" className={styles['accordion-custom']}>
          <ClubFilters {...props} />
        </Accordion>
      ) : (
        <ClubFilters {...props} />
      )}
    </div>
  );
};

export default ClubFiltersInAccordion;
