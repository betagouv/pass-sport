'use client';

import { useState } from 'react';
import Alert from '@codegouvfr/react-dsfr/Alert';
import Button from '@codegouvfr/react-dsfr/Button';
import { MATOMO_CATEGORY, trackEvent } from '@/utils/matomo';

const MATOMO_ACTION = 'relance verification';

const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));

interface RelanceButtonProps {
  availableAt: string | null;
}

export default function RelanceButton({ availableAt }: RelanceButtonProps) {
  const [queued, setQueued] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(availableAt);
  const [jobRunning, setJobRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rerun = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/france-connect/relance', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        availableAt?: string;
        error?: string;
      };

      if (res.status === 202) {
        trackEvent(MATOMO_CATEGORY.franceConnectRequest, MATOMO_ACTION, 'enregistrée');
        setQueued(true);
        return;
      }

      if (res.status === 429) {
        trackEvent(MATOMO_CATEGORY.franceConnectRequest, MATOMO_ACTION, 'quota');
        setBlockedUntil(body.availableAt ?? null);
        return;
      }

      if (res.status === 409) {
        trackEvent(MATOMO_CATEGORY.franceConnectRequest, MATOMO_ACTION, 'déjà en cours');
        setJobRunning(true);
        return;
      }

      trackEvent(MATOMO_CATEGORY.franceConnectRequest, MATOMO_ACTION, 'erreur');
      setError(body.error ?? 'Une erreur est apparue. Merci de réessayer ultérieurement.');
    } catch {
      trackEvent(MATOMO_CATEGORY.franceConnectRequest, MATOMO_ACTION, 'erreur');
      setError('Une erreur est apparue. Merci de réessayer ultérieurement.');
    } finally {
      setIsLoading(false);
    }
  };

  if (queued) {
    return (
      <Alert
        severity="info"
        as="h3"
        className="fr-mt-3w"
        title="Votre demande de vérification est enregistrée"
        description="Elle sera traitée dans les prochaines heures. Revenez consulter votre espace plus tard ; si un droit s’ouvre, votre code vous sera envoyé par courrier électronique."
      />
    );
  }

  if (jobRunning) {
    return (
      <Alert
        severity="info"
        as="h3"
        className="fr-mt-3w"
        title="Une vérification est déjà en cours"
        description="Revenez consulter votre espace une fois qu’elle sera terminée."
      />
    );
  }

  return (
    <div className="fr-mt-3w">
      <h2 className="fr-h3">Votre situation a changé&nbsp;?</h2>
      <p className="fr-mb-1w">
        Pour obtenir un code pass Sport, vous devez vous connecter avec le compte FranceConnect de
        la personne qui bénéficie de l&apos;aide.
      </p>

      {blockedUntil ? (
        <>
          <Button disabled>Relancer la vérification</Button>
          <p className="fr-mt-1w">
            Votre dernière vérification est récente. Nouvelle vérification possible le{' '}
            <time dateTime={blockedUntil}>{formatDate(blockedUntil)}</time>.
          </p>
        </>
      ) : (
        <Button onClick={rerun} disabled={isLoading}>
          {isLoading ? 'Envoi en cours…' : 'Relancer la vérification'}
        </Button>
      )}

      {error && (
        <div className="fr-alert fr-alert--error fr-alert--sm fr-mt-2w" role="alert">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
