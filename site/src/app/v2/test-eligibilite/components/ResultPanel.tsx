'use client';

import { useEffect, useState } from 'react';
import type { BeneficiaryResult } from '@/app/services/applications';
import BeneficiaryRecap from './BeneficiaryRecap';

const POLL_INTERVAL_MS = 20_000;
const MAX_POLLS = 9;

type State =
  | { kind: 'polling' }
  | { kind: 'gave_up' }
  | { kind: 'done'; beneficiaries: BeneficiaryResult[] };

export default function ResultPanel() {
  const [state, setState] = useState<State>({ kind: 'polling' });

  useEffect(() => {
    let polls = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const stop = (next: State) => {
      clearInterval(timer);
      if (!cancelled) setState(next);
    };

    const poll = async () => {
      polls += 1;

      if (polls > MAX_POLLS) {
        stop({ kind: 'gave_up' });
        return;
      }

      try {
        const res = await fetch('/api/france-connect/result');
        if (cancelled) return;

        // 401 = the session died before the worker finished. Nothing to retry.
        if (res.status === 401) {
          stop({ kind: 'gave_up' });
          return;
        }

        // Anything else — a 429 from the rate limiter, a 5xx blip — is transient.
        if (!res.ok) return;

        const body = (await res.json()) as
          | { status: 'pending' }
          | { status: 'done'; beneficiaries: BeneficiaryResult[] };

        if (cancelled) return;

        if (body.status === 'done') {
          stop({ kind: 'done', beneficiaries: body.beneficiaries });
        }
      } catch {
        // A transient network blip should not end the poll — the next tick retries.
      }
    };

    // The worker usually answers within seconds; waiting a whole interval before the
    // first check would sit on a spinner long after the result is ready.
    void poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);

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
