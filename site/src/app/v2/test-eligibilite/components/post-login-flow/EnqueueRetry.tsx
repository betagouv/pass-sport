'use client';

import { useState, type ReactNode } from 'react';
import Alert from '@codegouvfr/react-dsfr/Alert';
import Button from '@codegouvfr/react-dsfr/Button';
import ResultPanel from './ResultPanel';
import type { AllocataireIdentity } from './BeneficiaryRecap';

// Only ever rendered when the FranceConnect callback's own enqueue failed: the login went
// through but the job never reached Redis. The journey asks the usager nothing, so this is a
// single button rather than a form.
interface Props {
  allocataireIdentity: AllocataireIdentity;
  jobInfo?: ReactNode;
}

export default function EnqueueRetry({ allocataireIdentity, jobInfo }: Props) {
  const [queued, setQueued] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relaunch = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/france-connect/collect', { method: 'POST' });

      // 409: the job exists after all — their request is registered, which is what the
      // result panel is there to follow.
      if (res.ok || res.status === 409) {
        setQueued(true);
        return;
      }

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Une erreur est apparue. Merci de réessayer ultérieurement.');
    } catch {
      setError('Une erreur est apparue. Merci de réessayer ultérieurement.');
    } finally {
      setIsLoading(false);
    }
  };

  if (queued) {
    return <ResultPanel allocataireIdentity={allocataireIdentity} jobInfo={jobInfo} />;
  }

  return (
    <>
      <Alert
        severity="warning"
        as="h2"
        title="Votre demande n'a pas pu être enregistrée"
        description="Votre connexion FranceConnect a bien fonctionné. Relancez la vérification de votre situation."
      />

      <div className="fr-mt-2w">
        <Button onClick={relaunch} disabled={isLoading}>
          {isLoading ? 'Envoi en cours…' : 'Relancer la vérification'}
        </Button>
      </div>

      {error && (
        <div className="fr-alert fr-alert--error fr-alert--sm fr-mt-2w" role="alert">
          <p>{error}</p>
        </div>
      )}
    </>
  );
}
