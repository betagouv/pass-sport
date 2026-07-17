// Response shapes of the batch eligibility route, shared with the client
// components (types only — safe to import from 'use client' files).

import { BeneficiaryCandidate } from '@/app/services/lca-bridge';
import { ConfirmResponseBodyItem } from 'types/EligibilityTest';

export type BeneficiaryStatus = 'confirmed' | 'not_found' | 'error';

export interface BeneficiaryResult {
  // Reasons stripped outside local (stripReasonsUnlessLocal).
  candidate: BeneficiaryCandidate;
  status: BeneficiaryStatus;
  // Present when status === 'confirmed'; allocataire.matricule stripped.
  confirm?: ConfirmResponseBodyItem[];
  // API Particulier fallback verdict, set when status !== 'confirmed': true when
  // candidate.eligibilities is non-empty (AAH/CROUS for the connected user,
  // ARS/AEEH for children) per the calls made at /collect.
  apiParticulierEligible?: boolean;
}

export interface BatchEligibilityResponse {
  results: BeneficiaryResult[];
  // API Particulier assessment for every gathered person — fallback display.
  eligibilitySummary: BeneficiaryCandidate[];
}
