'use client';

import { useState } from 'react';
import PostLoginInfoForm from './PostLoginInfoForm';
import ResultPanel from './ResultPanel';

export default function PostLoginFlow() {
  const [queued, setQueued] = useState(false);

  if (queued) {
    return <ResultPanel />;
  }

  return (
    <>
      <h2 className="fr-h4 fr-mb-2w">Vos informations</h2>
      <p className="fr-mb-2w">
        Indiquez les aides dont vous bénéficiez et votre commune de résidence pour recevoir votre
        code pass Sport par email.
      </p>
      <PostLoginInfoForm onQueued={() => setQueued(true)} />
    </>
  );
}
