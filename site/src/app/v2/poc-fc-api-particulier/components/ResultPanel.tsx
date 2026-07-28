'use client';

import { useEffect, useState } from 'react';
import type { BeneficiaryResult } from '@/app/services/applications';
import BeneficiaryRecap from './BeneficiaryRecap';

const POLL_INTERVAL_MS = 2_000;
// 2 minutes. The nominal job is a few seconds (sequential HTTP, no fan-out), but a 429
// requeues it for the full API Particulier reset window and a real failure retries at
// 1/2/3 min — neither is worth waiting for on screen. Well inside the 10-minute session
// TTL, so an expired session stays an edge case rather than the usual ending.
const MAX_POLLS = 60;

type State =
  | { kind: 'polling' }
  | { kind: 'gave_up' }
  | { kind: 'done'; beneficiaries: BeneficiaryResult[] };

export default function ResultPanel() {
  const [state, setState] = useState<State>({ kind: 'polling' });

  useEffect(() => {
    let polls = 0;
    let cancelled = false;

    const timer = setInterval(async () => {
      polls += 1;

      if (polls > MAX_POLLS) {
        clearInterval(timer);
        if (!cancelled) setState({ kind: 'gave_up' });
        return;
      }

      try {
        const res = await fetch('/v2/api/poc-fc-api-particulier/result');
        if (cancelled) return;

        // 401 = the session died before the worker finished. Nothing to retry.
        if (!res.ok) {
          clearInterval(timer);
          setState({ kind: 'gave_up' });
          return;
        }

        const body = (await res.json()) as
          | { status: 'pending' }
          | { status: 'done'; beneficiaries: BeneficiaryResult[] };

        if (cancelled) return;

        if (body.status === 'done') {
          clearInterval(timer);
          setState({ kind: 'done', beneficiaries: body.beneficiaries });
        }
      } catch {
        // A transient network blip should not end the poll — the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (state.kind === 'done') {
    // aria-live: the recap replaces the "en cours" block with no navigation and no reload,
    // so a screen reader has to be told it arrived.
    return (
      <div role="status" aria-live="polite">
        <BeneficiaryRecap beneficiaries={state.beneficiaries} />
      </div>
    );
  }

  return (
    <div className="fr-alert fr-alert--info fr-mb-3w" role="status" aria-live="polite">
      <h2 className="fr-alert__title">Demande enregistrée</h2>
      <p>
        {state.kind === 'polling'
          ? 'Vérification de votre éligibilité en cours…'
          : 'La vérification prend plus de temps que prévu. Le résultat vous sera envoyé par email.'}
      </p>
    </div>
  );
}
