import { listBeneficiaryCandidates, stripReasonsUnlessLocal } from '@/app/services/lca-bridge';
import type { ApiParticulierResourceResult } from '@/app/services/api-particulier';
import type { FranceConnectIdentity } from '@/app/services/france-connect';
import type { QuotientFamilialData } from '@/types/ApiParticulier';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

// Ages are computed at AGE_REFERENCE_DATE (2026-12-31).
const identity: FranceConnectIdentity = {
  sub: 'fc-user',
  given_name: 'Marie Claire',
  family_name: 'DURAND',
  birthdate: '2000-06-01', // 26 ans
};

const row = (
  resource: string,
  data: unknown,
  childIndex?: number,
): ApiParticulierResourceResult => ({
  resource,
  label: resource,
  httpStatus: 200,
  success: true,
  data: data as ApiParticulierResourceResult['data'],
  childIndex,
});

const qfRow = (enfants: QuotientFamilialData['enfants']) =>
  row('dss.quotient_familial_identite', {
    allocataires: [],
    enfants,
    adresse: {},
    quotient_familial: { valeur: 500, annee: 2026, mois: 1 },
  } as QuotientFamilialData);

describe('listBeneficiaryCandidates reasons', () => {
  it('justifies AAH and CROUS for the connected user', () => {
    const [self] = listBeneficiaryCandidates(identity, [
      row('dss.allocation_adulte_handicape_identite', { est_beneficiaire: true }),
      row('cnous.etudiant_boursier_identite', { statut_boursier: { est_boursier: true } }),
    ]);

    expect(self.eligibilities).toEqual([ALLOWANCE.AAH, ALLOWANCE.CROUS]);
    expect(self.reasons).toEqual([
      'AAH : bénéficiaire selon API Particulier, 26 ans (16-30 ans)',
      'CROUS : boursier selon API Particulier, 26 ans (< 28 ans)',
    ]);
  });

  it('justifies a per-child ARS/AEEH right confirmed by API Particulier', () => {
    const enfant = { nom_naissance: 'DURAND', prenoms: 'LEO', date_naissance: '2012-06-01' }; // 14 ans
    const candidates = listBeneficiaryCandidates(identity, [
      qfRow([enfant]),
      row('dss.allocation_rentree_scolaire_identite', { status: 'ouvrant_droit' }, 0),
      row('dss.allocation_enfant_handicape_identite', { status: 'ouvrant_droit' }, 0),
    ]);

    const child = candidates.find((c) => c.source === 'enfant');
    expect(child?.eligibilities).toEqual([ALLOWANCE.ARS, ALLOWANCE.AEEH]);
    expect(child?.reasons).toEqual([
      'ARS : droit confirmé par API Particulier, 14 ans (12-17 ans)',
      'AEEH : droit confirmé par API Particulier, 14 ans (6-19 ans)',
    ]);
  });

  it('justifies the fallbacks when no usable per-child row exists', () => {
    const enfant = { nom_naissance: 'DURAND', prenoms: 'ZOE', date_naissance: '2012-06-01' };
    const candidates = listBeneficiaryCandidates(identity, [
      qfRow([enfant]),
      // Parent-level AEEH row: allocataire -> AEEH fallback for the child.
      row('dss.allocation_enfant_handicape_identite', { status: 'allocataire' }),
    ]);

    const child = candidates.find((c) => c.source === 'enfant');
    expect(child?.reasons).toEqual([
      'ARS : 14 ans (12-17 ans), pas de réponse API Particulier exploitable',
      'AEEH : parent allocataire AEEH selon API Particulier, 14 ans (6-19 ans)',
    ]);
  });

  it('strips the reasons outside local, keeps them on local', () => {
    const candidates = listBeneficiaryCandidates(identity, [
      row('dss.allocation_adulte_handicape_identite', { est_beneficiaire: true }),
    ]);
    expect(candidates[0].reasons).not.toHaveLength(0);

    const deployed = stripReasonsUnlessLocal(candidates, false);
    expect(deployed[0].reasons).toEqual([]);
    // Eligibilities themselves are untouched.
    expect(deployed[0].eligibilities).toEqual(candidates[0].eligibilities);

    expect(stripReasonsUnlessLocal(candidates, true)).toEqual(candidates);
  });

  it('always pairs one reason with one eligibility', () => {
    const enfants = [
      { nom_naissance: 'DURAND', prenoms: 'LEO', date_naissance: '2012-06-01' },
      { nom_naissance: 'DURAND', prenoms: 'TOM', date_naissance: '2024-06-01' }, // 2 ans: rien
    ];
    const candidates = listBeneficiaryCandidates(identity, [qfRow(enfants)]);

    for (const candidate of candidates) {
      expect(candidate.reasons).toHaveLength(candidate.eligibilities.length);
    }
  });
});
