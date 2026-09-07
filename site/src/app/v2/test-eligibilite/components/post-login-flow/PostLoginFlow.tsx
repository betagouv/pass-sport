'use client';

import { useState } from 'react';
import PostLoginInfoForm from './PostLoginInfoForm';
import ResultPanel from './ResultPanel';
import type { AllocataireIdentity } from './BeneficiaryRecap';
import cn from 'classnames';
import styles from './style.module.scss';

interface Props {
  allocataireIdentity: AllocataireIdentity;
}

export default function PostLoginFlow({ allocataireIdentity }: Props) {
  const [queued, setQueued] = useState(false);

  if (queued) {
    return <ResultPanel allocataireIdentity={allocataireIdentity} />;
  }

  return (
    <>
      <div className={cn(styles.background)}>
        <div className={styles.wrapper}>
          <h2 className="fr-h4 fr-mb-2w">Vos informations</h2>

          <p className="text--italic">
            Tous les champs ci-dessous sont obligatoires <span className="text--required">*</span>
          </p>

          {/*<p className="fr-my-2w">*/}
          {/*  Indiquez les aides dont vous bénéficiez et votre commune de résidence pour recevoir*/}
          {/*  votre code pass Sport par email.*/}
          {/*</p>*/}

          <PostLoginInfoForm onQueued={() => setQueued(true)} />
        </div>
      </div>
    </>
  );
}
