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

export type AllocataireIdentity = Pick<
  PivotIdentity,
  'given_name' | 'family_name' | 'birthdate' | 'email'
>;

const formatIdentity = (
  familyName: string | null | undefined,
  givenName: string | null | undefined,
  birthdate: string | null | undefined,
  fallback: string,
): string => {
  const name = [familyName, givenName].filter(Boolean).join(' ') || fallback;
  return birthdate ? `${name}, né(e) le ${formatBirthdate(birthdate)}` : name;
};

const who = (b: BeneficiaryResult, allocataireIdentity: AllocataireIdentity): string => {
  if (b.source === 'self') {
    const { given_name, family_name, birthdate } = allocataireIdentity;
    return formatIdentity(family_name, given_name, birthdate, '');
  }
  return formatIdentity(b.familyName, b.givenName, b.birthdate, 'Votre enfant');
};

type StatusDisplay = {
  severity: AlertProps.Severity;
  label: string;
};

const STATUS_DISPLAY_BY_VERDICT: Record<Verdict, StatusDisplay> = {
  eligible_confirmed: { severity: 'success', label: 'Eligible' },
  eligible_confirmed_but_email_not_matching: { severity: 'info', label: 'En cours de traitement' },
  eligible_pending: { severity: 'info', label: 'En cours de traitement' },
  eligible_pending_lca: { severity: 'info', label: 'En cours de traitement' },
  not_assessed: { severity: 'info', label: 'En cours de traitement' },
  not_eligible: { severity: 'error', label: 'Non-Eligible' },
};

export const PENDING_CODE_MESSAGE =
  'Vous allez recevoir votre code individuel par courrier électronique à l’adresse email FranceConnect dans les prochains jours. Si vous n’avez pas reçu votre code dans les 72 heures, vous pourrez le retrouver dans votre espace en FC.';

const NOT_ASSESSED_MESSAGE =
  'Votre demande est en cours de traitement. À ce stade, nous ne sommes pas en mesure de déterminer si cette personne est éligible au pass Sport.';

const verdictMessage = (b: BeneficiaryResult): ReactNode => {
  switch (b.verdict) {
    case 'eligible_confirmed':
      // Rows written before the code was stored carry a verdict but no code — for those,
      // the email stays the only place it can be read.
      return b.code ? (
        <>
          Le code pass Sport suivant est disponible&nbsp;: <strong>{b.code}</strong>.
        </>
      ) : (
        PENDING_CODE_MESSAGE
      );
    case 'eligible_pending_lca':
    case 'eligible_pending':
      return PENDING_CODE_MESSAGE;
    case 'not_assessed':
      return NOT_ASSESSED_MESSAGE;
    case 'not_eligible':
      return (
        <>
          Vos informations ont été trouvées, mais vous ne remplissez pas les conditions requises
          pour bénéficier du pass Sport cette année. Si vous pensez qu’il s’agit d’une erreur, nous
          vous invitons à vérifier votre situation auprès de l’organisme concerné. Consultez la{' '}
          <Link href="/v2/une-question" className="fr-link">
            FAQ
          </Link>
          .
        </>
      );
    case 'eligible_confirmed_but_email_not_matching':
      return 'Aucun résultat n’est disponible pour le moment pour cette personne.';
  }
};

// Rendered into the Card's `footer` slot rather than alongside verdictMessage in `desc`: DownloadLink
// renders a <div>, which desc's own <p> wrapper cannot contain.
// /api/france-connect/pdf re-derives the allocataire's own identity from the FranceConnect
// session; for an 'enfant' it instead re-derives it from application_results_by_sub, keyed by
// the code so the route knows which of the caller's own children to serve — hence the `code`
// query param here for 'enfant' rows, and none for 'self'.
const downloadLink = (b: BeneficiaryResult): ReactNode | undefined => {
  if (b.verdict !== 'eligible_confirmed' || !b.code) {
    return undefined;
  }
  const href =
    b.source === 'self' ? '/api/france-connect/pdf' : `/api/france-connect/pdf?code=${b.code}`;
  return (
    <div className="fr-grid-row fr-grid-row--right">
      <DownloadLink
        details="PDF ~ 582 kB"
        label="Télécharger le code"
        href={href}
        filename={`Pass Sport ${b.givenName}.pdf`}
      />
    </div>
  );
};

const StatusBadgeFor = ({ severity, label }: StatusDisplay) => (
  <p className="fr-mb-0">
    {/* Badge defaults to rendering as a <p>, which this wrapping <p> can't contain. */}
    <Badge as="span" severity={severity}>
      {label}
    </Badge>
  </p>
);

export const StatusBadge = ({ verdict }: { verdict: Verdict }) => (
  <StatusBadgeFor {...STATUS_DISPLAY_BY_VERDICT[verdict]} />
);

export const ProcessingBadge = () => (
  <StatusBadgeFor severity="info" label="En cours de traitement" />
);

interface Props {
  beneficiaries: BeneficiaryResult[];
  allocataireIdentity: AllocataireIdentity;
  // Submission/processing date of the underlying job, e.g. "Demande soumise le 12/03/2024
  // à 10:23:45." — rendered as a subtitle under the section title rather than as a standalone
  // paragraph further down the page, so it reads as part of "Résultat de votre demande" instead
  // of a disconnected footnote.
  jobInfo?: ReactNode;
}

export default function BeneficiaryRecap({ beneficiaries, allocataireIdentity, jobInfo }: Props) {
  if (beneficiaries.length === 0) {
    return (
      <div className="fr-alert fr-alert--info fr-mb-3w">
        <h2 className="fr-alert__title">Demande enregistrée</h2>
        <p>
          Après vérification, nous n’avons pas retrouvé vos informations dans les bases de données
          des bénéficiaires, avec les informations saisies. Consultez la{' '}
          <Link href="/v2/une-question" className="fr-link">
            FAQ
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <section className="fr-mb-3w">
      <h2 className="fr-h4 fr-mb-1w">Résultat de votre demande</h2>
      {jobInfo && <p className="fr-text--sm fr-mb-3w">{jobInfo}</p>}

      {beneficiaries.map((b, i) => (
        <Card
          key={`${b.source}-${i}`}
          className="fr-mb-6w"
          border
          title={who(b, allocataireIdentity)}
          titleAs="h3"
          start={<StatusBadge verdict={b.verdict} />}
          desc={verdictMessage(b)}
          classes={{ desc: 'fr-text--md' }}
          footer={downloadLink(b)}
        />
      ))}
    </section>
  );
}
