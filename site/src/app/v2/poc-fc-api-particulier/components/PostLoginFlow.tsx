'use client';

// Reversed-flow post-login orchestrator. Rendered once FranceConnect has
// authenticated the user. Two stages, driven by the server session:
// - not yet collected (or user hit "Re-saisir") -> the aides + commune info form,
//   which calls API Particulier on confirm;
// - collected -> the batch LCA processing fires automatically (search + confirm
//   for every beneficiary, invisible to the user) and its per-beneficiary
//   results are displayed, plus the "Je ne peux pas utiliser FranceConnect"
//   alternative with the selected aides preselected.

import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@codegouvfr/react-dsfr/Button';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { BatchEligibilityResponse } from '@/app/v2/api/poc-fc-api-particulier/eligibility/types';
import EligibilitySection from './EligibilitySection';
import PostLoginInfoForm from './PostLoginInfoForm';
import NoFranceConnectSection from './NoFranceConnectSection';

interface Props {
  collected: boolean;
  residenceInsee: string;
  aides: ALLOWANCE[];
}

type Phase = 'idle' | 'loading' | 'done' | 'error';

export default function PostLoginFlow({ collected, residenceInsee, aides }: Props) {
  const [reediting, setReediting] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [batch, setBatch] = useState<BatchEligibilityResponse | null>(null);
  // Guards the auto-fire against the strict-mode double effect.
  const firedRef = useRef(false);

  const runEligibility = useCallback(async () => {
    setPhase('loading');
    try {
      const response = await fetch('/v2/api/poc-fc-api-particulier/eligibility', {
        method: 'POST',
      });
      if (!response.ok) {
        setPhase('error');
        return;
      }
      setBatch((await response.json()) as BatchEligibilityResponse);
      setPhase('done');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (!collected || reediting || firedRef.current) return;
    firedRef.current = true;
    runEligibility();
  }, [collected, reediting, runEligibility]);

  if (!collected || reediting) {
    return (
      <>
        <h2 className="fr-h4 fr-mb-2w">Vos informations</h2>
        <p className="fr-mb-2w">
          Indiquez les aides dont vous bénéficiez et votre commune de résidence pour vérifier votre
          éligibilité.
        </p>
        <PostLoginInfoForm
          initialAides={aides}
          initialResidenceInsee={residenceInsee}
          onCancel={collected ? () => setReediting(false) : undefined}
          onSuccess={() => {
            // New data collected: re-fire the batch on the refreshed render.
            firedRef.current = false;
            setBatch(null);
            setPhase('idle');
            setReediting(false);
          }}
        />

        <NoFranceConnectSection preselectedAllowances={aides} />
      </>
    );
  }

  const allConfirmed =
    phase === 'done' &&
    batch !== null &&
    batch.results.length > 0 &&
    batch.results.every((result) => result.status === 'confirmed');

  return (
    <div>
      {/* Once every code is delivered the session is destroyed server-side:
          re-editing (which POSTs /collect) would only hit a 401. */}
      {!allConfirmed && (
        <Button
          priority="secondary"
          type="button"
          className="fr-mb-3w"
          onClick={() => setReediting(true)}
        >
          Re-saisir les aides / la commune
        </Button>
      )}

      {phase === 'loading' && (
        <div className="fr-alert fr-alert--info fr-alert--sm fr-mb-2w">
          <p>Vérification de votre éligibilité en cours…</p>
        </div>
      )}

      {phase === 'error' && (
        <>
          <div className="fr-alert fr-alert--error fr-alert--sm fr-mb-2w">
            <p>La vérification de votre éligibilité a échoué. Réessayez dans quelques instants.</p>
          </div>
          <Button priority="secondary" type="button" className="fr-mb-3w" onClick={runEligibility}>
            Réessayer
          </Button>
        </>
      )}

      {phase === 'done' && batch && <EligibilitySection batch={batch} />}

      <NoFranceConnectSection preselectedAllowances={aides} />
    </div>
  );
}
