import { Metadata } from 'next';
import Notice from '@codegouvfr/react-dsfr/Notice';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import FranceConnectSection from './components/FranceConnectSection';
import NoFranceConnectSection from './components/NoFranceConnectSection';
import PostLoginFlow from './components/PostLoginFlow';
import { loadPocResult } from '@/app/v2/api/poc-fc-api-particulier/session';
import { listBeneficiaryCandidates } from '@/app/services/lca-bridge';
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

interface Props {
  searchParams: Promise<{ error?: string; status?: string }>;
}

export default async function PocFcApiParticulier({ searchParams }: Props) {
  const { error, status } = await searchParams;
  const result = await loadPocResult();
  // Raw identity + API Particulier response dumps are debug-only.
  const debuggingEnabled = process.env.API_PARTICULIER_DEBUGGING_ENABLED === 'true';

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

          {debuggingEnabled && result.apiParticulier && (
            <>
              <h2 className="fr-h4">Identité FranceConnect</h2>
              <pre className={styles.payload}>{JSON.stringify(result.identity, null, 2)}</pre>

              <h2 className="fr-h4 fr-mt-3w">Réponses API Particulier</h2>
              {result.apiParticulier.map((res) => (
                <section key={`${res.resource}:${res.childIndex ?? 'self'}`} className="fr-mb-3w">
                  <h3 className="fr-h6">
                    {res.label} ({res.httpStatus ?? '—'})
                  </h3>
                  {res.error ? (
                    <div className="fr-alert fr-alert--warning fr-alert--sm">
                      <p>{res.error}</p>
                    </div>
                  ) : (
                    <pre className={styles.payload}>{JSON.stringify(res.data, null, 2)}</pre>
                  )}
                </section>
              ))}
            </>
          )}

          <PostLoginFlow
            collected={Boolean(result.apiParticulier)}
            candidates={
              result.apiParticulier
                ? listBeneficiaryCandidates(result.identity, result.apiParticulier)
                : []
            }
            residenceInsee={result.residenceInsee ?? ''}
            aides={result.aides ?? []}
          />
          {/* Logout moved to the header quick-access item ("Se déconnecter"),
              shown while the POC session is live (see the root layout). */}
        </section>
      )}
    </main>
  );
}
