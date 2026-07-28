import { Metadata } from 'next';
import Notice from '@codegouvfr/react-dsfr/Notice';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import FranceConnectSection from './components/FranceConnectSection';
import NoFranceConnectSection from './components/NoFranceConnectSection';
import PostLoginFlow from './components/PostLoginFlow';
import BeneficiaryRecap from './components/BeneficiaryRecap';
import { loadPocResult } from '@/app/v2/api/poc-fc-api-particulier/session';
import { findJobForSub } from '@/app/services/queue';
import { findResultsForSub } from '@/app/services/applications';
import { IS_LOCAL_ENV } from '@/app/constants/env';
import styles from './styles.module.scss';

export const metadata: Metadata = {
  title: 'POC FranceConnect + API Particulier - pass Sport',
  description: 'Démonstrateur : connexion FranceConnect puis appel API Particulier côté serveur.',
};

const ERROR_MESSAGES: Record<string, string> = {
  login: 'Impossible de démarrer la connexion FranceConnect.',
  state: 'Échec de la vérification de sécurité (state). Veuillez réessayer.',
  callback: "Erreur lors de l'échange avec FranceConnect ou API Particulier.",
  access_denied: 'Vous avez refusé la connexion FranceConnect.',
  logout_state: 'Vous avez été déconnecté (vérification de sécurité incomplète).',
};

// Rendered on the server, where the container clock is UTC — so pin the timezone
// explicitly, otherwise the displayed hour is off for the user. fr-FR `short` gives
// DD/MM/YYYY, `medium` gives HH:MM:SS.
const formatJobDate = (ms: number | undefined): { iso: string; label: string } | null => {
  if (ms === undefined || Number.isNaN(ms)) {
    return null;
  }
  const date = new Date(ms);
  return {
    iso: date.toISOString(),
    label: new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'Europe/Paris',
    }).format(date),
  };
};

interface Props {
  searchParams: Promise<{ error?: string; status?: string }>;
}

export default async function PocFcApiParticulier({ searchParams }: Props) {
  const { error, status } = await searchParams;
  const result = await loadPocResult();
  // A returning FranceConnect user keeps the same `sub`, which is the job id — so a
  // request submitted in an earlier session is still findable after reconnecting.
  const existingJob = result ? await findJobForSub(result.sub) : null;
  // Empty while the job is still queued — the generic status block below covers that.
  const results = result ? await findResultsForSub(result.sub) : [];

  // Raw FranceConnect identity + API Particulier response dumps (including their
  // errors) are debug-only and restricted to the local environment.
  const debuggingEnabled = IS_LOCAL_ENV && process.env.API_PARTICULIER_DEBUGGING_ENABLED === 'true';
  const existingJobDate = formatJobDate(existingJob?.createdAt);

  // The two sources carry different instants: the BullMQ record holds the enqueue
  // time, while Postgres holds the moment the rows were committed. Word the line to
  // match rather than calling both "enregistrée".
  const existingJobDateLabel =
    existingJob?.state === 'processed' ? 'Demande traitée le' : 'Demande enregistrée le';

  return (
    <main
      className="fr-container fr-py-6w"
      tabIndex={-1}
      id={SKIP_LINKS_ID.mainContent}
      role="main"
    >
      <h1>POC FranceConnect + API Particulier</h1>
      <p className="fr-text--lead">
        Démonstrateur : authentification via FranceConnect, puis saisie des aides et de la commune ;
        l&apos;appel à API Particulier n&apos;est réalisé côté serveur qu&apos;une fois ces
        informations confirmées.
      </p>

      {error && (
        <div className="fr-alert fr-alert--error fr-my-3w">
          <p>{ERROR_MESSAGES[error] ?? `Une erreur est survenue (${error}).`}</p>
        </div>
      )}

      {status === 'loggedout' && (
        <Notice severity="info" className="fr-my-3w" isClosable title="Vous avez été déconnecté." />
      )}

      {!result ? (
        <section className={styles.section}>
          <Notice
            severity="info"
            className="fr-mb-3w"
            title="Connectez-vous avec FranceConnect"
            description="Nous vous demanderons ensuite vos aides et votre commune, puis nous vérifierons votre situation directement auprès des administrations en charge. Si l'information est disponible, vous n'aurez pas de justificatifs à fournir."
          />

          <p className="fr-mb-2w">
            Connectez-vous avec FranceConnect pour récupérer les codes pass Sport.
          </p>
          <FranceConnectSection />

          <NoFranceConnectSection />
        </section>
      ) : (
        <section className={styles.section}>
          <div className="fr-alert fr-alert--success fr-mb-3w">
            <p>Connexion FranceConnect réussie.</p>
          </div>

          {debuggingEnabled && (
            <>
              <h2 className="fr-h4">Identité FranceConnect</h2>
              <pre className={styles.payload}>{JSON.stringify(result.identity, null, 2)}</pre>
            </>
          )}

          {existingJob ? (
            <>
              {/* Rows exist only once the worker committed, so this is the verdict itself
                  rather than a status. Same component the polling panel renders, so a
                  returning user and a just-submitted one read exactly the same thing. */}
              {results.length > 0 ? (
                <BeneficiaryRecap beneficiaries={results} />
              ) : (
                <div className="fr-alert fr-alert--info fr-mb-3w" role="status">
                  <h2 className="fr-alert__title">Demande déjà enregistrée</h2>
                  <p>
                    Votre demande est en cours de traitement. Le résultat vous sera envoyé par
                    email.
                  </p>
                </div>
              )}
              {existingJobDate && (
                <p>
                  {existingJobDateLabel}{' '}
                  <time dateTime={existingJobDate.iso}>{existingJobDate.label}</time>.
                </p>
              )}
            </>
          ) : (
            <PostLoginFlow />
          )}
          {/* Logout moved to the header quick-access item ("Se déconnecter"),
              shown while the POC session is live (see the root layout). */}
        </section>
      )}
    </main>
  );
}
