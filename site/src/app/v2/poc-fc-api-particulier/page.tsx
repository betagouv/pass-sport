import { Metadata } from 'next';
import Link from 'next/link';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import FranceConnectSection from './components/FranceConnectSection';
import EligibilitySection from './components/EligibilitySection';
import IdentityForm from './components/IdentityForm';
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

  return (
    <main
      className="fr-container fr-py-6w"
      tabIndex={-1}
      id={SKIP_LINKS_ID.mainContent}
      role="main"
    >
      <h1>POC FranceConnect + API Particulier</h1>
      <p className="fr-text--lead">
        Démonstrateur : authentification via FranceConnect, puis appel à API Particulier réalisé
        côté serveur une fois la connexion accordée.
      </p>

      {error && (
        <div className="fr-alert fr-alert--error fr-my-3w">
          <p>{ERROR_MESSAGES[error] ?? `Une erreur est survenue (${error}).`}</p>
        </div>
      )}

      {status === 'loggedout' && (
        <div className="fr-alert fr-alert--info fr-my-3w">
          <p>Vous avez été déconnecté.</p>
        </div>
      )}

      {!result ? (
        <section className={styles.section}>
          <h2 className="fr-h4 fr-mb-2w">Connexion</h2>
          <p className="fr-mb-2w">
            Connectez-vous avec FranceConnect pour lancer la démonstration.
          </p>
          <FranceConnectSection />

          <hr className="fr-mt-3w" />

          <h2 className="fr-h4">Je ne peux pas utiliser FranceConnect</h2>
          <p>Renseignez vos informations pour vérifier votre situation.</p>
          <IdentityForm />
        </section>
      ) : (
        <section className={styles.section}>
          <div className="fr-alert fr-alert--success fr-mb-3w">
            <p>
              {result.mode === 'formulaire'
                ? 'Informations bien reçues.'
                : 'Connexion FranceConnect réussie.'}
            </p>
          </div>

          <h2 className="fr-h4">
            {result.mode === 'formulaire' ? 'Identité renseignée' : 'Identité FranceConnect'}
          </h2>
          <pre className={styles.payload}>{JSON.stringify(result.identity, null, 2)}</pre>

          <h2 className="fr-h4 fr-mt-3w">Réponses API Particulier</h2>
          {result.apiParticulier.map((res) => (
            <section key={res.resource} className="fr-mb-3w">
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

          <h2 className="fr-h4 fr-mt-3w">Éligibilité pass Sport (LCA)</h2>
          <EligibilitySection
            candidates={listBeneficiaryCandidates(result.identity, result.apiParticulier)}
            hasStoredResidence={!!result.residenceInsee}
          />

          <Link
            href="/v2/api/poc-fc-api-particulier/logout"
            className="fr-btn fr-btn--secondary fr-mt-3w"
          >
            {result.mode === 'formulaire' ? 'Terminer' : 'Terminer et me déconnecter'}
          </Link>
        </section>
      )}
    </main>
  );
}
