'use client';

// POC step 3: per-beneficiary outcome of the automatic LCA processing. Code
// delivered → success alert with the code; otherwise the API Particulier
// fallback verdict decides between "eligible, contact us" and "not eligible".
// The search/confirm mechanics are never surfaced to the user.

import Link from 'next/link';
import { IS_LOCAL_ENV } from '@/app/constants/env';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import {
  BatchEligibilityResponse,
  BeneficiaryResult,
} from '@/app/v2/api/poc-fc-api-particulier/eligibility/types';

const ALLOWANCE_LABELS: Partial<Record<ALLOWANCE, string>> = {
  [ALLOWANCE.AAH]: 'AAH',
  [ALLOWANCE.AEEH]: 'AEEH',
  [ALLOWANCE.ARS]: 'ARS',
  [ALLOWANCE.CROUS]: 'bourse CROUS',
};

const eligibilityLabel = (eligibilities: ALLOWANCE[]): string =>
  eligibilities.map((allowance) => ALLOWANCE_LABELS[allowance] ?? allowance).join(', ');

function ContactLink() {
  return (
    <Link className="fr-btn fr-btn--secondary fr-btn--sm fr-mt-1w" href="/v2/une-question">
      Nous contacter
    </Link>
  );
}

// Debug aid: the API Particulier justification. Local environment only.
function Reasons({ reasons }: { reasons: string[] }) {
  if (!IS_LOCAL_ENV || reasons.length === 0) return null;
  return (
    <ul className="fr-text--xs fr-mb-0">
      {reasons.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  );
}

function ResultAlert({ result }: { result: BeneficiaryResult }) {
  const { candidate, status, confirm, apiParticulierEligible } = result;
  const name = `${candidate.firstname} ${candidate.lastname}`;

  if (status === 'confirmed') {
    return (
      <div className="fr-alert fr-alert--success fr-alert--sm fr-mb-2w">
        <p>
          <strong>{name}</strong> : code pass Sport obtenu — <strong>{confirm?.[0]?.id_psp}</strong>
        </p>
        <Reasons reasons={candidate.reasons} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="fr-alert fr-alert--warning fr-alert--sm fr-mb-2w">
        <p>
          <strong>{name}</strong> : la vérification n’a pas abouti. Réessayez plus tard.
        </p>
        {apiParticulierEligible && (
          <>
            <p>
              D’après vos données ({eligibilityLabel(candidate.eligibilities)}), cette personne
              semble éligible : contactez-nous si le problème persiste.
            </p>
            <ContactLink />
          </>
        )}
        <Reasons reasons={candidate.reasons} />
      </div>
    );
  }

  // not_found
  if (apiParticulierEligible) {
    return (
      <div className="fr-alert fr-alert--info fr-alert--sm fr-mb-2w">
        <p>
          <strong>{name}</strong> : éligible d’après vos données (
          {eligibilityLabel(candidate.eligibilities)}), mais nous n’avons pas pu délivrer le code
          automatiquement.
        </p>
        <ContactLink />
        <Reasons reasons={candidate.reasons} />
      </div>
    );
  }

  return (
    <div className="fr-alert fr-alert--info fr-alert--sm fr-mb-2w">
      <p>
        <strong>{name}</strong> : non éligible d’après les données récupérées.
      </p>
      <Reasons reasons={candidate.reasons} />
    </div>
  );
}

interface Props {
  batch: BatchEligibilityResponse;
}

export default function EligibilitySection({ batch }: Props) {
  if (batch.results.length === 0) {
    return (
      <div className="fr-alert fr-alert--warning fr-alert--sm fr-mb-2w">
        <p>Aucun bénéficiaire éligible n’a été identifié d’après les données récupérées.</p>
      </div>
    );
  }

  return (
    <>
      {batch.results.map((result) => (
        <ResultAlert
          key={`${result.candidate.firstname}-${result.candidate.lastname}-${result.candidate.birthdate}`}
          result={result}
        />
      ))}
    </>
  );
}
