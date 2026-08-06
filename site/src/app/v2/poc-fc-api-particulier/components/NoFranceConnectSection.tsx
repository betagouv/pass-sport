'use client';

import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import AllowanceStep from '@/app/v2/test-eligibilite/components/allowance-step/AllowanceStep';
import styles from '../styles.module.scss';

interface Props {
  // Narrows the radio choices when aides were already selected (post-collect);
  // empty before the info form is confirmed.
  preselectedAllowances?: ALLOWANCE[];
}

export default function NoFranceConnectSection({ preselectedAllowances = [] }: Props) {
  return (
    <>
      <div className={styles.orSeparator} role="presentation">
        <span>Ou</span>
      </div>

      <h2 className="fr-h4">Je ne peux pas utiliser FranceConnect</h2>
      <div className={styles['eligibility-embed']}>
        <AllowanceStep preselectedAllowances={preselectedAllowances} autoFocusFirstField={false} />
      </div>
    </>
  );
}
