import { format, parse } from 'date-fns';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { BeneficiaryResult, Verdict } from '@/app/services/applications';
import type { PivotIdentity } from '@/app/services/eligibility-job';
import Card from '@codegouvfr/react-dsfr/Card';
import { Badge } from '@codegouvfr/react-dsfr/Badge';
import type { AlertProps } from '@codegouvfr/react-dsfr/Alert';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

const BIRTHDATE_INPUT_FORMAT = 'yyyy-MM-dd';
const BIRTHDATE_DISPLAY_FORMAT = 'dd/MM/yyyy';

const formatBirthdate = (birthdate: string): string =>
  format(parse(birthdate, BIRTHDATE_INPUT_FORMAT, new Date()), BIRTHDATE_DISPLAY_FORMAT);

// Exported so PostLoginFlow/ResultPanel — which sit between the page and this component in
// the just-submitted, still-polling flow — can type the same prop through without redeclaring
// the subset of PivotIdentity this component actually needs.
export type AllocataireIdentity = Pick<PivotIdentity, 'given_name' | 'family_name' | 'birthdate'>;

// application_results_by_sub deliberately exposes only a first name for 'enfant' rows (see
// the Verdict comment in @/app/services/applications) — full name and birthdate are only
// ever known for the allocataire themselves, from their own FranceConnect session identity.
const who = (b: BeneficiaryResult, allocataireIdentity: AllocataireIdentity): string => {
  if (b.source !== 'self') {
    return b.givenName ?? 'Votre enfant';
  }
  const { given_name, family_name, birthdate } = allocataireIdentity;
  const name = [family_name, given_name].filter(Boolean).join(' ');
  return birthdate ? `${name}, né(e) le ${formatBirthdate(birthdate)}` : name;
};

type StatusDisplay = {
  severity: AlertProps.Severity;
  label: string;
};

// eligible_pending_lca and eligible_confirmed_but_email_not_matching sit with the pending
// statuses rather than with eligible_confirmed: each still needs a step to settle (LCA serving
// the code, or the email mismatch being resolved), so from the applicant's point of view the
// process is still ongoing rather than settled. eligible_confirmed_but_email_not_matching never
// actually reaches this component (see the Verdict comment above) but the map stays exhaustive
// so a future Verdict addition fails to compile here instead of silently vanishing from display.
const STATUS_DISPLAY_BY_VERDICT: Record<Verdict, StatusDisplay> = {
  eligible_confirmed: { severity: 'success', label: 'Eligible' },
  eligible_confirmed_but_email_not_matching: { severity: 'info', label: 'En cours de traitement' },
  eligible_pending: { severity: 'info', label: 'En cours de traitement' },
  eligible_pending_lca: { severity: 'info', label: 'En cours de traitement' },
  not_assessed: { severity: 'info', label: 'En cours de traitement' },
  not_eligible: { severity: 'error', label: 'Non-Eligible' },
};

// Shared verbatim between the eligible_confirmed-without-code and eligible_pending(_lca) cases
// below, and re-exported for page.tsx's "Demande déjà enregistrée" card, which opens with this
// exact sentence before adding its own FAQ mention.
export const PENDING_CODE_MESSAGE =
  'Vous allez recevoir votre code individuel par courrier électronique dans les prochains jours. Si vous n’avez pas reçu votre code dans les 72 heures, vous pourrez le retrouver dans votre espace en FC.';

// The per-card body, one beneficiary at a time — so, unlike the old per-status grouping, it
// never needs to pluralize "le/les" or "vous est/sont" over a list of names.
// eligible_pending_lca never shows the code it may already carry: the badge above already
// reads "en cours de traitement", and surfacing a code next to that would read as usable when
// the partner sports structure LCA does not serve it yet.
const verdictMessage = (b: BeneficiaryResult): ReactNode => {
  switch (b.verdict) {
    case 'eligible_confirmed':
      // Rows written before the code was stored carry a verdict but no code — for those,
      // the email stays the only place it can be read.
      return b.code ? (
        <>
          Le code pass Sport suivant est disponible&nbsp;: <strong>{b.code}</strong>. Vous pouvez le
          télécharger en cliquant sur le bouton &quot;Télécharger&quot;.
        </>
      ) : (
        PENDING_CODE_MESSAGE
      );
    case 'eligible_pending_lca':
    case 'eligible_pending':
      return PENDING_CODE_MESSAGE;
    case 'not_eligible':
      return (
        <>
          Vos informations ont été trouvées, mais vous ne remplissez pas les conditions requises
          pour bénéficier du pass Sport cette année. Si vous pensez qu’il s’agit d’une erreur, nous
          vous invitons à vérifier votre situation auprès de l’organisme concerné. Consultez la{' '}
          <Link href="/v2/une-question">FAQ</Link>.
        </>
      );
    case 'not_assessed':
    case 'eligible_confirmed_but_email_not_matching':
      return 'Aucun résultat n’est disponible pour le moment pour cette personne.';
  }
};

// Rendered into the Card's `footer` slot rather than alongside verdictMessage in `desc`: DownloadLink
// renders a <div>, which desc's own <p> wrapper cannot contain.
// 'self' only: /api/france-connect/pdf re-derives the identity from the FranceConnect session,
// and application_results_by_sub never carries enough of an enfant's identity (no family_name,
// no birthdate) to put their name on a document.
const downloadLink = (b: BeneficiaryResult): ReactNode | undefined => {
  if (b.source !== 'self' || b.verdict !== 'eligible_confirmed' || !b.code) {
    return undefined;
  }
  return (
    <DownloadLink
      details={`PDF — ${b.code}`}
      label="Télécharger"
      href="/api/france-connect/pdf"
      filename={`pass-sport-${b.code}.pdf`}
    />
  );
};

// Rendered into the Card's `start` slot: unlike `desc`, that slot is a plain div rather than a
// <p>, so it can safely sit above block content such as the beneficiary list in `footer`.
// Exported so the page-level "request already registered, no verdict yet" card (same meaning as
// the not_assessed verdict) can show the identical badge instead of duplicating the color map.
export const StatusBadge = ({ verdict }: { verdict: Verdict }) => {
  const { severity, label } = STATUS_DISPLAY_BY_VERDICT[verdict];
  return (
    <p className="fr-mb-0">
      <span className="fr-text--bold">Statut&nbsp;: </span>
      {/* Badge defaults to rendering as a <p>, which this wrapping <p> can't contain. */}
      <Badge as="span" severity={severity}>
        {label}
      </Badge>
    </p>
  );
};

interface Props {
  beneficiaries: BeneficiaryResult[];
  allocataireIdentity: AllocataireIdentity;
}

export default function BeneficiaryRecap({ beneficiaries, allocataireIdentity }: Props) {
  if (beneficiaries.length === 0) {
    return (
      <div className="fr-alert fr-alert--info fr-mb-3w">
        <h2 className="fr-alert__title">Demande enregistrée</h2>
        <p>
          Après vérification, nous n’avons pas retrouvé vos informations dans les bases de données
          des bénéficiaires, avec les informations saisies. Consultez la{' '}
          <Link href="/v2/une-question">FAQ</Link>.
        </p>
      </div>
    );
  }

  return (
    <section className="fr-mb-3w">
      <h2 className="fr-h4">Résultat de votre demande</h2>

      {beneficiaries.map((b, i) => (
        <Card
          key={`${b.source}-${i}`}
          className="fr-mb-2w"
          border
          title={who(b, allocataireIdentity)}
          titleAs="h3"
          start={<StatusBadge verdict={b.verdict} />}
          desc={verdictMessage(b)}
          footer={downloadLink(b)}
        />
      ))}
    </section>
  );
}
