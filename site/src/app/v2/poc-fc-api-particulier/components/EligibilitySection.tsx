'use client';

// POC step 3: summary of the API Particulier per-child checks — shows which
// children are eligible to the pass Sport. The LCA search/confirm UI (beneficiary
// picker + code retrieval) has been removed from this flow.

import { BeneficiaryCandidate } from '@/app/services/lca-bridge';
import { IS_LOCAL_ENV } from '@/app/constants/env';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

interface Props {
  candidates: BeneficiaryCandidate[];
}

export default function EligibilitySection({ candidates }: Props) {
  if (candidates.length === 0) {
    return (
      <div className="fr-alert fr-alert--warning fr-alert--sm">
        <p>
          Nous n’avons pas pu récupérer vos informations. Réessayez plus tard ou contactez-nous.
        </p>
      </div>
    );
  }

  // Connected user flagged eligible through the CNOUS check (boursier CROUS).
  const selfCrous = candidates.find(
    (candidate) => candidate.source === 'self' && candidate.eligibilities.includes(ALLOWANCE.CROUS),
  );

  // Children flagged eligible by the API Particulier per-child checks (ARS/AEEH).
  const eligibleChildren = candidates.filter(
    (candidate) => candidate.source === 'enfant' && candidate.eligibilities.length > 0,
  );

  if (!selfCrous && eligibleChildren.length === 0) {
    return null;
  }

  return (
    <>
      {selfCrous && (
        <div className="fr-alert fr-alert--success fr-alert--sm fr-mb-2w">
          <p>
            Vous êtes éligible au pass Sport :{' '}
            <strong>
              {selfCrous.firstname} {selfCrous.lastname}
            </strong>{' '}
            (boursier CROUS)
          </p>
          {/* Debug aid: the API Particulier justification. Local environment only. */}
          {IS_LOCAL_ENV && selfCrous.reasons.length > 0 && (
            <ul className="fr-text--xs fr-mb-0">
              {selfCrous.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {eligibleChildren.length > 0 && (
        <div className="fr-alert fr-alert--success fr-alert--sm fr-mb-2w">
          <p>
            {eligibleChildren.length > 1
              ? 'Enfants éligibles au pass Sport : '
              : 'Enfant éligible au pass Sport : '}
            <strong>
              {eligibleChildren
                .map((candidate) => `${candidate.firstname} ${candidate.lastname}`)
                .join(', ')}
            </strong>
          </p>
          {/* Debug aid: the API Particulier justification behind each eligibility.
              Local environment only. */}
          {IS_LOCAL_ENV && (
            <ul className="fr-text--xs fr-mb-0">
              {eligibleChildren.flatMap((candidate) =>
                candidate.reasons.map((reason) => (
                  <li key={`${candidate.firstname}-${candidate.lastname}-${reason}`}>
                    {candidate.firstname} — {reason}
                  </li>
                )),
              )}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
