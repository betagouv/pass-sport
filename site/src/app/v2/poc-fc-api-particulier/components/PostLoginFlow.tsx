'use client';

// Reversed-flow post-login orchestrator. Rendered once FranceConnect has
// authenticated the user. Two stages, driven by the server session:
// - not yet collected (or user hit "Re-saisir") -> the aides + commune info form,
//   which calls API Particulier on confirm;
// - collected -> the eligibility step (LCA) plus the "Je ne peux pas utiliser
//   FranceConnect" alternative, with the selected aides preselected.

import { useState } from 'react';
import Button from '@codegouvfr/react-dsfr/Button';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { BeneficiaryCandidate } from '@/app/services/lca-bridge';
import EligibilitySection from './EligibilitySection';
import PostLoginInfoForm from './PostLoginInfoForm';
import NoFranceConnectSection from './NoFranceConnectSection';

interface Props {
  collected: boolean;
  candidates: BeneficiaryCandidate[];
  residenceInsee: string;
  aides: ALLOWANCE[];
}

export default function PostLoginFlow({ collected, candidates, residenceInsee, aides }: Props) {
  const [reediting, setReediting] = useState(false);

  if (!collected || reediting) {
    return (
      <>
        <h2 className="fr-h4 fr-mb-2w">Vos informations</h2>
        <p className="fr-mb-2w">
          Indiquez les aides dont vous bénéficiez et votre commune de résidence pour vérifier votre
          éligibilité.
        </p>
        <PostLoginInfoForm
          initialAides={aides}
          initialResidenceInsee={residenceInsee}
          onCancel={collected ? () => setReediting(false) : undefined}
          onSuccess={() => setReediting(false)}
        />

        <NoFranceConnectSection preselectedAllowances={aides} />
      </>
    );
  }

  return (
    <div>
      <Button
        priority="secondary"
        type="button"
        className="fr-mb-3w"
        onClick={() => setReediting(true)}
      >
        Re-saisir les aides / la commune
      </Button>

      <h2 className="fr-h4 fr-mt-3w">Éligibilité pass Sport (LCA)</h2>
      <EligibilitySection candidates={candidates} residenceInsee={residenceInsee} />

      <NoFranceConnectSection preselectedAllowances={aides} />
    </div>
  );
}
