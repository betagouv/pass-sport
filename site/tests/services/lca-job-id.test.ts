/**
 * @jest-environment node
 */

import { lcaJobId, type LcaJobData } from '@/app/services/eligibility-job';
import { CAISSE } from '@/utils/eligibility-test';

const job = (overrides: Partial<LcaJobData> = {}): LcaJobData => ({
  aide: 'QF',
  caisse: CAISSE.CAF,
  beneficiary: { lastname: 'DUPOND', firstname: 'MANON', birthdate: '2011-01-01' },
  allocataire: { family_name: 'DUPOND', given_name: 'BABETTE' },
  residenceInsee: '05024',
  lcaStatus: 'confirmed',
  passSportCode: '24-IIII-IIII',
  email: 'allocataire@example.test',
  history: [],
  ...overrides,
});

describe('lcaJobId', () => {
  it('is stable across resubmissions of the same request', () => {
    expect(lcaJobId(job())).toEqual(lcaJobId(job()));
  });

  it('ignores casing and surrounding whitespace', () => {
    const noisy = job({
      beneficiary: { lastname: '  dupond ', firstname: 'Manon', birthdate: '2011-01-01' },
    });

    expect(lcaJobId(noisy)).toEqual(lcaJobId(job()));
  });

  it('ignores the outcome: the same request keeps its id whatever LCA answered', () => {
    const refused = job({ lcaStatus: 'not_found', passSportCode: null, email: null });

    expect(lcaJobId(refused)).toEqual(lcaJobId(job()));
  });

  it('separates two beneficiaries of the same household', () => {
    const sibling = job({
      beneficiary: { lastname: 'DUPOND', firstname: 'LUCAS', birthdate: '2013-05-02' },
    });

    expect(lcaJobId(sibling)).not.toEqual(lcaJobId(job()));
  });

  it('separates the routes, so a refusal on one does not lock the others', () => {
    expect(lcaJobId(job({ aide: 'AEEH' }))).not.toEqual(lcaJobId(job()));
  });

  it('is not reversible into an identity', () => {
    const id = lcaJobId(job());

    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain('DUPOND');
  });
});
