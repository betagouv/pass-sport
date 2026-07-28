'use client';

// Reversed-flow post-login orchestrator. Rendered once FranceConnect has
// authenticated the user. The user fills the aides + commune form; confirming it
// enqueues an eligibility job (POST /collect -> 202) that the pass-sport-worker
// processes off-request and whose pass Sport code is delivered by email. The verdict
// itself is not delivered inline by that request — ResultPanel polls for it.

import { useState } from 'react';
import PostLoginInfoForm from './PostLoginInfoForm';
import NoFranceConnectSection from './NoFranceConnectSection';
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

      <NoFranceConnectSection />
    </>
  );
}
