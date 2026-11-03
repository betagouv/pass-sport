'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Alert from '@codegouvfr/react-dsfr/Alert';
import Button from '@codegouvfr/react-dsfr/Button';
import { IS_LOCAL_ENV } from '@/app/constants/env';
import {
  DN_CLOSED_STATES,
  DN_SUBMITTED_STATES,
  type DnDossier,
  type DnDossierLink,
} from '@/app/services/dn-dossier-rules';
import { MATOMO_CATEGORY, trackEvent } from '@/utils/matomo';

const MATOMO_ACTION = 'dossier DN';
const DOSSIER_ENDPOINT = '/api/france-connect/dossier';

// Within the nginx /api/ bucket (20 r/m, burst 10) shared with the rest of the page.
export const POLL_INTERVAL_MS = 3_000;
export const MAX_POLLS = 15;

const GENERIC_ERROR =
  'Votre dossier n’a pas pu être préparé. Merci de réessayer dans quelques instants.';
const TOO_LONG =
  'La préparation de votre dossier prend plus de temps que prévu. Merci de réessayer.';
const SESSION_EXPIRED =
  'Votre session a expiré. Reconnectez-vous avec FranceConnect pour accéder à votre dossier.';
const UNAVAILABLE = 'Ce service n’est pas disponible pour le moment.';

const SECTION_TITLE = 'Faire vérifier votre éligibilité';
const FOLLOW_UP = 'Suivez son avancement sur Démarche Numérique.';

type PollAnswer =
  { status: 'pending' | 'failed' | 'none' } | { status: 'ready'; dossier: DnDossier };

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; dossier: DnDossier }
  | { kind: 'error'; message: string; retry: boolean };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The fake DN of a local stack answers on http.
const SAFE_URL = IS_LOCAL_ENV ? /^https?:\/\// : /^https:\/\//;

const poll = async (): Promise<PollAnswer | 'transient' | 'expired'> => {
  try {
    const res = await fetch(DOSSIER_ENDPOINT);
    if (res.status === 401) return 'expired';
    // A 429 from the rate limiter or a 5xx blip: the next tick asks again.
    if (!res.ok) return 'transient';
    return (await res.json()) as PollAnswer;
  } catch {
    return 'transient';
  }
};

const DossierAnchor = ({ url, label }: { url: string; label: string }) =>
  SAFE_URL.test(url) ? (
    // matomo_ignore: until the dossier is claimed, its URL is the key to it.
    <a
      className="fr-btn matomo_ignore fr-mt-1w"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${label} sur Démarche Numérique - nouvelle fenêtre`}
      onClick={() => trackEvent(MATOMO_CATEGORY.franceConnectRequest, MATOMO_ACTION, 'ouvert')}
    >
      {label} sur Démarche Numérique
    </a>
  ) : null;

// Its state may have moved on since the page read it: the title leaves it to DN's page.
// The actions alone, an error on them first: the dossier's own alert stands above the section,
// right under the page's FranceConnect alert.
const DnSection = ({ children }: { children: ReactNode }) => {
  const titleId = useId();
  return (
    <section className="fr-mb-6w" aria-labelledby={titleId}>
      <h2 id={titleId} className="fr-h3 fr-mb-1w">
        {SECTION_TITLE}
      </h2>
      {children}
    </section>
  );
};

const KnownDossier = ({ link }: { link: DnDossierLink }) => (
  <>
    <Alert
      severity="info"
      as="h2"
      className="fr-mb-3w"
      // Shown on load: nothing to announce.
      role={undefined}
      title={`Votre dossier n° ${link.number}`}
      description={FOLLOW_UP}
    />
    <DnSection>
      <DossierAnchor url={link.url} label="Suivre mon dossier" />
    </DnSection>
  </>
);

const readyView = (dossier: DnDossier) => {
  if (DN_CLOSED_STATES.includes(dossier.state)) {
    return {
      title: `Votre dossier n° ${dossier.number} a été traité`,
      label: 'Consulter mon dossier',
      toComplete: false,
    };
  }
  if (DN_SUBMITTED_STATES.includes(dossier.state)) {
    return {
      title: `Votre dossier n° ${dossier.number} a été déposé`,
      label: 'Suivre mon dossier',
      toComplete: false,
    };
  }
  return {
    title: `Votre dossier n° ${dossier.number} est prêt`,
    label: 'Compléter mon dossier',
    toComplete: true,
  };
};

const ReadyDossier = ({ dossier }: { dossier: DnDossier }) => {
  const { title, toComplete } = readyView(dossier);

  return (
    <Alert
      severity="success"
      as="h2"
      className="fr-mb-3w"
      // The live region around it announces it: no second, nested one.
      role={undefined}
      title={title}
      description={
        toComplete ? (
          <>
            <ol className="fr-mb-2w">
              <li>
                Connectez-vous à Démarche Numérique, de préférence{' '}
                <strong>avec FranceConnect</strong>.
              </li>
              <li>Vérifiez et complétez les informations pré-remplies.</li>
              <li>Joignez vos justificatifs.</li>
              <li>Déposez votre dossier.</li>
            </ol>
            <p className="fr-mb-0">Ce lien vous est personnel : ne le partagez pas.</p>
          </>
        ) : (
          FOLLOW_UP
        )
      }
    />
  );
};

interface Props {
  // The usager already holds a dossier: the button hands it back rather than announcing one.
  hasDossier: boolean;
  // Its stable link, when it has one: shown at once, without asking DN again.
  link?: DnDossierLink | null;
}

export default function DnDossierButton({ hasDossier, link = null }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const descriptionId = useId();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const show = (next: State) => {
    if (mounted.current) setState(next);
  };

  const fail = (name: string, message = GENERIC_ERROR, retry = true) => {
    trackEvent(MATOMO_CATEGORY.franceConnectRequest, MATOMO_ACTION, name);
    show({ kind: 'error', message, retry });
  };

  const request = async () => {
    setState({ kind: 'loading' });
    trackEvent(MATOMO_CATEGORY.franceConnectRequest, MATOMO_ACTION, 'demandé');

    try {
      const res = await fetch(DOSSIER_ENDPOINT, { method: 'POST' });

      if (res.status === 401) return fail('session expirée', SESSION_EXPIRED, false);
      if (res.status === 403 || res.status === 404) return fail('indisponible', UNAVAILABLE, false);
      if (res.status !== 202) return fail('erreur');
    } catch {
      return fail('erreur');
    }

    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      // The worker usually answers within a second: the first check goes out at once.
      if (attempt > 0) await wait(POLL_INTERVAL_MS);
      if (!mounted.current) return;

      const answer = await poll();

      if (answer === 'expired') return fail('session expirée', SESSION_EXPIRED, false);
      if (answer === 'transient' || answer.status === 'pending') continue;

      if (answer.status === 'ready') {
        trackEvent(MATOMO_CATEGORY.franceConnectRequest, MATOMO_ACTION, 'prêt');
        return show({ kind: 'ready', dossier: answer.dossier });
      }

      return fail('échec');
    }

    fail('délai dépassé', TOO_LONG);
  };

  if (link) return <KnownDossier link={link} />;

  const showButton = state.kind !== 'ready' && !(state.kind === 'error' && !state.retry);
  const buttonLabel =
    state.kind === 'loading'
      ? hasDossier
        ? 'Recherche de votre dossier…'
        : 'Préparation de votre dossier…'
      : state.kind === 'error'
        ? 'Réessayer'
        : hasDossier
          ? 'Retrouver mon dossier'
          : 'Vous pensez être éligible ?';

  return (
    <>
      {/* Present from the first render, so the dossier's arrival is announced. */}
      <div role="status" aria-live="polite">
        {state.kind === 'ready' && <ReadyDossier dossier={state.dossier} />}
      </div>

      <DnSection>
        {state.kind === 'error' && (
          <div className="fr-alert fr-alert--error fr-alert--sm fr-mb-2w" role="alert">
            <p>{state.message}</p>
          </div>
        )}

        {state.kind === 'ready' && (
          <DossierAnchor url={state.dossier.url} label={readyView(state.dossier).label} />
        )}

        {showButton && (
          <>
            <Button
              onClick={request}
              disabled={state.kind === 'loading'}
              nativeButtonProps={{ 'aria-describedby': descriptionId }}
            >
              {buttonLabel}
            </Button>
            <p id={descriptionId} className="fr-mt-1w fr-text--sm">
              {hasDossier
                ? 'Nous recherchons votre dossier de vérification sur Démarche Numérique, puis vous donnons le lien pour l’ouvrir.'
                : 'Nous vous préparons un dossier de vérification sur Démarche Numérique, pré-rempli avec les informations transmises par FranceConnect et par les organismes consultés (CAF ou MSA, CNOUS). Vous pourrez le vérifier, le compléter et joindre vos justificatifs avant de le déposer.'}
            </p>
          </>
        )}
      </DnSection>
    </>
  );
}
