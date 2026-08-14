import { Metadata } from 'next';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import { consumeVerificationToken } from '@/app/services/email-verification';
import { enqueueApiParticulierJob } from '@/app/services/queue';
import { findResultForJobId } from '@/app/services/applications';

export const metadata: Metadata = {
  title: 'Vérification de votre adresse e-mail - pass Sport',
  // The URL carries a token. Nothing here should end up in an index.
  robots: { index: false, follow: false },
};

// The token is single-use, so a cached render would show a stale verdict to the next visitor.
export const dynamic = 'force-dynamic';

const PREFETCH_GRACE_MS = 10 * 60 * 1000;

type Panel = {
  severity: 'success' | 'info' | 'warning' | 'error';
  title: string;
  body: ReactElement;
};

const restartLink = (
  <p className="fr-mb-0">
    <Link href="/v2/test-eligibilite">Refaire le test d’éligibilité</Link>
  </p>
);

const alreadyHandled = (mailbox: string | null): Panel => ({
  severity: 'info',
  title: 'Adresse déjà confirmée',
  body: (
    <>
      <p className="fr-mb-1w">
        Ce lien a déjà été ouvert et votre demande est
        {mailbox ? ' traitée' : ' en cours de traitement'}.
      </p>
      {mailbox && (
        <p className="fr-mb-1w">
          Le résultat a été envoyé à <strong>{mailbox}</strong>. L’adresse est partiellement
          masquée&nbsp;; elle sert seulement à vous rappeler quelle boîte consulter.
        </p>
      )}
      <p className="fr-mb-0">
        Pensez à vérifier vos courriers indésirables si vous ne trouvez pas le courriel.
      </p>
    </>
  ),
});

const resolve = async (token: string): Promise<Panel> => {
  const outcome = await consumeVerificationToken(token);

  if (outcome.status === 'error') {
    return {
      severity: 'error',
      title: 'Vérification indisponible',
      body: (
        <p className="fr-mb-0">
          Nous ne parvenons pas à traiter ce lien pour le moment. Réessayez dans quelques minutes
          &nbsp;: le lien reste valable.
        </p>
      ),
    };
  }

  if (outcome.status === 'unknown' || outcome.status === 'expired') {
    return {
      severity: 'warning',
      title: outcome.status === 'expired' ? 'Lien expiré' : 'Lien invalide',
      body: (
        <>
          <p className="fr-mb-1w">
            {outcome.status === 'expired'
              ? 'Ce lien a dépassé sa durée de validité de 24 heures.'
              : 'Ce lien ne correspond à aucune demande.'}
          </p>
          {restartLink}
        </>
      ),
    };
  }

  const confirmed: Panel = {
    severity: 'success',
    title: 'Adresse confirmée',
    body: (
      <>
        <p className="fr-mb-1w">
          Votre demande est en cours de traitement. Nous vérifions vos droits auprès des organismes
          concernés.
        </p>
        <p className="fr-mb-0">
          Vous recevrez le résultat par courriel à cette même adresse. Pensez à vérifier vos
          courriers indésirables.
        </p>
      </>
    ),
  };

  if (outcome.status === 'already_consumed') {
    if (Date.now() - outcome.consumedAt.getTime() < PREFETCH_GRACE_MS) {
      return confirmed;
    }

    return alreadyHandled((await findResultForJobId(outcome.jobId))?.emailMask ?? null);
  }

  const { existing } = await enqueueApiParticulierJob(outcome.payload);

  if (existing) {
    return alreadyHandled(
      existing.state === 'processed'
        ? ((await findResultForJobId(outcome.jobId))?.emailMask ?? null)
        : null,
    );
  }

  return confirmed;
};

const VerificationEmail = async ({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) => {
  const { token } = await searchParams;
  const panel = await resolve(token ?? '');

  return (
    <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
      <PageTitle title="Vérification de votre adresse e-mail" />

      <section className="fr-container fr-my-6w">
        <Alert
          role="status"
          severity={panel.severity}
          title={panel.title}
          description={panel.body}
        />
      </section>
    </main>
  );
};

export default VerificationEmail;
