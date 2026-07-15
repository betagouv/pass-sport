'use client';

// POC step 3: summary of the API Particulier per-child checks — shows which
// children are eligible to the pass Sport. The LCA search/confirm UI (beneficiary
// picker + code retrieval) has been removed from this flow.

import { BeneficiaryCandidate } from '@/app/services/lca-bridge';

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

  // Children flagged eligible by the API Particulier per-child checks (ARS/AEEH).
  const eligibleChildren = candidates.filter(
    (candidate) => candidate.source === 'enfant' && candidate.eligibilities.length > 0,
  );

  if (eligibleChildren.length === 0) {
    return null;
  }

  return (
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
    </div>
  );
}
