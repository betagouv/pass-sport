'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@codegouvfr/react-dsfr/Card';
import type { BeneficiaryResult } from '@/app/services/applications';
import BeneficiaryRecap, { StatusBadge, type AllocataireIdentity } from './BeneficiaryRecap';

const POLL_INTERVAL_MS = 20_000;
const MAX_POLLS = 9;

// Same wording whether we're still polling or have given up after MAX_POLLS: from the usager's
// point of view both states mean "we don't have your result yet", and the recommended action
// (wait for the email, check the FAQ past 72h) doesn't change either way.
const STILL_PROCESSING_MESSAGE = (
  <>
    Vérification de votre éligibilité en cours. Vous allez recevoir un mail d&apos;information dans
    moins de 72h le temps de vérifier votre situation. Si votre demande dépasse le délai de 72h,
    merci de consulter la{' '}
    <Link href="/v2/une-question" className="fr-link">
      FAQ
    </Link>
    .
  </>
);

type State =
  | { kind: 'polling' }
  | { kind: 'gave_up' }
  | { kind: 'done'; beneficiaries: BeneficiaryResult[] };

interface Props {
  allocataireIdentity: AllocataireIdentity;
}

export default function ResultPanel({ allocataireIdentity }: Props) {
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
        <BeneficiaryRecap
          beneficiaries={state.beneficiaries}
          allocataireIdentity={allocataireIdentity}
        />
      </div>
    );
  }

  return (
    <Card
      className="fr-mb-3w"
      border
      nativeDivProps={{ role: 'status', 'aria-live': 'polite' }}
      title="Demande enregistrée"
      titleAs="h2"
      start={<StatusBadge verdict="not_assessed" />}
      desc={STILL_PROCESSING_MESSAGE}
    />
  );
}
