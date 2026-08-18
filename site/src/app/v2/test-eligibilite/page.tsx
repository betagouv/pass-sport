import { Metadata } from 'next';
import Notice from '@codegouvfr/react-dsfr/Notice';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import FranceConnectSection from './components/FranceConnectSection';
import NoFranceConnectSection from './components/NoFranceConnectSection';
import PostLoginFlow from './components/PostLoginFlow';
import BeneficiaryRecap from './components/BeneficiaryRecap';
import { loadPocResult } from '@/app/v2/api/france-connect/session';
import { findJobForSub } from '@/app/services/queue';
import { findResultsForSub } from '@/app/services/applications';
import { IS_LOCAL_ENV } from '@/app/constants/env';
import styles from './styles.module.scss';

export const metadata: Metadata = {
  title: 'Récupération du code | pass Sport',
  description: 'Démonstrateur : connexion FranceConnect puis appel API Particulier côté serveur.',
};

// Internal error keys, then the OpenID Connect errors FranceConnect can hand back on
// the redirect_uri (qualification criterion 24) — every one of them needs a sentence
// the user can act on rather than the raw code.
const ERROR_MESSAGES: Record<string, string> = {
  login: 'Impossible de démarrer la connexion FranceConnect.',
  state: 'Échec de la vérification de sécurité (state). Veuillez réessayer.',
  callback: "Erreur lors de l'échange avec FranceConnect ou API Particulier.",
  identity: "FranceConnect n'a pas transmis les informations d'identité attendues.",
  logout_state: 'Vous avez été déconnecté (vérification de sécurité incomplète).',
  access_denied: 'Vous avez refusé la connexion FranceConnect.',
  invalid_request: 'La demande de connexion était incomplète. Veuillez réessayer.',
  invalid_scope: 'La demande de connexion portait sur des données non autorisées.',
  invalid_client: "Le service n'est pas correctement déclaré auprès de FranceConnect.",
  unauthorized_client: "Le service n'est pas autorisé à utiliser cette connexion.",
  unsupported_response_type: 'Ce type de connexion FranceConnect n’est pas pris en charge.',
  server_error: 'FranceConnect a rencontré une erreur. Veuillez réessayer dans un instant.',
  temporarily_unavailable:
    'FranceConnect est momentanément indisponible. Veuillez réessayer plus tard.',
  login_required: 'Votre connexion FranceConnect a expiré. Veuillez vous reconnecter.',
  consent_required: 'Vous devez accepter le partage de vos données pour continuer.',
  interaction_required: 'FranceConnect a besoin d’une action de votre part pour continuer.',
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
      <h1>Récupération du code pass Sport</h1>

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

          <div className={styles.choiceGrid}>
            <div className={styles.choice}>
              <h2 className="fr-h4">S'authentifier avec FranceConnect</h2>
              <p>
                Nous vérifions vos droits directement auprès des administrations : aucun
                justificatif à fournir.
              </p>
              {/* Wording imposed by the FranceConnect FS qualification (criterion 1):
                  it must appear verbatim, directly above the button. */}
              <p className={styles.franceConnectIntro}>
                FranceConnect est la solution proposée par l’État pour sécuriser et simplifier la
                connexion à vos services en ligne.
              </p>
              <FranceConnectSection />
            </div>

            <div className={styles.choiceSeparator} role="presentation">
              <span>Ou</span>
            </div>

            <div className={styles.choice}>
              <h2 className="fr-h4">Je ne peux pas utiliser FranceConnect</h2>
              <p>Renseignez vous-même vos informations pour vérifier votre éligibilité.</p>
              <NoFranceConnectSection />
            </div>
          </div>
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
